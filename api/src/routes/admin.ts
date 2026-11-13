import { Router, type Request } from "express";
import { sequelize } from "../db.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requirePermission } from "../middlewares/requirePermission.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import type { AuditContext } from "../lib/audit.js";
import type { RoleKey } from "../models/Role.js";
import { listRoles, parsePermissions, setRolePermissions } from "../admin/roles.js";
import { changeUserRole, deleteUser, restoreUser } from "../admin/users.js";
import { listAudit, parseAuditFilters } from "../admin/auditLog.js";
import { revertAudit } from "../admin/revert.js";
import { lastCheck, runIntegrityCheck } from "../lib/integrity.js";

export const adminRouter = Router();

// Quién y desde dónde, para la bitácora
export function auditContext(req: Request): AuditContext {
  return { actorId: req.user!.id, ip: req.ip ?? null };
}

function userIdParam(req: Request): string {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(404, "No existe ese usuario.");
  return id;
}

adminRouter.get("/admin/roles", requireAuth, requirePermission("roles:manage"), async (_req, res) => {
  res.json({ roles: await listRoles() });
});

// Reemplaza la lista entera de permisos de un rol: { permissions: ["content:edit", ...] }
adminRouter.patch("/admin/roles/:key", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  const permissions = parsePermissions(req.body?.permissions);
  const role = await sequelize.transaction((t) =>
    setRolePermissions(t, auditContext(req), String(req.params.key), permissions)
  );
  res.json({ role });
});

adminRouter.patch("/admin/users/:id/role", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const role = req.body?.role;
  if (typeof role !== "string") throw new HttpError(400, "Falta el rol.");
  const user = await sequelize.transaction((t) => changeUserRole(t, auditContext(req), userId, role as RoleKey));
  res.json({ user });
});

// No borra la fila: da de baja al usuario (baja lógica)
adminRouter.delete("/admin/users/:id", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const user = await sequelize.transaction((t) => deleteUser(t, auditContext(req), userId));
  res.json({ user });
});

adminRouter.post("/admin/users/:id/restore", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const user = await sequelize.transaction((t) => restoreUser(t, auditContext(req), userId));
  res.json({ user });
});

// Filtros: ?actor=<id>&action=user.delete&targetType=user&targetId=<id>&from=2026-11-01&to=2026-11-12&before=<id>
adminRouter.get("/admin/audit", requireAuth, requirePermission("audit:view"), async (req, res) => {
  res.json(await listAudit(parseAuditFilters(req.query as Record<string, unknown>)));
});

// Revierte un registro: { confirm: true } para revertir aunque lo hayan cambiado después.
// Devuelve el id del registro nuevo ("revirtió el #id") y el usuario o el rol como quedó.
adminRouter.post("/admin/audit/:id/revert", requireAuth, requirePermission("audit:revert"), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new HttpError(404, "No existe ese registro.");
  const confirm = req.body?.confirm === true;
  res.json(await sequelize.transaction((t) => revertAudit(t, auditContext(req), id, confirm)));
});

// El resultado de la última verificación (manual o diaria)
adminRouter.get("/admin/integrity", requireAuth, requirePermission("integrity:view"), async (_req, res) => {
  res.json({ check: await lastCheck() });
});

// Corre la verificación de DVH, DVV y la cadena de la bitácora
adminRouter.post("/admin/integrity/check", requireAuth, requirePermission("integrity:view"), async (req, res) => {
  res.json({ check: await runIntegrityCheck("manual", auditContext(req)) });
});
