import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Role, User } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";

// Cambiar el rol, dar de baja y restaurar. Cada función escribe su registro en la bitácora dentro de
// la misma transacción. La reversión desde la bitácora usa estas mismas funciones (y sus protecciones).

export type ChangeOptions = { revertsId?: number };

export function adminUser(user: User, role: RoleKey) {
  return { id: user.id, email: user.email, name: user.name, alias: user.alias, role, deletedAt: user.deletedAt };
}

async function lockUser(t: Transaction, userId: string) {
  const user = await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "No existe ese usuario.");
  return user;
}

async function roleKey(t: Transaction, roleId: number): Promise<RoleKey> {
  return (await Role.findByPk(roleId, { transaction: t }))!.key;
}

// Antibloqueo: no se puede dejar el sistema sin super admins activos. Bloquea a todos los super admin,
// así dos pedidos al mismo tiempo no pueden sacar cada uno a uno de los dos últimos.
async function assertNotLastSuperAdmin(t: Transaction, user: User, message: string) {
  const supers = await sequelize.query<{ id: string }>(
    `SELECT u.id FROM users u
      WHERE u.role_id = (SELECT id FROM roles WHERE key = 'super_admin') AND u.deleted_at IS NULL
      FOR UPDATE`,
    { type: QueryTypes.SELECT, transaction: t }
  );
  if (supers.length === 1 && supers[0].id === user.id) throw new HttpError(409, message);
}

export async function changeUserRole(
  t: Transaction,
  ctx: AuditContext,
  userId: string,
  newKey: RoleKey,
  options: ChangeOptions = {}
) {
  if (ctx.actorId === userId) throw new HttpError(403, "No podés cambiar tu propio rol.");
  const newRole = await Role.findOne({ where: { key: newKey }, transaction: t });
  if (!newRole) throw new HttpError(400, "Ese rol no existe.");

  const user = await lockUser(t, userId);
  const oldKey = await roleKey(t, user.roleId);
  if (oldKey === newKey) return adminUser(user, oldKey); // nada que cambiar ni registrar

  if (oldKey === "super_admin" && !user.deletedAt) {
    await assertNotLastSuperAdmin(t, user, "Es el último super admin: primero dale ese rol a otra persona.");
  }

  await user.update({ roleId: newRole.id }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "user.role_update",
    targetType: "user",
    targetId: user.id,
    before: { role: oldKey },
    after: { role: newKey },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return adminUser(user, newKey);
}

export async function deleteUser(t: Transaction, ctx: AuditContext, userId: string, options: ChangeOptions = {}) {
  if (ctx.actorId === userId) throw new HttpError(403, "No podés darte de baja a vos mismo.");
  const user = await lockUser(t, userId);
  if (user.deletedAt) throw new HttpError(409, "Ese usuario ya está dado de baja.");

  const key = await roleKey(t, user.roleId);
  if (key === "super_admin") {
    await assertNotLastSuperAdmin(t, user, "Es el último super admin: no se puede dar de baja.");
  }

  await user.update({ deletedAt: new Date() }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "user.delete",
    targetType: "user",
    targetId: user.id,
    before: { deletedAt: null },
    after: { deletedAt: user.deletedAt!.toISOString() },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return adminUser(user, key);
}

export async function restoreUser(t: Transaction, ctx: AuditContext, userId: string, options: ChangeOptions = {}) {
  const user = await lockUser(t, userId);
  if (!user.deletedAt) throw new HttpError(409, "Ese usuario no está dado de baja.");

  const deletedAt = user.deletedAt.toISOString();
  await user.update({ deletedAt: null }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "user.restore",
    targetType: "user",
    targetId: user.id,
    before: { deletedAt },
    after: { deletedAt: null },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return adminUser(user, await roleKey(t, user.roleId));
}
