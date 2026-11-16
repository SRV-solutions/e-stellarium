import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import type { Difficulty } from "../models/Question.js";
import { notify, staffWith } from "../lib/notify.js";
import { challengeBankLowEmail } from "../lib/email.js";
import { recipeOf } from "./challenge.js";
import { loadSettings } from "./economy.js";

const LEVELS: Difficulty[] = ["easy", "medium", "hard"];
const PLURAL: Record<Difficulty, string> = { easy: "fáciles", medium: "medias", hard: "difíciles" };
// Si no alcanzan para estos desafíos con la receta de hoy, se avisa (el mismo rojo de la pantalla de Desafíos)
export const BANK_MIN_CHALLENGES = 3;

// Cuántas preguntas de cada dificultad usa como mucho un desafío para un mismo curso: un curso puede
// ser el tuyo, el de Explorá o el de Descubrí, así que cuenta la parte que más pide
export function neededPerChallenge(settings: Record<string, number>): Record<Difficulty, number> {
  const recipe = recipeOf(settings);
  const count = (list: Difficulty[], d: Difficulty) => list.filter((x) => x === d).length;
  return Object.fromEntries(
    LEVELS.map((d) => [d, Math.max(count(recipe.own.difficulties, d), count(recipe.explore, d), count(recipe.discover, d))])
  ) as Record<Difficulty, number>;
}

// Revisa si a algún curso le quedan pocas preguntas de desafío de alguna dificultad. Avisa (en la
// campanita y por mail) una sola vez por curso y dificultad: la fila de challenge_bank_alerts dice
// que ya se avisó, y se borra cuando se reponen. Se llama cuando el banco o la receta pueden cambiar:
// al aprobar, despublicar o volver a publicar una pregunta de desafío, al cambiar la receta y al
// salir cada desafío. No hace falta un proceso programado: el banco no cambia solo.
export async function checkChallengeBank(t: Transaction) {
  const need = neededPerChallenge(await loadSettings(t));
  // Los cursos activos con constelación (los que pueden salir en un desafío)
  const rows = await sequelize.query<{ id: string; name: string; easy: string; medium: string; hard: string }>(
    `SELECT p.id, p.name,
            count(q.id) FILTER (WHERE q.difficulty = 'easy') AS easy,
            count(q.id) FILTER (WHERE q.difficulty = 'medium') AS medium,
            count(q.id) FILTER (WHERE q.difficulty = 'hard') AS hard
       FROM products p
       JOIN constellations c ON c.product_id = p.id
       LEFT JOIN questions q ON q.product_id = p.id AND q.pool = 'challenge' AND q.status = 'published'
      WHERE p.active
      GROUP BY p.id, p.name`,
    { type: QueryTypes.SELECT, transaction: t }
  );

  const low: { productId: string; name: string; difficulty: Difficulty; left: number }[] = [];
  for (const row of rows) {
    for (const d of LEVELS) {
      const left = Number(row[d]);
      if (need[d] > 0 && left < need[d] * BANK_MIN_CHALLENGES) low.push({ productId: row.id, name: row.name, difficulty: d, left });
    }
  }

  // Lo que se repuso deja de estar avisado
  await sequelize.query(
    `DELETE FROM challenge_bank_alerts a
      WHERE NOT EXISTS (SELECT 1 FROM jsonb_to_recordset(:low::jsonb) AS l(product_id uuid, difficulty text)
                         WHERE l.product_id = a.product_id AND l.difficulty = a.difficulty)`,
    {
      replacements: { low: JSON.stringify(low.map((l) => ({ product_id: l.productId, difficulty: l.difficulty }))) },
      transaction: t,
    }
  );
  if (!low.length) return;

  // Lo nuevo: si otro pedido lo anotó al mismo tiempo, ON CONFLICT hace que avise uno solo
  const fresh = await sequelize.query<{ product_id: string; difficulty: Difficulty }>(
    `INSERT INTO challenge_bank_alerts (product_id, difficulty, created_at)
     SELECT l.product_id, l.difficulty, now() FROM jsonb_to_recordset(:low::jsonb) AS l(product_id uuid, difficulty text)
     ON CONFLICT DO NOTHING
     RETURNING product_id, difficulty`,
    {
      replacements: { low: JSON.stringify(low.map((l) => ({ product_id: l.productId, difficulty: l.difficulty }))) },
      type: QueryTypes.SELECT,
      transaction: t,
    }
  );
  if (!fresh.length) return;

  const staff = await staffWith("content:approve", t);
  for (const f of fresh) {
    const item = low.find((l) => l.productId === f.product_id && l.difficulty === f.difficulty)!;
    const left = item.left === 1 ? "Queda 1 pregunta" : `Quedan ${item.left} preguntas`;
    await notify(
      t,
      staff,
      {
        kind: "challenge_bank_low",
        title: `Se acaban las ${PLURAL[item.difficulty]} de ${item.name}`,
        body: `${left} para los desafíos: alcanzan para menos de ${BANK_MIN_CHALLENGES}. Hace falta sumar más.`,
        link: "/admin/challenges",
      },
      { ...challengeBankLowEmail(item.name, PLURAL[item.difficulty], item.left, BANK_MIN_CHALLENGES), optional: true }
    );
  }
}
