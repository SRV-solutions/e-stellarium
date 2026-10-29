import type { OrderLinesContent, Question } from "../models/Question.js";
import { displayOrders } from "./present.js";

type GradableQuestion = Pick<Question, "id" | "type" | "difficulty" | "prompt" | "content" | "answer">;

export type GradeResult = {
  correct: boolean;
  solution: { choice: number } | { choices: number[] } | { order: number[] };
};

// La respuesta del alumno no tiene la forma esperada
export class InvalidResponseError extends Error {}

function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}

function isPermutation(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    new Set(value).size === length &&
    value.every((v) => isIndex(v, length))
  );
}

export function grade(question: GradableQuestion, seed: string, response: unknown): GradeResult {
  if (typeof response !== "object" || response === null) throw new InvalidResponseError();
  const body = response as Record<string, unknown>;
  const orders = displayOrders(question, seed);

  switch (question.type) {
    case "output":
    case "multiple_choice": {
      const order = orders[0]!;
      const { correct } = question.answer as { correct: number };
      const choice = body.choice;
      if (!isIndex(choice, order.length)) throw new InvalidResponseError();

      return {
        correct: order[choice] === correct,
        solution: { choice: order.indexOf(correct) },
      };
    }

    case "fill_blank": {
      const { correct } = question.answer as { correct: number[] };
      const choices = body.choices;
      if (
        !Array.isArray(choices) ||
        choices.length !== orders.length ||
        !choices.every((c, b) => isIndex(c, orders[b]!.length))
      ) {
        throw new InvalidResponseError();
      }

      return {
        correct: choices.every((c, b) => orders[b]![c] === correct[b]),
        solution: { choices: correct.map((c, b) => orders[b]!.indexOf(c)) },
      };
    }

    case "order_lines": {
      const order = orders[0]!;
      const { lines } = question.content as OrderLinesContent;
      const answerOrder = (question.answer as { order: number[] }).order;
      const studentOrder = body.order;
      if (!isPermutation(studentOrder, order.length)) throw new InvalidResponseError();

      // Se comparan los textos, no los índices: dos líneas iguales son intercambiables
      const studentLines = studentOrder.map((d) => lines[order[d]!]);
      const correctLines = answerOrder.map((i) => lines[i]);

      return {
        correct: studentLines.every((line, i) => line === correctLines[i]),
        solution: { order: answerOrder.map((i) => order.indexOf(i)) },
      };
    }
  }
}