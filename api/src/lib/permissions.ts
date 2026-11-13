import type { Transaction } from "sequelize";
import { Role, RolePermission, type User } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";

// Los permisos que existen. Cada endpoint de staff pide uno. La tabla permissions tiene los mismos
// (los crea la migración, y un test verifica que coincidan); lo editable es qué rol tiene cuál.
export const PERMISSIONS = [
  "content:edit",
  "content:approve",
  "students:view",
  "challenges:manage",
  "economy:edit",
  "users:manage",
  "coupons:manage",
  "audit:view",
  "audit:revert",
  "integrity:view",
  "roles:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export async function roleKeyOf(user: User, transaction?: Transaction): Promise<RoleKey> {
  const role = await Role.findByPk(user.roleId, { transaction });
  return role!.key;
}

// Los permisos del usuario, leídos de la base en cada pedido (son pocas filas).
// El super admin tiene todos siempre, tenga o no filas en role_permissions.
export async function permissionsOf(user: User, transaction?: Transaction): Promise<Permission[]> {
  if ((await roleKeyOf(user, transaction)) === "super_admin") return [...PERMISSIONS];
  const rows = await RolePermission.findAll({ where: { roleId: user.roleId }, transaction });
  return rows.map((r) => r.permissionKey);
}

// Lo que reciben el navegador al entrar y GET /me: el usuario, su rol y sus permisos
export async function sessionUser(user: User, transaction?: Transaction) {
  const { passwordHash: _hash, ...data } = user.toJSON();
  return { ...data, role: await roleKeyOf(user, transaction), permissions: await permissionsOf(user, transaction) };
}

export async function can(user: User, permission: Permission, transaction?: Transaction): Promise<boolean> {
  return (await permissionsOf(user, transaction)).includes(permission);
}
