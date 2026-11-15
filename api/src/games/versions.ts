import type { Transaction } from "sequelize";
import { HttpError } from "../lib/errors.js";
import { QuestionVersion } from "../models/index.js";
import type { Question } from "../models/Question.js";

// Cada alumno juega y se le corrige con la versión de la pregunta que le tocó, aunque después se
// apruebe otra: el examen, el desafío y el repaso la guardan en sus filas (question_version), y en
// las estrellas y la práctica el navegador devuelve la que se le mostró.

// La pregunta tal como era en una versión. Tiene la respuesta: es para corregir, nunca para mandarla
export type PlayedQuestion = Pick<Question, "id" | "type" | "difficulty" | "prompt" | "content" | "answer" | "explanation"> & {
  version: number;
};

function played(v: QuestionVersion): PlayedQuestion {
  return {
    id: v.questionId,
    version: v.number,
    type: v.type,
    difficulty: v.difficulty,
    prompt: v.prompt,
    content: v.content,
    answer: v.answer,
    explanation: v.explanation,
  };
}

// La versión `number` de una pregunta. Con onlyPublished (cuando el número lo mandó el navegador),
// solo una que los alumnos hayan podido ver: la publicada o una que quedó vieja, nunca un borrador
export async function questionAt(
  questionId: string,
  number: number,
  t?: Transaction,
  { onlyPublished = false } = {}
): Promise<PlayedQuestion | null> {
  const version = await QuestionVersion.findOne({
    where: { questionId, number, ...(onlyPublished ? { status: ["published", "replaced"] } : {}) },
    transaction: t,
  });
  return version && played(version);
}

// Varias a la vez, para mostrar las preguntas de un examen, un desafío o un repaso. Por id de pregunta
export async function questionsAt(
  rows: { questionId: string; questionVersion: number }[],
  t?: Transaction
): Promise<Map<string, PlayedQuestion>> {
  if (rows.length === 0) return new Map();
  const versions = await QuestionVersion.findAll({
    where: { questionId: rows.map((r) => r.questionId) },
    transaction: t,
  });
  const map = new Map<string, PlayedQuestion>();
  for (const row of rows) {
    const v = versions.find((x) => x.questionId === row.questionId && x.number === row.questionVersion);
    if (v) map.set(row.questionId, played(v));
  }
  return map;
}

// El número que tiene que viajar con una pregunta publicada (questions.version nunca está vacío en una
// publicada, pero TypeScript no lo sabe)
export function publishedVersion(question: Pick<Question, "version">): number {
  return question.version ?? 1;
}

// La versión que mandó el navegador al responder (la que se le mostró). Si no viene, la publicada hoy
export function requestedVersion(value: unknown, current: number): number {
  if (value === undefined || value === null) return current;
  if (!Number.isInteger(value) || (value as number) < 1) throw new HttpError(400, "La respuesta no tiene un formato válido.");
  return value as number;
}
