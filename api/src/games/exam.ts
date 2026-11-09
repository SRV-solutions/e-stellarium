import { randomInt } from "node:crypto";
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

// La mezcla de opciones de una pregunta del examen: distinta en cada intento.
// present() y grade() la usan igual que en las estrellas comunes.
export function examSeed(attemptId: string, questionId: string) {
  return `exam:${attemptId}:${questionId}`;
}

// Se aprueba con 7 de 10
export const PASS_MARK = 7;

export function hasPassed(correctCount: number) {
  return correctCount >= PASS_MARK;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Si no aprueba, puede volver a rendir 2 días después de terminar
export const RETRY_AFTER_DAYS = 2;

export function retryOpensAt(finishedAt: Date): Date {
  return new Date(finishedAt.getTime() + RETRY_AFTER_DAYS * DAY_MS);
}

// El cupón: 60 % en la primera constelación que aprueba (de cualquier curso), 40 % en las siguientes
export const FIRST_COUPON_PERCENT = 60;
export const LATER_COUPON_PERCENT = 40;
export const COUPON_VALID_DAYS = 60;

export function couponPercent(couponsAlreadyEarned: number) {
  return couponsAlreadyEarned === 0 ? FIRST_COUPON_PERCENT : LATER_COUPON_PERCENT;
}

export function couponExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + COUPON_VALID_DAYS * DAY_MS);
}

// Sin 0/O, 1/I/L ni U/V, que se confunden al copiarlos a mano
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTWXYZ";
const CODE_LENGTH = 6;

// Dos letras del curso: "python" → PY, "fundamentos-backend" → FB
function coursePrefix(courseKey: string) {
  const parts = courseKey.split("-");
  const letters = parts.length > 1 ? parts.map((p) => p[0]).join("") : courseKey;
  return letters.slice(0, 2).toUpperCase();
}

// Por ejemplo ESTL-PY-7K3QM2. Si justo sale uno que ya existe, la base lo rechaza y se pide otro.
export function generateCouponCode(courseKey: string) {
  let random = "";
  for (let i = 0; i < CODE_LENGTH; i++) random += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `ESTL-${coursePrefix(courseKey)}-${random}`;
}
