import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import {
  Challenge,
  ChallengeAttempt,
  Constellation,
  Coupon,
  Enrollment,
  ExamAttempt,
  Product,
  Star,
  StarCompletion,
} from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import { loadEconomy } from "../games/economy.js";
import { computeExamState } from "../games/examState.js";
import { examOpensAt } from "../games/unlock.js";
import { pendingLinkUntil } from "./enrollments.js";

// Alumnos del panel (students:view): la lista con el avance de cada curso y la ficha.
// scope: los cursos (ids) que puede ver quien pide; null = todos. El docente ve solo los suyos.

export const STUDENTS_PAGE_SIZE = 50;

export type StudentFilters = { q?: string; course?: string; offset: number };

export function parseStudentFilters(query: Record<string, unknown>): StudentFilters {
  const { q, course } = query;
  if (q !== undefined && (typeof q !== "string" || q.length > 100)) throw new HttpError(400, "q inválido.");
  if (course !== undefined && (typeof course !== "string" || course.length > 60)) throw new HttpError(400, "course inválido.");
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset inválido.");
  return { q: q?.trim() || undefined, course: course || undefined, offset };
}

type StudentRow = {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  streak: number;
  last_active_on: string | null;
  streak_freezes: number;
  bought_freezes: number;
};

type CourseRow = { user_id: string; key: string; name: string; lit: string; total: string; passed: boolean };

// Lo que sigue a WHERE: alumnos activos (no staff, no dados de baja), dentro del alcance y del curso pedido
function studentWhere(scope: string[] | null, courseId: string | null) {
  const base = "u.deleted_at IS NULL AND r.key = 'student'";
  if (!scope && !courseId) return base;
  return `${base} AND EXISTS (SELECT 1 FROM enrollments e WHERE e.user_id = u.id AND e.status = 'active'
            ${scope ? "AND e.product_id IN (:scope)" : ""} ${courseId ? "AND e.product_id = :courseId" : ""})`;
}

// Las lecciones encendidas y el total de cada curso activo de esos alumnos
async function coursesOf(userIds: string[], scope: string[] | null) {
  if (!userIds.length) return [];
  return sequelize.query<CourseRow>(
    `SELECT e.user_id, p.key, p.name,
            (SELECT count(*) FROM star_completions sc JOIN stars s ON s.id = sc.star_id
               JOIN constellations c ON c.id = s.constellation_id
              WHERE sc.user_id = e.user_id AND c.product_id = p.id AND s.kind = 'lesson') AS lit,
            (SELECT count(*) FROM stars s JOIN constellations c ON c.id = s.constellation_id
              WHERE c.product_id = p.id AND s.kind = 'lesson') AS total,
            EXISTS (SELECT 1 FROM exam_attempts ea JOIN stars s ON s.id = ea.star_id
               JOIN constellations c ON c.id = s.constellation_id
              WHERE ea.user_id = e.user_id AND ea.passed AND c.product_id = p.id) AS passed
       FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.status = 'active' AND e.user_id IN (:userIds) ${scope ? "AND e.product_id IN (:scope)" : ""}
      ORDER BY p.name`,
    { replacements: { userIds, scope }, type: QueryTypes.SELECT }
  );
}

function streakOf(row: StudentRow, today: string, freePerMonth: number) {
  return currentStreak(
    { streak: row.streak, lastActiveOn: row.last_active_on, streakFreezes: row.streak_freezes, boughtFreezes: row.bought_freezes },
    today,
    freePerMonth
  ).streak;
}

export async function listStudents(filters: StudentFilters, scope: string[] | null) {
  // Los cursos que se pueden elegir arriba: los activos que tienen constelación (el docente, los suyos)
  const withStars = (await Constellation.findAll({ attributes: ["productId"] })).map((c) => c.productId);
  const products = await Product.findAll({
    where: { active: true, id: scope ? withStars.filter((id) => scope.includes(id)) : withStars },
    order: [["name", "ASC"]],
  });
  let courseId: string | null = null;
  if (filters.course) {
    const product = products.find((p) => p.key === filters.course);
    if (!product) throw new HttpError(404, "No existe ese curso.");
    courseId = product.id;
  }

  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await sequelize.query<StudentRow>(
    `SELECT u.id, u.name, u.email, u.created_at, u.streak, u.last_active_on, u.streak_freezes, u.bought_freezes
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE ${studentWhere(scope, courseId)}
        AND (:pattern::text IS NULL OR u.name ILIKE :pattern OR u.email ILIKE :pattern)
      ORDER BY u.name, u.id
      LIMIT :limit OFFSET :offset`,
    {
      replacements: { pattern, scope, courseId, limit: STUDENTS_PAGE_SIZE + 1, offset: filters.offset },
      type: QueryTypes.SELECT,
    }
  );
  const page = rows.slice(0, STUDENTS_PAGE_SIZE);
  const courses = await coursesOf(page.map((r) => r.id), scope);

  // Cuántos alumnos hay en total y en cada curso (sin la búsqueda)
  const [{ count: total }] = await sequelize.query<{ count: string }>(
    `SELECT count(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE ${studentWhere(scope, null)}`,
    { replacements: { scope }, type: QueryTypes.SELECT }
  );
  const perCourse = await sequelize.query<{ product_id: string; count: string }>(
    `SELECT e.product_id, count(DISTINCT u.id) AS count
       FROM users u JOIN roles r ON r.id = u.role_id JOIN enrollments e ON e.user_id = u.id AND e.status = 'active'
      WHERE u.deleted_at IS NULL AND r.key = 'student'
      GROUP BY e.product_id`,
    { type: QueryTypes.SELECT }
  );

  const today = argentinaDay();
  const { freezes } = await loadEconomy();
  return {
    students: page.map((row) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.created_at,
      lastActiveOn: row.last_active_on,
      streak: streakOf(row, today, freezes.freePerMonth),
      courses: courses
        .filter((c) => c.user_id === row.id)
        .map((c) => ({ key: c.key, name: c.name, lit: Number(c.lit), total: Number(c.total), passed: c.passed })),
    })),
    total: Number(total),
    courses: products.map((p) => ({
      key: p.key,
      name: p.name,
      count: Number(perCourse.find((c) => c.product_id === p.id)?.count ?? 0),
    })),
    nextOffset: rows.length > STUDENTS_PAGE_SIZE ? filters.offset + STUDENTS_PAGE_SIZE : null,
  };
}

// ---------- La ficha ----------

// El avance en un curso: los módulos con sus lecciones, dónde va y el examen
async function courseProgress(userId: string, productId: string) {
  const constellation = await Constellation.findOne({ where: { productId }, include: [Star] });
  const stars = [...(constellation?.Stars ?? [])].sort((a, b) => a.position - b.position);
  const lessons = stars.filter((s) => s.kind === "lesson");
  const completions = await StarCompletion.findAll({ where: { userId, starId: stars.map((s) => s.id) } });
  const completedAt = new Map(completions.map((c) => [c.starId, c.createdAt]));

  // Los módulos en el orden de la constelación; las lecciones sin módulo van juntas al final
  const titles = new Map((constellation?.modules ?? []).map((m) => [m.number, m.title]));
  const numbers = [...new Set(lessons.map((s) => s.module ?? 0))];
  const modules = numbers.map((number) => ({
    number: number || null,
    title: titles.get(number) ?? null,
    lessons: lessons.filter((s) => (s.module ?? 0) === number).map((s) => ({ title: s.title, lit: completedAt.has(s.id) })),
  }));

  // Dónde va: la primera lección (en orden) que no encendió
  const next = lessons.find((s) => !completedAt.has(s.id));
  let current = null;
  if (next) {
    const inModule = lessons.filter((s) => (s.module ?? 0) === (next.module ?? 0));
    current = {
      module: next.module,
      moduleTitle: titles.get(next.module ?? 0) ?? null,
      lesson: next.title,
      index: inModule.indexOf(next) + 1,
      of: inModule.length,
    };
  }

  // El examen, con la misma regla que ve el alumno
  const examStar = stars.find((s) => s.kind === "exam");
  let exam = null;
  if (examStar) {
    const attempts = await ExamAttempt.findAll({ where: { userId, starId: examStar.id }, order: [["number", "ASC"]] });
    const state = computeExamState(examOpensAt(stars, completedAt), attempts);
    const passed = attempts.find((a) => a.passed);
    const coupon = passed ? await Coupon.findOne({ where: { examAttemptId: passed.id } }) : null;
    exam = {
      ...state,
      attempts: attempts.filter((a) => a.finishedAt).length,
      passedAt: passed?.finishedAt ?? null,
      couponPercent: coupon?.percent ?? null,
    };
  }

  return { lit: lessons.filter((s) => completedAt.has(s.id)).length, total: lessons.length, current, modules, exam };
}

// Los cuatro últimos desafíos publicados y cuántas acertó en cada uno (null si no lo jugó)
async function lastChallenges(userId: string) {
  const challenges = await Challenge.findAll({
    where: { publishedAt: { [Op.lte]: new Date() } },
    order: [["publishedAt", "DESC"]],
    limit: 4,
  });
  const attempts = await ChallengeAttempt.findAll({ where: { userId, challengeId: challenges.map((c) => c.id) } });
  const totals = attempts.length
    ? await sequelize.query<{ attempt_id: string; count: string }>(
        `SELECT attempt_id, count(*) FROM challenge_attempt_questions WHERE attempt_id IN (:ids) GROUP BY attempt_id`,
        { replacements: { ids: attempts.map((a) => a.id) }, type: QueryTypes.SELECT }
      )
    : [];
  return challenges.map((c) => {
    const attempt = attempts.find((a) => a.challengeId === c.id && a.startedAt);
    return {
      publishedAt: c.publishedAt,
      correct: attempt?.finishedAt ? attempt.correctCount : null,
      total: attempt ? Number(totals.find((t) => t.attempt_id === attempt.id)?.count ?? 0) : null,
      finished: !!attempt?.finishedAt,
      played: !!attempt,
    };
  });
}

// manage: quien mira puede dar y sacar cursos (users:manage). Ve también los cursos sacados,
// cómo entra a la plataforma y sus registros de la bitácora.
export async function studentDetail(id: string, scope: string[] | null, manage: boolean) {
  const [row] = await sequelize.query<StudentRow & { password_hash: string | null; total_xp: number; deleted_at: Date | null }>(
    `SELECT u.id, u.name, u.email, u.created_at, u.streak, u.last_active_on, u.streak_freezes, u.bought_freezes,
            u.password_hash, u.total_xp, u.deleted_at
       FROM users u JOIN roles r ON r.id = u.role_id
      WHERE u.id = :id AND r.key = 'student'`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  if (!row) throw new HttpError(404, "No existe ese alumno.");

  const enrollments = await Enrollment.findAll({
    where: { userId: id, ...(manage ? {} : { status: "active" }), ...(scope ? { productId: scope } : {}) },
    include: [Product],
    order: [["purchasedAt", "ASC"]],
  });
  // El docente no ve a alumnos que no tienen ninguno de sus cursos
  if (scope && !enrollments.length) throw new HttpError(404, "No existe ese alumno.");

  const courses = [];
  for (const e of enrollments) {
    courses.push({
      key: e.Product!.key,
      name: e.Product!.name,
      status: e.status,
      manual: e.paymentId === null, // dado desde el panel, no comprado
      revokedAt: e.status === "revoked" ? e.updatedAt : null,
      ...(await courseProgress(id, e.productId)),
    });
  }

  const { freezes } = await loadEconomy();
  const base = {
    id: row.id,
    name: row.name,
    email: row.email,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    totalXp: row.total_xp,
    lastActiveOn: row.last_active_on,
    streak: streakOf(row, argentinaDay(), freezes.freePerMonth),
    courses,
    challenges: await lastChallenges(id),
  };
  if (!manage) return base;

  const [{ count }] = await sequelize.query<{ count: string }>(
    `SELECT count(*) FROM audit_logs WHERE target_type = 'user' AND target_id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  const options = await Product.findAll({ where: { active: true }, order: [["name", "ASC"]] });
  return {
    ...base,
    access: { hasPassword: !!row.password_hash, linkUntil: row.password_hash ? null : await pendingLinkUntil(id) },
    auditCount: Number(count),
    courseOptions: options.map((p) => ({ key: p.key, name: p.name })),
  };
}
