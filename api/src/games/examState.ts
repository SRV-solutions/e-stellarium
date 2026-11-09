import { ExamAttempt, Star, StarCompletion } from "../models/index.js";
import { retryOpensAt } from "./exam.js";
import { examOpensAt } from "./unlock.js";

// En qué situación está el examen de una constelación para un alumno
export type ExamState =
  | { status: "locked" } // le faltan lecciones
  | { status: "waiting"; opensAt: Date } // completó las lecciones, faltan los 3 días
  | { status: "open"; attempts: number } // puede empezar un intento
  | { status: "in_progress"; attemptId: string } // tiene un intento sin terminar
  | { status: "retry_wait"; opensAt: Date; lastCorrect: number } // no aprobó, faltan los 2 días
  | { status: "passed"; correctCount: number }; // aprobado: la estrella está encendida

type AttemptInfo = Pick<ExamAttempt, "id" | "finishedAt" | "correctCount" | "passed">;

// La regla, sin tocar la base. `attempts` va del más viejo al más nuevo
export function computeExamState(
  opensAt: Date | null,
  attempts: AttemptInfo[],
  now = new Date()
): ExamState {
  const passed = attempts.find((a) => a.passed);
  if (passed) return { status: "passed", correctCount: passed.correctCount! };

  const last = attempts.at(-1);
  if (last && !last.finishedAt) return { status: "in_progress", attemptId: last.id };

  if (!opensAt) return { status: "locked" };
  if (now < opensAt) return { status: "waiting", opensAt };

  if (last) {
    const retryAt = retryOpensAt(last.finishedAt!);
    if (now < retryAt) return { status: "retry_wait", opensAt: retryAt, lastCorrect: last.correctCount! };
  }

  return { status: "open", attempts: attempts.length };
}

// Busca en la base lo que necesita la regla
export async function getExamState(userId: string, exam: Star, now = new Date()): Promise<ExamState> {
  const stars = await Star.findAll({ where: { constellationId: exam.constellationId } });
  const completions = await StarCompletion.findAll({
    where: { userId, starId: stars.map((s) => s.id) },
  });
  const completedAt = new Map(completions.map((c) => [c.starId, c.createdAt]));

  const attempts = await ExamAttempt.findAll({
    where: { userId, starId: exam.id },
    order: [["number", "ASC"]],
  });

  return computeExamState(examOpensAt(stars, completedAt), attempts, now);
}
