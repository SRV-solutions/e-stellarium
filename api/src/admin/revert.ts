import { isDeepStrictEqual } from "node:util";
import type { Transaction } from "sequelize";
import { AuditLog, Role, RolePermission, User } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";
import { HttpError } from "../lib/errors.js";
import { PERMISSIONS, type Permission } from "../lib/permissions.js";
import type { AuditContext } from "../lib/audit.js";
import { changeUserRole, deleteUser, restoreUser } from "./users.js";
import { setRolePermissions } from "./roles.js";

// Cómo se revierte cada acción reversible: qué valor tiene hoy, y cómo se vuelve al "before".
// Se vuelve con las mismas funciones del cambio original, así valen las mismas protecciones
// (tu propio rol, el último super admin) y el registro nuevo queda enlazado con reverts_id.
type Reverter = {
  current: (t: Transaction, log: AuditLog) => Promise<unknown>;
  undo: (t: Transaction, ctx: AuditContext, log: AuditLog) => Promise<unknown>;
};

type Values = Record<string, unknown>;

async function userOf(t: Transaction, log: AuditLog) {
  const user = await User.findByPk(log.targetId!, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "El usuario de ese registro ya no existe.");
  return user;
}

const REVERTERS: Record<string, Reverter> = {
  "user.role_update": {
    current: async (t, log) => {
      const user = await userOf(t, log);
      return { role: (await Role.findByPk(user.roleId, { transaction: t }))!.key };
    },
    undo: (t, ctx, log) =>
      changeUserRole(t, ctx, log.targetId!, (log.before as Values).role as RoleKey, { revertsId: log.id }),
  },
  "role.update": {
    current: async (t, log) => {
      const role = await Role.findOne({ where: { key: log.targetId! }, transaction: t, lock: t.LOCK.UPDATE });
      const rows = await RolePermission.findAll({ where: { roleId: role!.id }, transaction: t });
      return { permissions: PERMISSIONS.filter((p) => rows.some((r) => r.permissionKey === p)) };
    },
    undo: (t, ctx, log) =>
      setRolePermissions(t, ctx, log.targetId!, (log.before as Values).permissions as Permission[], {
        revertsId: log.id,
      }),
  },
  "user.delete": {
    current: async (t, log) => ({ deletedAt: (await userOf(t, log)).deletedAt?.toISOString() ?? null }),
    undo: (t, ctx, log) => restoreUser(t, ctx, log.targetId!, { revertsId: log.id }),
  },
  "user.restore": {
    current: async (t, log) => ({ deletedAt: (await userOf(t, log)).deletedAt?.toISOString() ?? null }),
    undo: (t, ctx, log) => deleteUser(t, ctx, log.targetId!, { revertsId: log.id }),
  },
};

// confirm: true revierte aunque el valor actual ya no sea el que dejó el registro
export async function revertAudit(t: Transaction, ctx: AuditContext, id: number, confirm: boolean) {
  // Se bloquea el registro original (leerlo con FOR UPDATE no lo modifica): dos reversiones del mismo
  // registro al mismo tiempo van en fila, y la segunda ya ve la primera
  const log = await AuditLog.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
  if (!log) throw new HttpError(404, "No existe ese registro.");

  const reverter = REVERTERS[log.action];
  if (!log.reversible || !reverter) throw new HttpError(409, "Ese registro no se puede revertir.");

  const revertedBy = await AuditLog.findOne({ where: { revertsId: log.id }, transaction: t });
  if (revertedBy) throw new HttpError(409, `Ese registro ya se revirtió (registro #${revertedBy.id}).`);

  // Control de conflicto: si alguien lo cambió después, no se revierte a ciegas
  const current = await reverter.current(t, log);
  if (isDeepStrictEqual(current, log.before)) {
    throw new HttpError(409, "Ya está como antes de ese cambio: no hay nada que revertir.");
  }
  if (!isDeepStrictEqual(current, log.after) && !confirm) {
    throw new HttpError(409, "Lo cambiaron después de este registro. Confirmá para revertir igual.", {
      conflict: { before: log.before, recorded: log.after, current },
    });
  }

  const result = await reverter.undo(t, ctx, log);
  const revert = await AuditLog.findOne({ where: { revertsId: log.id }, transaction: t });
  return { revertId: revert!.id, result };
}
