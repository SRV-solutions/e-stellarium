import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../db.js";
import { Challenge } from "../models/index.js";
import { loadSettings } from "../games/economy.js";
import { challengeWindow, scheduleOf } from "../games/challenge.js";
import { listSettings } from "./economy.js";

// La pantalla de Desafíos del panel (challenges:manage): el horario y la receta (settings challenge.*,
// se cambian con updateSettings, registro challenge.update), el desafío de ahora, los últimos y cuántas
// preguntas de desafío hay por curso y dificultad.

type Stats = { challenge_id: string; started: string; finished: string; average: string | null };

async function statsOf(ids: string[]) {
  if (!ids.length) return [];
  return sequelize.query<Stats>(
    `SELECT challenge_id,
            count(*) FILTER (WHERE started_at IS NOT NULL) AS started,
            count(*) FILTER (WHERE finished_at IS NOT NULL) AS finished,
            avg(correct_count) FILTER (WHERE finished_at IS NOT NULL) AS average
       FROM challenge_attempts WHERE challenge_id IN (:ids) GROUP BY challenge_id`,
    { replacements: { ids }, type: QueryTypes.SELECT }
  );
}

export async function challengesOverview(now = new Date()) {
  const schedule = scheduleOf(await loadSettings());

  // El de ahora. Si todavía nadie lo pidió, la fila no existe: se calcula igual que al crearla
  const latest = await Challenge.findOne({
    where: { publishedAt: { [Op.lte]: now } },
    order: [["publishedAt", "DESC"]],
  });
  let current: { id: string | null; publishedAt: Date; closesAt: Date };
  if (latest && latest.closesAt > now) {
    current = { id: latest.id, publishedAt: latest.publishedAt, closesAt: latest.closesAt };
  } else {
    current = { id: null, ...challengeWindow(now, schedule, latest?.closesAt ?? null) };
  }

  // Los próximos tres, con el horario guardado: cada uno sale cuando cierra el anterior
  const upcoming: Date[] = [];
  let closes = current.closesAt;
  while (upcoming.length < 3) {
    const next = challengeWindow(closes, schedule, closes);
    upcoming.push(next.publishedAt);
    closes = next.closesAt;
  }

  const past = await Challenge.findAll({
    where: { publishedAt: { [Op.lte]: now }, ...(current.id ? { id: { [Op.ne]: current.id } } : {}) },
    order: [["publishedAt", "DESC"]],
    limit: 3,
  });
  const stats = await statsOf([...(current.id ? [current.id] : []), ...past.map((c) => c.id)]);
  const numbers = (id: string | null) => {
    const row = stats.find((s) => s.challenge_id === id);
    return {
      started: Number(row?.started ?? 0),
      finished: Number(row?.finished ?? 0),
      average: row?.average === null || row?.average === undefined ? null : Math.round(Number(row.average) * 10) / 10,
    };
  };

  // Las preguntas de desafío publicadas de cada curso activo, por dificultad
  const bank = await sequelize.query<{ key: string; name: string; easy: string; medium: string; hard: string }>(
    `SELECT p.key, p.name,
            count(*) FILTER (WHERE q.difficulty = 'easy') AS easy,
            count(*) FILTER (WHERE q.difficulty = 'medium') AS medium,
            count(*) FILTER (WHERE q.difficulty = 'hard') AS hard
       FROM questions q JOIN products p ON p.id = q.product_id AND p.active
      WHERE q.pool = 'challenge' AND q.status = 'published'
      GROUP BY p.key, p.name
      ORDER BY count(*) DESC, p.name`,
    { type: QueryTypes.SELECT }
  );

  return {
    settings: await listSettings("challenge"),
    current: { publishedAt: current.publishedAt, closesAt: current.closesAt, ...numbers(current.id) },
    upcoming,
    past: past.map((c) => ({ publishedAt: c.publishedAt, ...numbers(c.id) })),
    bank: bank.map((b) => ({ key: b.key, name: b.name, easy: Number(b.easy), medium: Number(b.medium), hard: Number(b.hard) })),
  };
}
