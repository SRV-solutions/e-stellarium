import type { Transaction } from "sequelize";
import { Role, RolePermission } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";
import { HttpError } from "../lib/errors.js";
import { PERMISSIONS, type Permission } from "../lib/permissions.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import type { ChangeOptions } from "./users.js";

// Los roles con sus permisos, para la pantalla del panel. El super admin los tiene todos y no se edita
export async function listRoles() {
  const roles = await Role.findAll({ order: [["id", "ASC"]] });
  const rows = await RolePermission.findAll();
  return roles.map((role) => ({
    key: role.key,
    name: role.name,
    editable: role.key !== "super_admin",
    permissions:
      role.key === "super_admin"
        ? [...PERMISSIONS]
        : PERMISSIONS.filter((p) => rows.some((r) => r.roleId === role.id && r.permissionKey === p)),
  }));
}

export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value) || !value.every((p) => typeof p === "string")) {
    throw new HttpError(400, "permissions tiene que ser una lista de permisos.");
  }
  const unknown = value.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (unknown.length) throw new HttpError(400, `Permisos desconocidos: ${unknown.join(", ")}`);
  // Sin repetidos y en el orden de PERMISSIONS, así la bitácora compara listas iguales
  return PERMISSIONS.filter((p) => value.includes(p));
}

// Reemplaza la lista entera de permisos de un rol
export async function setRolePermissions(
  t: Transaction,
  ctx: AuditContext,
  key: string,
  permissions: Permission[],
  options: ChangeOptions = {}
) {
  if (key === "super_admin") throw new HttpError(403, "El rol super admin tiene todos los permisos y no se edita.");
  // Bloquear el rol pone en fila a dos cambios al mismo tiempo sobre el mismo rol
  const role = await Role.findOne({ where: { key }, transaction: t, lock: t.LOCK.UPDATE });
  if (!role) throw new HttpError(404, "No existe ese rol.");

  const rows = await RolePermission.findAll({ where: { roleId: role.id }, transaction: t });
  const before = PERMISSIONS.filter((p) => rows.some((r) => r.permissionKey === p));
  const result = { key: role.key as RoleKey, name: role.name, editable: true, permissions };
  if (before.join() === permissions.join()) return result;

  const removed = rows.filter((r) => !permissions.includes(r.permissionKey));
  for (const row of removed) await row.destroy({ transaction: t });
  const added = permissions.filter((p) => !before.includes(p));
  for (const permissionKey of added) await RolePermission.create({ roleId: role.id, permissionKey }, { transaction: t });

  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "role.update",
    targetType: "role",
    targetId: role.key,
    before: { permissions: before },
    after: { permissions },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return result;
}
