import type { Transaction } from "sequelize";
import type { QuestionType } from "../models/Question.js";
import { deadlineFor, isLate } from "./exam.js";

// Una pregunta con reloj: las del examen y las de los desafíos
export type TimedRow = {
  correct: boolean | null;
  shownAt: Date | null;
  deadlineAt: Date | null;
  Question?: { type: QuestionType };
  update(values: { shownAt?: Date; deadlineAt?: Date; correct?: boolean }, options: { transaction: Transaction }): Promise<unknown>;
};

// Avanza el reloj hasta `now` y devuelve la pregunta que toca, o null si ya no queda ninguna.
// El reloj sigue aunque el alumno se vaya: si se le venció una pregunta, cuenta como mal y la
// siguiente se considera mostrada en el momento en que venció la anterior.
export async function advanceClock<R extends TimedRow>(rows: R[], now: Date, t: Transaction): Promise<R | null> {
  let carry: Date | null = null; // cuándo venció la anterior, si se venció sin respuesta

  for (const row of rows) {
    if (row.correct !== null) continue; // ya respondida o vencida

    if (!row.shownAt) {
      const shownAt: Date = carry ?? now;
      await row.update({ shownAt, deadlineAt: deadlineFor(row.Question!.type, shownAt) }, { transaction: t });
    }

    if (!isLate(row.deadlineAt!, now)) return row;

    await row.update({ correct: false }, { transaction: t });
    carry = row.deadlineAt!;
  }

  return null;
}
