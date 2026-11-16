import { Op, QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Enrollment, PasswordToken, Product, User } from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import { generateUniqueAlias } from "../lib/alias.js";
import { createPasswordToken } from "../lib/passwordTokens.js";
import type { PasswordTokenType } from "../models/PasswordToken.js";
import type { ChangeOptions } from "./users.js";

// Altas manuales y cursos dados o sacados a mano desde el panel (users:manage).
// Los mails los manda la ruta, después del commit.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Los cursos activos de un usuario (claves, ordenadas): es lo que se guarda en la bitácora
export async function activeCourses(userId: string, t?: Transaction): Promise<string[]> {
  const rows = await sequelize.query<{ key: string }>(
    `SELECT p.key FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = :userId AND e.status = 'active' ORDER BY p.key`,
    { replacements: { userId }, type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => r.key);
}

async function lockActiveUser(t: Transaction, userId: string) {
  const user = await User.scope("withPassword").findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });
  if (!user) throw new HttpError(404, "No existe ese usuario.");
  if (user.deletedAt) throw new HttpError(409, "Está dado de baja: restauralo primero desde Personas.");
  return user;
}

type CoursesAction = "enrollment.grant" | "enrollment.revoke";

// Deja al usuario con exactamente esos cursos activos. Un curso que tuvo vuelve a activarse (con su
// pago original, si lo tenía); uno nuevo se crea sin pago, así un reembolso no lo toca. Sacar un curso
// lo pasa a "revoked": el avance queda guardado. Devuelve los cursos que se sumaron.
export async function setStudentCourses(
  t: Transaction,
  ctx: AuditContext,
  userId: string,
  keys: string[],
  action: CoursesAction,
  options: ChangeOptions = {}
) {
  await lockActiveUser(t, userId);
  const after = [...new Set(keys)].sort();
  const before = await activeCourses(userId, t);
  const added = after.filter((k) => !before.includes(k));
  const removed = before.filter((k) => !after.includes(k));
  if (!added.length && !removed.length) return { before, after, added };

  // Se pueden dar solo cursos activos; sacar, cualquiera que tenga
  const products = await Product.findAll({ where: { key: [...added, ...removed] }, transaction: t });
  for (const key of added) {
    const product = products.find((p) => p.key === key);
    if (!product || !product.active) throw new HttpError(400, `No existe el curso ${key}.`);
    const [enrollment, created] = await Enrollment.findOrCreate({
      where: { userId, productId: product.id },
      defaults: { userId, productId: product.id },
      transaction: t,
    });
    if (!created) await enrollment.update({ status: "active" }, { transaction: t });
  }
  if (removed.length) {
    await Enrollment.update(
      { status: "revoked" },
      { where: { userId, productId: products.filter((p) => removed.includes(p.key)).map((p) => p.id) }, transaction: t }
    );
  }

  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : action,
    targetType: "user",
    targetId: userId,
    before: { courses: before },
    after: { courses: after },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return { before, after, added };
}

export function parseCourseKey(value: unknown): string {
  if (typeof value !== "string" || !value) throw new HttpError(400, "Falta el curso.");
  return value;
}

// Da un curso (o lo devuelve, si se lo habían sacado)
export async function grantCourse(t: Transaction, ctx: AuditContext, userId: string, key: string) {
  const current = await activeCourses(userId, t);
  if (current.includes(key)) throw new HttpError(409, "Ya tiene ese curso.");
  return setStudentCourses(t, ctx, userId, [...current, key], "enrollment.grant");
}

export async function revokeCourse(t: Transaction, ctx: AuditContext, userId: string, key: string) {
  const current = await activeCourses(userId, t);
  if (!current.includes(key)) throw new HttpError(409, "No tiene ese curso.");
  return setStudentCourses(t, ctx, userId, current.filter((k) => k !== key), "enrollment.revoke");
}

export type NewEnrollment = { email: string; name: string | null; courses: string[] };

export function parseNewEnrollment(body: unknown): NewEnrollment {
  const { email, name, courses } = (body ?? {}) as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) throw new HttpError(400, "Escribí un email válido.");
  if (name !== undefined && name !== null && (typeof name !== "string" || name.length > 120)) {
    throw new HttpError(400, "Nombre inválido.");
  }
  if (!Array.isArray(courses) || !courses.length || !courses.every((c) => typeof c === "string")) {
    throw new HttpError(400, "Elegí al menos un curso.");
  }
  return { email: email.trim().toLowerCase(), name: (name as string | undefined)?.trim() || null, courses: courses as string[] };
}

// El alta manual: si el email no tiene cuenta, la crea (registro user.create); después le da los cursos
// (registro enrollment.grant, reversible). Si no tiene contraseña, crea el link para el mail de bienvenida.
export async function createEnrollment(t: Transaction, ctx: AuditContext, input: NewEnrollment) {
  let user = await User.scope("withPassword").findOne({ where: { email: input.email }, transaction: t });
  const created = !user;
  if (!user) {
    if (!input.name) throw new HttpError(400, "Falta el nombre.");
    user = await User.create(
      { email: input.email, name: input.name, alias: await generateUniqueAlias(t) },
      { transaction: t }
    );
    await writeAudit(t, {
      ...ctx,
      action: "user.create",
      targetType: "user",
      targetId: user.id,
      after: { email: user.email, name: user.name },
      reversible: false,
    });
  }

  const current = await activeCourses(user.id, t);
  const missing = input.courses.filter((k) => !current.includes(k));
  if (!missing.length) throw new HttpError(409, "Ya tiene esos cursos.");
  const { added, after } = await setStudentCourses(t, ctx, user.id, [...current, ...missing], "enrollment.grant");

  const token = user.passwordHash ? null : await createPasswordToken(user.id, "set_password", t);
  return { user, created, added, courses: after, token };
}

// Un link nuevo para entrar: si todavía no creó su contraseña, el de crearla (y los anteriores dejan de
// servir); si ya tiene, el de cambiarla, como "Olvidé mi contraseña". Queda en la bitácora (no se revierte)
export async function resendLink(t: Transaction, ctx: AuditContext, userId: string) {
  const user = await lockActiveUser(t, userId);
  const type: PasswordTokenType = user.passwordHash ? "reset_password" : "set_password";
  if (type === "set_password") {
    await PasswordToken.update(
      { usedAt: new Date() },
      { where: { userId, type, usedAt: null }, transaction: t }
    );
  }
  const token = await createPasswordToken(userId, type, t);
  await writeAudit(t, {
    ...ctx,
    action: "user.link_resent",
    targetType: "user",
    targetId: userId,
    after: { link: type },
    reversible: false,
  });
  return { user, type, token, courses: await activeCourses(userId, t) };
}

// Hasta cuándo vale el link para crear la contraseña que tiene pendiente (null si no hay)
export async function pendingLinkUntil(userId: string): Promise<Date | null> {
  const token = await PasswordToken.findOne({
    where: { userId, type: "set_password", usedAt: null, expiresAt: { [Op.gt]: new Date() } },
    order: [["expiresAt", "DESC"]],
  });
  return token?.expiresAt ?? null;
}

export async function courseNames(keys: string[], t?: Transaction) {
  const products = await Product.findAll({ where: { key: keys }, order: [["name", "ASC"]], transaction: t });
  return products.map((p) => p.name);
}

// Para el diálogo de alta: si ese email ya tiene cuenta, quién es y qué cursos tiene; y los cursos que se pueden dar
export async function lookupEnrollment(email: string) {
  const user = EMAIL_RE.test(email) ? await User.findOne({ where: { email: email.trim().toLowerCase() } }) : null;
  const options = await Product.findAll({ where: { active: true }, order: [["name", "ASC"]] });
  return {
    user: user ? { id: user.id, name: user.name, deleted: user.deletedAt !== null, courses: await activeCourses(user.id) } : null,
    courseOptions: options.map((p) => ({ key: p.key, name: p.name })),
  };
}
