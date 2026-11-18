import { QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { addDays, argentinaDay, currentStreak } from "./streak.js";
import { loadEconomy } from "./economy.js";
import { Season } from "../models/index.js";

export const RANKING_SIZE = 10;

// week: la semana argentina (solo la tabla de experiencia); season: desde que arrancó la temporada abierta;
// all: desde siempre. Las dos rachas no dependen del período.
export type RankingPeriod = "week" | "season" | "all";

type Range = { startsAt: Date | null; endsAt: Date | null };

// La temporada abierta (siempre hay una; la migración crea la primera)
export async function currentSeason(): Promise<Season> {
  const season = await Season.findOne({ where: { endedAt: null } });
  if (!season) throw new Error("No hay una temporada abierta.");
  return season;
}

// El período que vale para cada tabla. La experiencia acepta los tres (por defecto, la semana); estrellas, desafíos
// y destellos, solo temporada o siempre (por defecto, la temporada); las rachas no lo usan
export function effectivePeriod(board: Board, period: RankingPeriod | undefined): RankingPeriod {
  if (board === "streak" || board === "best_streak") return "all";
  if (board === "xp") return period ?? "week";
  return period === "all" ? "all" : "season";
}

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
  badge: number | null; // en las tablas de racha: la insignia más alta que alcanzó con los días de esa fila (7, 30 o 100)
};

export type Ranking = {
  board: Board;
  period: RankingPeriod; // el que se usó de verdad (ver effectivePeriod)
  season: { id: string; name: string; startedAt: Date };
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
// El filtro de fechas de una tabla (sin fechas, no filtra)
const inRange = (col: string) =>
  `(:startsAt::timestamptz IS NULL OR ${col} >= :startsAt::timestamptz) AND (:endsAt::timestamptz IS NULL OR ${col} < :endsAt::timestamptz)`;

function totalsSql(board: Exclude<Board, "streak">): string {
  switch (board) {
    case "xp":
      // Los movimientos de experiencia (xp_events): así se puede rearmar siempre
      return `SELECT u.id, sum(x.xp)::int AS value, max(x.created_at) AS reached_at
                FROM xp_events x ${student("x.user_id")}
               WHERE ${inRange("x.created_at")}
               GROUP BY u.id HAVING sum(x.xp) > 0`;
    case "best_streak":
      return `SELECT u.id, u.best_streak AS value, u.created_at AS reached_at
                FROM users u JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student'
               WHERE u.deleted_at IS NULL AND u.best_streak > 0`;
    case "stars":
      return `SELECT u.id, count(*)::int AS value, max(c.created_at) AS reached_at
                FROM star_completions c ${student("c.user_id")}
               WHERE ${inRange("c.created_at")} GROUP BY u.id`;
    case "challenges":
      // Desafíos terminados con todas las preguntas bien
      return `SELECT u.id, count(*)::int AS value, max(a.finished_at) AS reached_at
                FROM challenge_attempts a ${student("a.user_id")}
               WHERE a.finished_at IS NOT NULL AND ${inRange("a.finished_at")}
                 AND a.correct_count = (SELECT count(*) FROM challenge_attempt_questions q WHERE q.attempt_id = a.id)
                 AND a.correct_count > 0
               GROUP BY u.id`;
    case "glints":
      // Todos los que ganó jugando, aunque ya los haya gastado. Los premios del staff no cuentan: si no, premiar
      // al primero lo dejaría más arriba todavía
      return `SELECT u.id, sum(g.amount)::int AS value, max(g.created_at) AS reached_at
                FROM glint_events g ${student("g.user_id")}
               WHERE g.amount > 0 AND g.reason <> 'ranking_prize' AND ${inRange("g.created_at")} GROUP BY u.id`;
  }
}

async function rankedFromSql(userId: string | null, board: Exclude<Board, "streak">, range: Range | null, size: number) {
  const rows = await sequelize.query<{ id: string; value: number; position: string }>(
    `WITH totals AS (${totalsSql(board)}),
          ranked AS (SELECT *, row_number() OVER (ORDER BY value DESC, reached_at ASC, id) AS position FROM totals)
     SELECT id, value, position FROM ranked WHERE position <= :size OR id = :userId ORDER BY position`,
    {
      replacements: {
        userId,
        size,
        startsAt: range?.startsAt?.toISOString() ?? null,
        endsAt: range?.endsAt?.toISOString() ?? null,
      },
      type: QueryTypes.SELECT,
    }
  );
  return rows.map((r) => ({ id: r.id, value: r.value, position: Number(r.position) }));
}

// La racha vigente no se guarda: si se cortó, hay que calcularla (ver currentStreak). Se mira a todos los
// que tienen una racha guardada y se descartan los que ya la perdieron.
async function rankedStreakNow(userId: string | null, now: Date, size: number): Promise<Ranked[]> {
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
  return live.filter((r) => r.position <= size || r.id === userId);
}

// El rango de fechas de una tabla según el período
function rangeOf(board: Board, period: RankingPeriod, season: Season, now: Date): Range | null {
  if (board === "streak" || board === "best_streak" || period === "all") return null;
  if (period === "week") return weekRange(now);
  return { startsAt: season.startedAt, endsAt: null };
}

// Los primeros `size` de una tabla (y, si se pide, también la posición de `userId`)
async function rankBoard(userId: string | null, board: Board, range: Range | null, size: number, now: Date): Promise<Ranked[]> {
  return board === "streak" ? rankedStreakNow(userId, now, size) : rankedFromSql(userId, board, range, size);
}

type Person = {
  id: string;
  alias: string;
  name: string;
  email: string;
  worn_frame: string | null;
  avatar: string | null;
  title: string | null;
  badges: number[];
};

async function loadPeople(ids: string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const people = await sequelize.query<Person>(
    `SELECT u.id, u.alias, u.name, u.email, u.worn_frame, u.avatar,
            -- El título con la forma que eligió (los de una sola forma usan siempre el nombre)
            CASE WHEN u.title_variant = 1 AND s.alt_name IS NOT NULL THEN s.alt_name ELSE s.name END AS title,
            COALESCE((SELECT array_agg(b.days) FROM streak_badges b WHERE b.user_id = u.id), '{}') AS badges
       FROM users u LEFT JOIN shop_items s ON s.id = u.worn_title
      WHERE u.id IN (:ids)`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );
  return new Map(people.map((p) => [p.id, p]));
}

// La insignia más alta que ya tenía con esos días (una ganada antes no sirve si hoy lleva menos)
const badgeFor = (board: Board, p: Person, value: number) =>
  board === "best_streak" || board === "streak" ? Math.max(0, ...p.badges.filter((d) => d <= value)) || null : null;

export async function getRanking(
  userId: string,
  board: Board = "xp",
  requested?: RankingPeriod,
  now = new Date()
): Promise<Ranking> {
  const period = effectivePeriod(board, requested);
  const season = await currentSeason();
  const range = rangeOf(board, period, season, now);
  const ranked = await rankBoard(userId, board, range, RANKING_SIZE, now);

  const byId = await loadPeople(ranked.map((r) => r.id));
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
      badge: badgeFor(board, p, r.value),
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
    season: { id: season.id, name: season.name, startedAt: season.startedAt },
    startsAt: range?.startsAt ?? null,
    endsAt: range?.endsAt ?? null,
    top: entries
      .filter((e) => e.position <= RANKING_SIZE)
      .map(({ id, ...e }) => ({ ...e, me: id === userId })),
    me: user?.role === "student" ? { position: mine?.position ?? null, value: mine?.value ?? 0 } : null,
  };
}

export const STAFF_RANKING_SIZE = 25;

// El ranking para el staff: lo mismo, pero con el id, el nombre y el email, y cuántos destellos de premio
// recibió cada uno en la temporada abierta
export async function getStaffRanking(board: Board = "xp", requested?: RankingPeriod, now = new Date()) {
  const period = effectivePeriod(board, requested);
  const season = await currentSeason();
  const range = rangeOf(board, period, season, now);
  const ranked = await rankBoard(null, board, range, STAFF_RANKING_SIZE, now);
  const byId = await loadPeople(ranked.map((r) => r.id));

  const prizes = ranked.length
    ? await sequelize.query<{ user_id: string; total: number }>(
        `SELECT user_id, sum(amount)::int AS total FROM glint_events
          WHERE reason = 'ranking_prize' AND user_id IN (:ids) AND created_at >= :since GROUP BY user_id`,
        { replacements: { ids: ranked.map((r) => r.id), since: season.startedAt.toISOString() }, type: QueryTypes.SELECT }
      )
    : [];
  const prizeOf = new Map(prizes.map((p) => [p.user_id, p.total]));

  const [{ count }] = await sequelize.query<{ count: string }>(
    `SELECT count(*) AS count FROM users u JOIN roles ro ON ro.id = u.role_id AND ro.key = 'student' WHERE u.deleted_at IS NULL`,
    { type: QueryTypes.SELECT }
  );

  return {
    board,
    period,
    season: { id: season.id, name: season.name, startedAt: season.startedAt },
    startsAt: range?.startsAt ?? null,
    endsAt: range?.endsAt ?? null,
    students: Number(count),
    top: ranked.map((r) => {
      const p = byId.get(r.id)!;
      return {
        userId: r.id,
        position: r.position,
        name: p.name,
        email: p.email,
        alias: p.alias,
        value: r.value,
        badge: badgeFor(board, p, r.value),
        prizeGlints: prizeOf.get(r.id) ?? 0,
      };
    }),
  };
}

// Lo que se guarda al cerrar una temporada: el top 10 de cada tabla, con los datos de ese momento
export async function snapshotRows(seasonId: string, season: Season, now: Date) {
  const rows: { seasonId: string; board: Board; position: number; userId: string; alias: string; name: string; value: number }[] = [];
  for (const board of BOARDS) {
    const period = effectivePeriod(board, "season");
    const ranked = (await rankBoard(null, board, rangeOf(board, period, season, now), RANKING_SIZE, now)).filter(
      (r) => r.position <= RANKING_SIZE
    );
    const byId = await loadPeople(ranked.map((r) => r.id));
    for (const r of ranked) {
      const p = byId.get(r.id)!;
      rows.push({ seasonId, board, position: r.position, userId: r.id, alias: p.alias, name: p.name, value: r.value });
    }
  }
  return rows;
}
