import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { addDays, argentinaDay } from "./streak.js";
import { titleText } from "./cosmetics.js";

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

export type RankingEntry = {
  position: number;
  alias: string;
  xp: number;
  me: boolean;
  frame: string | null; // el marco del avatar que lleva puesto
  title: string | null; // el título, ya con la forma que eligió
};

export type Ranking = {
  period: RankingPeriod;
  startsAt: Date | null;
  endsAt: Date | null;
  top: RankingEntry[];
  me: { position: number | null; xp: number } | null; // null si es del staff (no compite)
};

// El ranking sale de los movimientos de experiencia (xp_events), así que se puede rearmar siempre.
// Solo alumnos, y solo los que sumaron algo. Si dos tienen lo mismo, va primero el que llegó antes.
export async function getRanking(userId: string, period: RankingPeriod, now = new Date()): Promise<Ranking> {
  const range = period === "week" ? weekRange(now) : null;

  const rows = await sequelize.query<{
    id: string;
    alias: string;
    xp: number;
    position: string;
    worn_frame: string | null;
    worn_title: string | null;
    title_variant: number;
  }>(
    `WITH totals AS (
       SELECT u.id, u.alias, sum(x.xp)::int AS xp, max(x.created_at) AS reached_at
         FROM xp_events x
         JOIN users u ON u.id = x.user_id AND u.deleted_at IS NULL
         JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student'
        WHERE (:startsAt::timestamptz IS NULL OR x.created_at >= :startsAt::timestamptz)
          AND (:endsAt::timestamptz IS NULL OR x.created_at < :endsAt::timestamptz)
        GROUP BY u.id, u.alias
       HAVING sum(x.xp) > 0
     ), ranked AS (
       SELECT *, row_number() OVER (ORDER BY xp DESC, reached_at ASC, id) AS position FROM totals
     )
     SELECT r.id, r.alias, r.xp, r.position, u.worn_frame, u.worn_title, u.title_variant
       FROM ranked r
       JOIN users u ON u.id = r.id
      WHERE r.position <= :size OR r.id = :userId
      ORDER BY r.position`,
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

  const entries = rows.map((r) => ({
    id: r.id,
    alias: r.alias,
    xp: r.xp,
    position: Number(r.position),
    frame: r.worn_frame,
    title: titleText(r.worn_title, r.title_variant),
  }));
  const mine = entries.find((e) => e.id === userId);
  const [user] = await sequelize.query<{ role: string }>(
    "SELECT r.key AS role FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = :userId",
    { replacements: { userId }, type: QueryTypes.SELECT }
  );

  return {
    period,
    startsAt: range?.startsAt ?? null,
    endsAt: range?.endsAt ?? null,
    top: entries
      .filter((e) => e.position <= RANKING_SIZE)
      .map((e) => ({ position: e.position, alias: e.alias, xp: e.xp, me: e.id === userId, frame: e.frame, title: e.title })),
    me: user?.role === "student" ? { position: mine?.position ?? null, xp: mine?.xp ?? 0 } : null,
  };
}
