import { Router, type Request } from "express";
import { sequelize } from "../db.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { requireAnyPermission, requirePermission } from "../middlewares/requirePermission.js";
import { HttpError } from "../lib/errors.js";
import { isUuid } from "../lib/uuid.js";
import { clientIp } from "../lib/clientIp.js";
import type { AuditContext } from "../lib/audit.js";
import type { RoleKey } from "../models/Role.js";
import { listRoles, parsePermissions, setRolePermissions } from "../admin/roles.js";
import { changeUserRole, deleteUser, restoreUser } from "../admin/users.js";
import { listAudit, listAuditActors, parseAuditFilters } from "../admin/auditLog.js";
import { revertAudit } from "../admin/revert.js";
import { listPeople, parsePeopleFilters, personDetail } from "../admin/people.js";
import { lastCheck, runIntegrityCheck } from "../lib/integrity.js";
import {
  createShopItem,
  listSettings,
  listShopItems,
  parseItemChanges,
  parseSettingValues,
  updateSettings,
  updateShopItem,
} from "../admin/economy.js";
import { ShopItem } from "../models/index.js";
import {
  approveQuestion,
  contentScope,
  createQuestion,
  listCourses,
  listQuestions,
  parseCourseKeys,
  parseQuestionFilters,
  questionDetail,
  rejectQuestion,
  republishQuestion,
  setTeacherCourses,
  submitQuestion,
  unpublishQuestion,
  updateQuestion,
  withdrawQuestion,
} from "../admin/content.js";

export const adminRouter = Router();

// Quién y desde dónde, para la bitácora
export function auditContext(req: Request): AuditContext {
  return { actorId: req.user!.id, ip: clientIp(req) };
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

// Las personas: ?q=texto&kind=all|students|staff|deleted&offset=50 (de a 50, nextOffset para seguir)
adminRouter.get("/admin/users", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  res.json(await listPeople(parsePeopleFilters(req.query as Record<string, unknown>)));
});

adminRouter.get("/admin/users/:id", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  res.json({ person: await personDetail(userIdParam(req)) });
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

// Filtros: ?actor=<id o system>&action=user.delete&targetType=user&targetId=<id>&from=2026-11-01&to=2026-11-12&before=<id>
adminRouter.get("/admin/audit", requireAuth, requirePermission("audit:view"), async (req, res) => {
  res.json(await listAudit(parseAuditFilters(req.query as Record<string, unknown>)));
});

adminRouter.get("/admin/audit/actors", requireAuth, requirePermission("audit:view"), async (_req, res) => {
  res.json({ actors: await listAuditActors() });
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

// ---------- Economía (economy:edit) ----------

// Los valores de settings, con su mínimo y máximo
adminRouter.get("/admin/settings", requireAuth, requirePermission("economy:edit"), async (_req, res) => {
  res.json({ settings: await listSettings() });
});

// Cambia valores: { values: { "xp.star_completed": 60, ... } }. Un registro en la bitácora con lo que cambió
adminRouter.patch("/admin/settings", requireAuth, requirePermission("economy:edit"), async (req, res) => {
  const values = parseSettingValues(req.body?.values);
  const settings = await sequelize.transaction((t) => updateSettings(t, auditContext(req), values));
  res.json({ settings });
});

// Todo lo de la tienda, también lo retirado, con cuántos se vendieron o cuántos lo tienen
adminRouter.get("/admin/shop", requireAuth, requirePermission("economy:edit"), async (_req, res) => {
  res.json({ items: await listShopItems() });
});

// Agrega un cupón, un color o un título: { kind, name, note?, price, percent?, hex?, altName? }
adminRouter.post("/admin/shop", requireAuth, requirePermission("economy:edit"), async (req, res) => {
  const item = await sequelize.transaction((t) => createShopItem(t, auditContext(req), req.body));
  res.status(201).json({ item });
});

// Cambia un ítem: { name?, note?, price?, percent?, hex?, altName?, active? } (active: false lo retira)
adminRouter.patch("/admin/shop/:id", requireAuth, requirePermission("economy:edit"), async (req, res) => {
  const id = String(req.params.id);
  const item = await sequelize.transaction(async (t) => {
    const found = await ShopItem.findByPk(id, { transaction: t });
    if (!found) throw new HttpError(404, "No existe eso en la tienda.");
    return updateShopItem(t, auditContext(req), id, parseItemChanges(req.body, found.kind));
  });
  res.json({ item });
});

// ---------- Contenido (content:edit y content:approve) ----------
// Un docente ve y edita solo sus cursos (teacher_products); afuera de eso, 404 como si no existiera

function questionIdParam(req: Request): string {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(404, "No existe esa pregunta.");
  return id;
}

const seeContent = requireAnyPermission("content:edit", "content:approve");

// Los cursos que puede ver, con sus lecciones (y su letra) y sus módulos
adminRouter.get("/admin/content/courses", requireAuth, seeContent, async (req, res) => {
  res.json({ courses: await listCourses(await contentScope(req.user!)) });
});

// ?course=python&filter=all|review|draft|rejected|published|unpublished|mine&dest=<starId|exam|challenge>&q=texto&offset=50
adminRouter.get("/admin/questions", requireAuth, seeContent, async (req, res) => {
  const filters = parseQuestionFilters(req.query as Record<string, unknown>);
  res.json(await listQuestions(await contentScope(req.user!), req.user!.id, filters));
});

adminRouter.get("/admin/questions/:id", requireAuth, seeContent, async (req, res) => {
  res.json({ question: await questionDetail(await contentScope(req.user!), questionIdParam(req)) });
});

// Una pregunta nueva, en borrador: { course, dest: { starId } | { pool }, type, difficulty?, topic?, module?, prompt?, content?, answer?, explanation? }
adminRouter.post("/admin/questions", requireAuth, requirePermission("content:edit"), async (req, res) => {
  const scope = await contentScope(req.user!);
  const question = await sequelize.transaction((t) => createQuestion(t, scope, req.user!, req.body));
  res.status(201).json({ question });
});

// Guarda cambios en la versión abierta (si está publicada, crea la siguiente)
adminRouter.patch("/admin/questions/:id", requireAuth, requirePermission("content:edit"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  const question = await sequelize.transaction((t) => updateQuestion(t, scope, req.user!, id, req.body));
  res.json({ question });
});

adminRouter.post("/admin/questions/:id/submit", requireAuth, requirePermission("content:edit"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  res.json({ question: await sequelize.transaction((t) => submitQuestion(t, scope, id)) });
});

adminRouter.post("/admin/questions/:id/withdraw", requireAuth, requirePermission("content:edit"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  res.json({ question: await sequelize.transaction((t) => withdrawQuestion(t, scope, id)) });
});

adminRouter.post("/admin/questions/:id/approve", requireAuth, requirePermission("content:approve"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  res.json({ question: await sequelize.transaction((t) => approveQuestion(t, auditContext(req), scope, id)) });
});

// { comment } obligatorio
adminRouter.post("/admin/questions/:id/reject", requireAuth, requirePermission("content:approve"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  const question = await sequelize.transaction((t) => rejectQuestion(t, auditContext(req), scope, id, req.body?.comment));
  res.json({ question });
});

adminRouter.post("/admin/questions/:id/unpublish", requireAuth, requirePermission("content:approve"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  res.json({ question: await sequelize.transaction((t) => unpublishQuestion(t, auditContext(req), scope, id)) });
});

adminRouter.post("/admin/questions/:id/republish", requireAuth, requirePermission("content:approve"), async (req, res) => {
  const id = questionIdParam(req);
  const scope = await contentScope(req.user!);
  res.json({ question: await sequelize.transaction((t) => republishQuestion(t, auditContext(req), scope, id)) });
});

// Los cursos que da un docente: { courses: ["python", ...] } (reemplaza la lista)
adminRouter.put("/admin/users/:id/teaching", requireAuth, requirePermission("roles:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const keys = parseCourseKeys(req.body?.courses);
  const courses = await sequelize.transaction((t) => setTeacherCourses(t, auditContext(req), userId, keys));
  res.json({ courses });
});
