import type { QuestionType } from "../models/Question.js";
import { permutation } from "./shuffle.js";

// Cuántas preguntas tiene cada examen
export const EXAM_SIZE = 10;

const ALL_TYPES: QuestionType[] = ["output", "fill_blank", "order_lines", "multiple_choice"];

// Segundos para responder cada juego
export const SECONDS_PER_TYPE: Record<QuestionType, number> = {
  output: 30,
  multiple_choice: 30,
  fill_blank: 40,
  order_lines: 45,
};

// Margen para lo que tarda la respuesta en viajar por la red: no se le muestra al alumno
const NETWORK_GRACE_MS = 2000;

// Hasta cuándo puede responder una pregunta que se mostró en shownAt
export function deadlineFor(type: QuestionType, shownAt: Date): Date {
  return new Date(shownAt.getTime() + SECONDS_PER_TYPE[type] * 1000);
}

// Si una respuesta que llega en `now` ya está fuera de tiempo
export function isLate(deadline: Date, now = new Date()): boolean {
  return now.getTime() > deadline.getTime() + NETWORK_GRACE_MS;
}

type BankQuestion = { id: string; type: QuestionType };

// Sortea las preguntas de un intento: EXAM_SIZE del banco, al menos una de cada juego.
// La semilla es el id del intento, así cada intento tiene su sorteo (y los tests, uno fijo).
export function drawExamQuestions(bank: BankQuestion[], seed: string): string[] {
  if (bank.length < EXAM_SIZE) {
    throw new Error(`El banco tiene ${bank.length} preguntas y el examen necesita ${EXAM_SIZE}`);
  }

  // El banco entero, mezclado
  const shuffled = permutation(seed, bank.length).map((i) => bank[i]!);

  // Primero, la primera de cada juego que aparezca en la mezcla
  const picked: BankQuestion[] = [];
  for (const type of ALL_TYPES) {
    const first = shuffled.find((q) => q.type === type);
    if (!first) throw new Error(`El banco no tiene preguntas de tipo ${type}`);
    picked.push(first);
  }

  // Después, las que siguen en la mezcla, hasta completar
  for (const q of shuffled) {
    if (picked.length === EXAM_SIZE) break;
    if (!picked.includes(q)) picked.push(q);
  }

  // Se mezclan otra vez, para que las cuatro primeras no sean siempre una de cada juego
  return permutation(`${seed}:order`, picked.length).map((i) => picked[i]!.id);
}
