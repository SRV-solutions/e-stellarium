import { isDeepStrictEqual } from "node:util";
import type { Transaction } from "sequelize";
import { AuditLog, Role, RolePermission, User } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";
import { HttpError } from "../lib/errors.js";
import { PERMISSIONS, type Permission } from "../lib/permissions.js";
import type { AuditContext } from "../lib/audit.js";
import { changeUserRole, deleteUser, restoreUser } from "./users.js";
import { setRolePermissions } from "./roles.js";
import {
  currentItemFields,
  currentSettings,
  updateSettings,
  updateShopItem,
  type ItemChanges,
  type SettingValues,
} from "./economy.js";
import {
  currentQuestionState,
  currentVersionStatus,
  republishQuestion,
  setTeacherCourses,
  teacherCourses,
  unapproveQuestion,
  unpublishQuestion,
  unrejectQuestion,
} from "./content.js";
import { activeCourses, setStudentCourses } from "./enrollments.js";
import { couponVoided, unvoidCoupon, voidCoupon } from "./coupons.js";
import { currentPrizeGlints, undoPrizeGlints } from "./ranking.js";

// Dar y sacar cursos se revierten igual: el alumno vuelve a tener los cursos que tenía antes
const coursesReverter = (): Reverter => ({
  current: async (t, log) => ({ courses: await activeCourses(log.targetId!, t) }),
  undo: (t, ctx, log) =>
    setStudentCourses(t, ctx, log.targetId!, (log.before as Values).courses as string[], "enrollment.grant", {
      revertsId: log.id,
    }),
});

// Cómo se revierte cada acción reversible: qué valor tiene hoy, y cómo se vuelve al "before".
// Se vuelve con las mismas funciones del cambio original, así valen las mismas protecciones
// (tu propio rol, el último super admin) y el registro nuevo queda enlazado con reverts_id.
// compared: qué partes del registro se comparan con el valor actual (por defecto, before y after enteros)
type Reverter = {
  current: (t: Transaction, log: AuditLog) => Promise<unknown>;
  undo: (t: Transaction, ctx: AuditContext, log: AuditLog) => Promise<unknown>;
  compared?: (log: AuditLog) => { before: unknown; after: unknown };
};

type Values = Record<string, unknown>;

async function userOf(t: Transaction, log: AuditLog) {
  const user = await User.findByPk(log.targetId!, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "El usuario de ese registro ya no existe.");
  return user;
}

const REVERTERS: Record<string, Reverter> = {
  "enrollment.grant": coursesReverter(),
  "enrollment.revoke": coursesReverter(),
  // Un cupón emitido se revierte anulándolo, solo si no se usó (voidCoupon da 409 si ya se usó)
  "coupon.issue": {
    current: (t, log) => couponVoided(t, log.targetId!),
    compared: () => ({ before: { voided: true }, after: { voided: false } }),
    undo: (t, ctx, log) =>
      voidCoupon(t, ctx, log.targetId!, "Se revirtió la emisión desde la bitácora", { revertsId: log.id }),
  },
  // Una anulación se revierte y el cupón vuelve a servir (se compara sin el motivo)
  "coupon.void": {
    current: (t, log) => couponVoided(t, log.targetId!),
    compared: (log) => ({ before: log.before, after: { voided: (log.after as Values).voided } }),
    undo: (t, ctx, log) => unvoidCoupon(t, ctx, log.targetId!, log.id),
  },
  // Un premio de destellos se saca si el alumno todavía los tiene (si ya gastó, 409)
  "ranking.glints_award": {
    current: (t, log) => currentPrizeGlints(t, log.targetId!, (log.after as Values).requestId as string),
    compared: (log) => ({ before: log.before, after: { glints: (log.after as Values).glints } }),
    undo: (t, ctx, log) => undoPrizeGlints(t, ctx, log.targetId!, (log.after as Values).requestId as string, log.id),
  },
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
  // Los valores que cambió ese registro vuelven a como estaban (los demás no se tocan)
  "economy.update": {
    current: (t, log) => currentSettings(t, Object.keys(log.after as Values)),
    undo: (t, ctx, log) => updateSettings(t, ctx, log.before as SettingValues, { revertsId: log.id }),
  },
  // El horario y la receta de los desafíos: igual que la economía (valen las mismas validaciones)
  "challenge.update": {
    current: (t, log) => currentSettings(t, Object.keys(log.after as Values)),
    undo: (t, ctx, log) => updateSettings(t, ctx, log.before as SettingValues, { revertsId: log.id }),
  },
  "shop.update": {
    current: (t, log) => currentItemFields(t, log.targetId!, Object.keys(log.after as Values)),
    undo: (t, ctx, log) => updateShopItem(t, ctx, log.targetId!, log.before as ItemChanges, { revertsId: log.id }),
  },
  // Revertir un ítem nuevo lo retira: no se borra, porque alguien pudo haberlo comprado
  "shop.create": {
    current: (t, log) => currentItemFields(t, log.targetId!, ["active"]),
    compared: (log) => ({ before: log.before, after: { active: (log.after as Values).active } }),
    undo: (t, ctx, log) => updateShopItem(t, ctx, log.targetId!, { active: false }, { revertsId: log.id }),
  },
  // ---------- Contenido ----------
  // Aprobar se revierte solo si nadie jugó esa versión (si no, 409: hay que despublicarla)
  "content.approve": {
    current: (t, log) => currentQuestionState(t, log.targetId!),
    undo: (t, ctx, log) =>
      unapproveQuestion(
        t,
        ctx,
        log.targetId!,
        log.after as { status: string; version: number },
        log.before as { status: string; version: number | null },
        log.id
      ),
  },
  // El rechazo: la versión vuelve a esperar revisión (se compara solo el estado, no el comentario)
  "content.reject": {
    current: (t, log) => currentVersionStatus(t, log.targetId!, (log.after as Values).version as number),
    compared: (log) => {
      const { comment: _comment, ...after } = log.after as Values;
      return { before: log.before, after };
    },
    undo: (t, ctx, log) => unrejectQuestion(t, ctx, log.targetId!, (log.after as Values).version as number, log.id),
  },
  "content.unpublish": {
    current: async (t, log) => ({ status: (await currentQuestionState(t, log.targetId!)).status }),
    undo: (t, ctx, log) => republishQuestion(t, ctx, null, log.targetId!, { revertsId: log.id }),
  },
  "content.republish": {
    current: async (t, log) => ({ status: (await currentQuestionState(t, log.targetId!)).status }),
    undo: (t, ctx, log) => unpublishQuestion(t, ctx, null, log.targetId!, { revertsId: log.id }),
  },
  "teacher.courses_update": {
    current: async (t, log) => ({ courses: await teacherCourses(log.targetId!, t) }),
    undo: (t, ctx, log) =>
      setTeacherCourses(t, ctx, log.targetId!, (log.before as Values).courses as string[], { revertsId: log.id }),
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
  const { before, after } = reverter.compared?.(log) ?? { before: log.before, after: log.after };
  if (isDeepStrictEqual(current, before)) {
    throw new HttpError(409, "Ya está como antes de ese cambio: no hay nada que revertir.");
  }
  if (!isDeepStrictEqual(current, after) && !confirm) {
    throw new HttpError(409, "Lo cambiaron después de este registro. Confirmá para revertir igual.", {
      conflict: { before, recorded: after, current },
    });
  }

  const result = await reverter.undo(t, ctx, log);
  const revert = await AuditLog.findOne({ where: { revertsId: log.id }, transaction: t });
  return { revertId: revert!.id, result };
}
