import { randomBytes } from "node:crypto";
import { Op, type WhereOptions } from "sequelize";
import { Question } from "../models/index.js";
import { drawExamQuestions } from "./exam.js";

// La práctica del examen aprobado: 10 preguntas del curso, sin reloj, sin cupón ni XP (solo cuenta para la racha).
// No se guarda nada: cada práctica tiene un id al azar, que hace de semilla para el sorteo y la mezcla.

// Con qué se practica: las preguntas publicadas del curso que están en una lección o en los desafíos.
// Nunca las del banco del examen: en la práctica se muestra la respuesta correcta, y el banco tiene que quedar secreto
export function practiceWhere(productId: string | string[]): WhereOptions<Question> {
  return {
    productId,
    status: "published",
    [Op.or]: [{ starId: { [Op.ne]: null } }, { pool: "challenge" }],
  };
}

export function newPracticeId() {
  return randomBytes(8).toString("hex");
}

export function isPracticeId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

// La mezcla de opciones de una pregunta de la práctica. El navegador devuelve el id de la práctica al responder,
// así se corrige con la misma mezcla que vio
export function practiceSeed(userId: string, practiceId: string, questionId: string) {
  return `practice:${userId}:${practiceId}:${questionId}`;
}

// Sortea las preguntas con la misma regla del examen: 10, al menos una de cada juego
export async function drawPractice(productId: string, practiceId: string) {
  const pool = await Question.findAll({ attributes: ["id", "type"], where: practiceWhere(productId) });
  const ids = drawExamQuestions(pool, practiceId);
  const questions = await Question.findAll({ where: { id: ids } });
  // findAll no respeta el orden de los ids: se vuelve a ordenar como salió el sorteo
  return ids.map((id) => questions.find((q) => q.id === id)!);
}
