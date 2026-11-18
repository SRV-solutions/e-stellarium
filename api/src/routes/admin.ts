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
import { ShopItem, User } from "../models/index.js";
import { createPasswordToken } from "../lib/passwordTokens.js";
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

import { listStudents, parseStudentFilters, studentDetail } from "../admin/students.js";
import {
  courseNames,
  createEnrollment,
  grantCourse,
  lookupEnrollment,
  parseCourseKey,
  parseNewEnrollment,
  resendLink,
  revokeCourse,
} from "../admin/enrollments.js";
import { can } from "../lib/permissions.js";
import { issueCoupon, listCoupons, lookupCouponOwner, parseCouponFilters, parseNewCoupon, parseReason, voidCoupon } from "../admin/coupons.js";
import { challengesOverview } from "../admin/challenges.js";
import { awardPrizes, closeSeason, listSeasons, parseNewPrize, parseRankingQuery, parseSeasonClose } from "../admin/ranking.js";
import { getStaffRanking } from "../games/ranking.js";
import { sendMail } from "../lib/mailer.js";
import { giftCouponEmail, newCoursesEmail, resetPasswordEmail, welcomeEmail } from "../lib/email.js";
import { config } from "../config.js";

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

// ---------- Alumnos (bloque 5, paso 5) ----------

// El docente ve solo los alumnos de sus cursos (y solo esos cursos); el resto con students:view, todos
adminRouter.get("/admin/students", requireAuth, requirePermission("students:view"), async (req, res) => {
  const scope = await contentScope(req.user!);
  res.json(await listStudents(parseStudentFilters(req.query), scope));
});

adminRouter.get("/admin/students/:id", requireAuth, requirePermission("students:view"), async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(404, "No existe ese alumno.");
  const scope = await contentScope(req.user!);
  res.json({ student: await studentDetail(id, scope, await can(req.user!, "users:manage")) });
});

// Los mails van después del commit (un mail no se deshace). Si falla, el cambio queda igual y se avisa
async function trySend(to: string, mail: { subject: string; html: string }) {
  try {
    await sendMail({ to, ...mail });
    return true;
  } catch (err) {
    console.error("No se pudo enviar el mail", err);
    return false;
  }
}

// Cursos nuevos: la bienvenida con el link si todavía no tiene contraseña; si no, el aviso de siempre
async function coursesMail(user: { email: string; name: string }, token: string | null, added: string[], all: string[]) {
  return token
    ? trySend(user.email, welcomeEmail(user.name, `${config.appUrl}/create-password?token=${token}`, await courseNames(all)))
    : trySend(user.email, newCoursesEmail(user.name, await courseNames(added)));
}

// Para el diálogo de alta: ?email= dice si ya tiene cuenta (y con qué cursos) y qué cursos se pueden dar
adminRouter.get("/admin/enrollments/lookup", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.slice(0, 200) : "";
  res.json(await lookupEnrollment(email));
});

// Alta manual: { email, name, courses }. Si el email ya tiene cuenta, le suma los cursos
adminRouter.post("/admin/enrollments", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const input = parseNewEnrollment(req.body);
  const result = await sequelize.transaction((t) => createEnrollment(t, auditContext(req), input));
  const emailSent = await coursesMail(result.user, result.token, result.added, result.courses);
  res.status(201).json({ userId: result.user.id, created: result.created, courses: result.courses, emailSent });
});

// Darle un curso desde la ficha (o devolvérselo): { course }
adminRouter.post("/admin/users/:id/courses", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const key = parseCourseKey(req.body?.course);
  const { user, token, added, after } = await sequelize.transaction(async (t) => {
    const change = await grantCourse(t, auditContext(req), userId, key);
    const user = (await User.scope("withPassword").findByPk(userId, { transaction: t }))!;
    return { ...change, user, token: user.passwordHash ? null : await createPasswordToken(userId, "set_password", t) };
  });
  const emailSent = await coursesMail(user, token, added, after);
  res.json({ courses: after, emailSent });
});

// Sacarle un curso: pasa a revocado (el avance queda guardado). Sin mail
adminRouter.delete("/admin/users/:id/courses/:course", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const key = parseCourseKey(req.params.course);
  const { after } = await sequelize.transaction((t) => revokeCourse(t, auditContext(req), userId, key));
  res.json({ courses: after });
});

// Reenviar el link para crear la contraseña (o mandar uno para cambiarla, si ya tiene)
adminRouter.post("/admin/users/:id/link", requireAuth, requirePermission("users:manage"), async (req, res) => {
  const userId = userIdParam(req);
  const { user, type, token, courses } = await sequelize.transaction((t) => resendLink(t, auditContext(req), userId));
  const link = `${config.appUrl}/create-password?token=${token}`;
  const emailSent = await trySend(
    user.email,
    type === "set_password" ? welcomeEmail(user.name, link, await courseNames(courses)) : resetPasswordEmail(user.name, link)
  );
  res.json({ type, emailSent });
});

// ---------- Cupones (coupons:manage) ----------

// Todos los cupones (?q=, ?status=live|used|expired|void|all, ?offset=), con cuántos hay de cada estado
adminRouter.get("/admin/coupons", requireAuth, requirePermission("coupons:manage"), async (req, res) => {
  res.json(await listCoupons(parseCouponFilters(req.query)));
});

// Para el diálogo de emitir: ?email= dice de quién es, y cuántos días vale un cupón por defecto
adminRouter.get("/admin/coupons/lookup", requireAuth, requirePermission("coupons:manage"), async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.slice(0, 200) : "";
  res.json(await lookupCouponOwner(email));
});

// Emite un cupón de regalo: { email, percent, validDays, reason, notify }. El mail, después del commit
adminRouter.post("/admin/coupons", requireAuth, requirePermission("coupons:manage"), async (req, res) => {
  const input = parseNewCoupon(req.body);
  const { coupon, user } = await sequelize.transaction((t) => issueCoupon(t, auditContext(req), input));
  const emailSent = input.notify
    ? await trySend(user.email, giftCouponEmail(user.name, coupon.code, coupon.percent, coupon.expiresAt))
    : null;
  res.status(201).json({ coupon: { id: coupon.id, code: coupon.code, percent: coupon.percent, expiresAt: coupon.expiresAt }, emailSent });
});

// Anula un cupón sin usar: { reason }
adminRouter.delete("/admin/coupons/:id", requireAuth, requirePermission("coupons:manage"), async (req, res) => {
  const id = req.params.id;
  if (!isUuid(id)) throw new HttpError(404, "No existe ese cupón.");
  const reason = parseReason(req.body?.reason);
  await sequelize.transaction((t) => voidCoupon(t, auditContext(req), id, reason));
  res.json({ voided: true });
});

// ---------- Desafíos (challenges:manage) ----------

// El horario y la receta, el desafío de ahora, los últimos y cuántas preguntas hay por curso
adminRouter.get("/admin/challenges", requireAuth, requirePermission("challenges:manage"), async (_req, res) => {
  res.json(await challengesOverview());
});

// Cambia el horario o la receta: { values: { "challenge.hour": 10, ... } }. Registro challenge.update
adminRouter.patch("/admin/challenges", requireAuth, requirePermission("challenges:manage"), async (req, res) => {
  const values = parseSettingValues(req.body?.values, "challenge");
  await sequelize.transaction((t) => updateSettings(t, auditContext(req), values));
  res.json(await challengesOverview());
});

// ---------- Ranking (ranking:view, ranking:award, ranking:reset) ----------

// Una tabla con nombres y emails: ?board=xp|best_streak|streak|stars|challenges|glints y ?period=week|season|all
adminRouter.get("/admin/ranking", requireAuth, requirePermission("ranking:view"), async (req, res) => {
  const { board, period } = parseRankingQuery(req.query);
  res.json(await getStaffRanking(board, period));
});

// La temporada abierta y las cerradas con su foto
adminRouter.get("/admin/ranking/seasons", requireAuth, requirePermission("ranking:view"), async (_req, res) => {
  res.json(await listSeasons());
});

// Premia a los alumnos elegidos: { requestId, board, userIds, glints?, coupon?: { percent, validDays }, reason, notify }.
// Los mails salen después del commit
adminRouter.post("/admin/ranking/prizes", requireAuth, requirePermission("ranking:award"), async (req, res) => {
  const input = parseNewPrize(req.body);
  const given = await sequelize.transaction((t) => awardPrizes(t, auditContext(req), input));
  if (input.notify) {
    for (const g of given) {
      if (g.mail) await trySend(g.email, g.mail);
      if (g.coupon) await trySend(g.email, giftCouponEmail(g.name, g.coupon.code, g.coupon.percent, g.coupon.expiresAt));
    }
  }
  res.status(201).json({
    awarded: given.length,
    glints: input.glints,
    coupons: given.filter((g) => g.coupon).map((g) => ({ name: g.name, code: g.coupon!.code })),
  });
});

// Cierra la temporada y arranca otra: { seasonId, name }. Solo ranking:reset (el super admin). No borra nada
adminRouter.post("/admin/ranking/seasons/close", requireAuth, requirePermission("ranking:reset"), async (req, res) => {
  const input = parseSeasonClose(req.body);
  const { closed, next } = await sequelize.transaction((t) => closeSeason(t, auditContext(req), input));
  res.status(201).json({ closed: { id: closed.id, name: closed.name }, next: { id: next.id, name: next.name, startedAt: next.startedAt } });
});
