import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { Constellation, ExamAttempt, ExamAttemptQuestion, Question, Star, User } from "../models/index.js";
import { drawExamQuestions } from "./exam.js";
import { getExamState } from "./examState.js";

// Empieza un intento: sortea las preguntas y las guarda. Si ya tenía uno en curso, devuelve ese.
// El reloj todavía no corre: arranca cuando se le muestra cada pregunta.
export async function startAttempt(userId: string, exam: Star): Promise<ExamAttempt> {
  return sequelize.transaction(async (t) => {
    // Bloquea al alumno: si aprieta "Empezar" dos veces, el segundo pedido espera al primero
    await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });

    const state = await getExamState(userId, exam, new Date(), t);
    if (state.status === "in_progress") {
      return (await ExamAttempt.findByPk(state.attemptId, { transaction: t }))!;
    }
    if (state.status !== "open") throw new HttpError(409, "El examen todavía no está abierto");

    const constellation = await Constellation.findByPk(exam.constellationId, { transaction: t });
    const bank = await Question.findAll({
      attributes: ["id", "type"],
      where: { productId: constellation!.productId, starId: null, status: "published" },
      transaction: t,
    });

    const attempt = await ExamAttempt.create(
      { userId, starId: exam.id, number: state.attempts + 1 },
      { transaction: t }
    );

    let questionIds: string[];
    try {
      questionIds = drawExamQuestions(bank, attempt.id);
    } catch {
      throw new HttpError(409, "Este examen todavía no tiene suficientes preguntas");
    }

    await ExamAttemptQuestion.bulkCreate(
      questionIds.map((questionId, i) => ({ attemptId: attempt.id, questionId, position: i + 1 })),
      { transaction: t }
    );

    return attempt;
  });
}
