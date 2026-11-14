import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { argentinaDay, currentStreak } from "../games/streak.js";
import type { RoleKey } from "../models/Role.js";

// La lista de personas del panel (alumnos y staff) y la ficha de cada una.
// Cambiar el rol, dar de baja y restaurar están en users.ts.

export const PEOPLE_PAGE_SIZE = 50;
const KINDS = ["all", "students", "staff", "deleted"] as const;
type Kind = (typeof KINDS)[number];

export type PeopleFilters = { q?: string; kind: Kind; offset: number };

export function parsePeopleFilters(query: Record<string, unknown>): PeopleFilters {
  const q = query.q;
  if (q !== undefined && (typeof q !== "string" || q.length > 100)) throw new HttpError(400, "q inválido.");
  const kind = query.kind ?? "all";
  if (!KINDS.includes(kind as Kind)) throw new HttpError(400, "kind inválido.");
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset inválido.");
  return { q: q?.trim() || undefined, kind: kind as Kind, offset };
}

type PersonRow = {
  id: string;
  name: string;
  email: string;
  alias: string;
  role: RoleKey;
  created_at: Date;
  deleted_at: Date | null;
  streak: number;
  last_active_on: string | null;
  streak_freezes: number;
  bought_freezes: number;
};

// La racha que se muestra: si se cortó, 0 (como en GET /me/stats, sin escribir nada)
function present(row: PersonRow, today: string) {
  const { streak } = currentStreak(
    {
      streak: row.streak,
      lastActiveOn: row.last_active_on,
      streakFreezes: row.streak_freezes,
      boughtFreezes: row.bought_freezes,
    },
    today
  );
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    alias: row.alias,
    role: row.role,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    lastActiveOn: row.last_active_on,
    streak,
  };
}

const SELECT = `SELECT u.id, u.name, u.email, u.alias, r.key AS role, u.created_at, u.deleted_at,
                       u.streak, u.last_active_on, u.streak_freezes, u.bought_freezes
                  FROM users u JOIN roles r ON r.id = u.role_id`;

// "Todos" son los activos; los dados de baja se ven aparte
const KIND_WHERE: Record<Kind, string> = {
  all: "u.deleted_at IS NULL",
  students: "u.deleted_at IS NULL AND r.key = 'student'",
  staff: "u.deleted_at IS NULL AND r.key <> 'student'",
  deleted: "u.deleted_at IS NOT NULL",
};

export async function listPeople(filters: PeopleFilters) {
  // La búsqueda: por nombre o email, sin importar mayúsculas. Los % y _ que escriba se buscan tal cual
  const pattern = filters.q ? `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
  const rows = await sequelize.query<PersonRow>(
    `${SELECT}
      WHERE ${KIND_WHERE[filters.kind]}
        AND (:pattern::text IS NULL OR u.name ILIKE :pattern OR u.email ILIKE :pattern)
      ORDER BY (r.key = 'student'), u.name, u.id
      LIMIT :limit OFFSET :offset`,
    {
      replacements: { pattern, limit: PEOPLE_PAGE_SIZE + 1, offset: filters.offset },
      type: QueryTypes.SELECT,
    }
  );

  // Cuántos hay de cada tipo, para los botones de arriba (sin la búsqueda)
  const [counts] = await sequelize.query<Record<Kind, string>>(
    `SELECT count(*) FILTER (WHERE ${KIND_WHERE.all}) AS "all",
            count(*) FILTER (WHERE ${KIND_WHERE.students}) AS students,
            count(*) FILTER (WHERE ${KIND_WHERE.staff}) AS staff,
            count(*) FILTER (WHERE ${KIND_WHERE.deleted}) AS deleted
       FROM users u JOIN roles r ON r.id = u.role_id`,
    { type: QueryTypes.SELECT }
  );

  const today = argentinaDay();
  const hasMore = rows.length > PEOPLE_PAGE_SIZE;
  return {
    people: rows.slice(0, PEOPLE_PAGE_SIZE).map((row) => present(row, today)),
    counts: Object.fromEntries(KINDS.map((k) => [k, Number(counts[k])])) as Record<Kind, number>,
    nextOffset: hasMore ? filters.offset + PEOPLE_PAGE_SIZE : null,
  };
}

// La ficha: lo de la lista más sus cursos activos y cuántos registros tiene en la bitácora
export async function personDetail(id: string) {
  const [row] = await sequelize.query<PersonRow>(`${SELECT} WHERE u.id = :id`, {
    replacements: { id },
    type: QueryTypes.SELECT,
  });
  if (!row) throw new HttpError(404, "No existe ese usuario.");

  const courses = await sequelize.query<{ key: string; name: string }>(
    `SELECT p.key, p.name FROM enrollments e JOIN products p ON p.id = e.product_id
      WHERE e.user_id = :id AND e.status = 'active'
      ORDER BY e.purchased_at`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );
  const [{ count }] = await sequelize.query<{ count: string }>(
    `SELECT count(*) FROM audit_logs WHERE target_type = 'user' AND target_id = :id`,
    { replacements: { id }, type: QueryTypes.SELECT }
  );

  return { ...present(row, argentinaDay()), courses, auditCount: Number(count) };
}
