import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { addDays, argentinaDay, currentStreak } from "./streak.js";
import { loadEconomy } from "./economy.js";

export const RANKING_SIZE = 10;

export type RankingPeriod = "week" | "all";

// La semana de Argentina que contiene `now`: de lunes 00:00 a lunes 00:00 (UTC-3, sin horario de verano)
export function weekRange(now: Date): { startsAt: Date; endsAt: Date } {
  const today = argentinaDay(now);
  const weekday = new Date(`${today}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const monday = addDays(today, -((weekday + 6) % 7));
  return {
    startsAt: new Date(`${monday}T03:00:00Z`),
    endsAt: new Date(`${addDays(monday, 7)}T03:00:00Z`),
  };
}

// Las seis tablas del ranking
export const BOARDS = ["xp", "best_streak", "streak", "stars", "challenges", "glints"] as const;
export type Board = (typeof BOARDS)[number];

export type RankingEntry = {
  position: number;
  alias: string;
  value: number;
  me: boolean;
  frame: string | null; // el marco del avatar que lleva puesto
  avatar: string | null; // el dibujo del avatar (vacío = las iniciales)
  title: string | null; // el título, ya con la forma que eligió
  badge: number | null; // en las tablas de racha: los días de la mejor insignia que ganó (7, 30 o 100)
};

export type Ranking = {
  board: Board;
  period: RankingPeriod; // solo cambia algo en la tabla de experiencia
  startsAt: Date | null;
  endsAt: Date | null;
  top: RankingEntry[];
  me: { position: number | null; value: number } | null; // null si es del staff (no compite)
};

type Ranked = { id: string; value: number; position: number };

// Cada tabla es una consulta que devuelve (id, value, reached_at) de los alumnos que tienen algo.
// En un empate va primero el que llegó antes. Solo alumnos, sin bajas.
const STUDENT = `JOIN users u ON u.id = {col} AND u.deleted_at IS NULL
                 JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student'`;
const student = (col: string) => STUDENT.replace("{col}", col);

function totalsSql(board: Exclude<Board, "streak">): string {
  switch (board) {
    case "xp":
      // Los movimientos de experiencia (xp_events): así se puede rearmar siempre
      return `SELECT u.id, sum(x.xp)::int AS value, max(x.created_at) AS reached_at
                FROM xp_events x ${student("x.user_id")}
               WHERE (:startsAt::timestamptz IS NULL OR x.created_at >= :startsAt::timestamptz)
                 AND (:endsAt::timestamptz IS NULL OR x.created_at < :endsAt::timestamptz)
               GROUP BY u.id HAVING sum(x.xp) > 0`;
    case "best_streak":
      return `SELECT u.id, u.best_streak AS value, u.created_at AS reached_at
                FROM users u JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student'
               WHERE u.deleted_at IS NULL AND u.best_streak > 0`;
    case "stars":
      return `SELECT u.id, count(*)::int AS value, max(c.created_at) AS reached_at
                FROM star_completions c ${student("c.user_id")} GROUP BY u.id`;
    case "challenges":
      // Desafíos terminados con todas las preguntas bien
      return `SELECT u.id, count(*)::int AS value, max(a.finished_at) AS reached_at
                FROM challenge_attempts a ${student("a.user_id")}
               WHERE a.finished_at IS NOT NULL
                 AND a.correct_count = (SELECT count(*) FROM challenge_attempt_questions q WHERE q.attempt_id = a.id)
                 AND a.correct_count > 0
               GROUP BY u.id`;
    case "glints":
      // Todos los que ganó, aunque ya los haya gastado
      return `SELECT u.id, sum(g.amount)::int AS value, max(g.created_at) AS reached_at
                FROM glint_events g ${student("g.user_id")}
               WHERE g.amount > 0 GROUP BY u.id`;
  }
}

async function rankedFromSql(userId: string, board: Exclude<Board, "streak">, range: { startsAt: Date; endsAt: Date } | null) {
  const rows = await sequelize.query<{ id: string; value: number; position: string }>(
    `WITH totals AS (${totalsSql(board)}),
          ranked AS (SELECT *, row_number() OVER (ORDER BY value DESC, reached_at ASC, id) AS position FROM totals)
     SELECT id, value, position FROM ranked WHERE position <= :size OR id = :userId ORDER BY position`,
    {
      replacements: {
        userId,
        size: RANKING_SIZE,
        startsAt: range?.startsAt.toISOString() ?? null,
        endsAt: range?.endsAt.toISOString() ?? null,
      },
      type: QueryTypes.SELECT,
    }
  );
  return rows.map((r) => ({ id: r.id, value: r.value, position: Number(r.position) }));
}

// La racha vigente no se guarda: si se cortó, hay que calcularla (ver currentStreak). Se mira a todos los
// que tienen una racha guardada y se descartan los que ya la perdieron.
async function rankedStreakNow(userId: string, now: Date): Promise<Ranked[]> {
  const { freezes } = await loadEconomy();
  const today = argentinaDay(now);
  const rows = await sequelize.query<{
    id: string;
    streak: number;
    last_active_on: string | null;
    streak_freezes: number;
    bought_freezes: number;
  }>(
    `SELECT u.id, u.streak, u.last_active_on, u.streak_freezes, u.bought_freezes, u.created_at
       FROM users u JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student'
      WHERE u.deleted_at IS NULL AND u.streak > 0
      ORDER BY u.created_at, u.id`,
    { type: QueryTypes.SELECT }
  );
  const live = rows
    .map((r) => ({
      id: r.id,
      value: currentStreak(
        { streak: r.streak, lastActiveOn: r.last_active_on, streakFreezes: r.streak_freezes, boughtFreezes: r.bought_freezes },
        today,
        freezes.freePerMonth
      ).streak,
    }))
    .filter((r) => r.value > 0)
    // sort estable: en un empate queda primero el que se registró antes
    .sort((a, b) => b.value - a.value)
    .map((r, i) => ({ ...r, position: i + 1 }));
  return live.filter((r) => r.position <= RANKING_SIZE || r.id === userId);
}

export async function getRanking(
  userId: string,
  board: Board = "xp",
  period: RankingPeriod = "week",
  now = new Date()
): Promise<Ranking> {
  const range = board === "xp" && period === "week" ? weekRange(now) : null;
  const ranked = board === "streak" ? await rankedStreakNow(userId, now) : await rankedFromSql(userId, board, range);

  const ids = ranked.map((r) => r.id);
  const people = ids.length
    ? await sequelize.query<{
        id: string;
        alias: string;
        worn_frame: string | null;
        avatar: string | null;
        title: string | null;
        badge: number | null;
      }>(
        `SELECT u.id, u.alias, u.worn_frame, u.avatar,
                -- El título con la forma que eligió (los de una sola forma usan siempre el nombre)
                CASE WHEN u.title_variant = 1 AND s.alt_name IS NOT NULL THEN s.alt_name ELSE s.name END AS title,
                (SELECT max(b.days) FROM streak_badges b WHERE b.user_id = u.id) AS badge
           FROM users u LEFT JOIN shop_items s ON s.id = u.worn_title
          WHERE u.id IN (:ids)`,
        { replacements: { ids }, type: QueryTypes.SELECT }
      )
    : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  const withBadge = board === "best_streak" || board === "streak";

  const entries = ranked.map((r) => {
    const p = byId.get(r.id)!;
    return {
      id: r.id,
      position: r.position,
      alias: p.alias,
      value: r.value,
      frame: p.worn_frame,
      avatar: p.avatar,
      title: p.title,
      badge: withBadge ? (p.badge ?? null) : null,
    };
  });
  const mine = entries.find((e) => e.id === userId);
  const [user] = await sequelize.query<{ role: string }>(
    "SELECT r.key AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :userId",
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  return {
    board,
    period,
    startsAt: range?.startsAt ?? null,
    endsAt: range?.endsAt ?? null,
    top: entries
      .filter((e) => e.position <= RANKING_SIZE)
      .map(({ id, ...e }) => ({ ...e, me: id === userId })),
    me: user?.role === "student" ? { position: mine?.position ?? null, value: mine?.value ?? 0 } : null,
  };
}
