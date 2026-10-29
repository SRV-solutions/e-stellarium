import type {
  FillBlankContent,
  OrderLinesContent,
  OutputContent,
  MultipleChoiceContent,
  Question,
  QuestionContent,
} from "../models/Question.js";
import { permutation } from "./shuffle.js";

type GameQuestion = Pick<Question, "id" | "type" | "difficulty" | "prompt" | "content">;

export type StudentQuestion = GameQuestion;

export function seedFor(userId: string, questionId: string) {
  return `${userId}:${questionId}`;
}

function isIdentity(order: number[]) {
  return order.every((value, index) => value === index);
}

// El orden en que se muestra cada lista de la pregunta. Lo usan tanto la vista como el corrector
export function displayOrders(question: GameQuestion, seed: string): number[][] {
  switch (question.type) {
    case "output":
    case "multiple_choice": {
      const { options } = question.content as OutputContent | MultipleChoiceContent;
      return [permutation(seed, options.length)];
    }
    case "fill_blank": {
      const { blanks } = question.content as FillBlankContent;
      return blanks.map((options, b) => permutation(`${seed}:${b}`, options.length));
    }
    case "order_lines": {
      const { lines } = question.content as OrderLinesContent;
      const order = permutation(seed, lines.length);
      // Si la mezcla dejó las líneas en el orden correcto, las corremos un lugar
      return [isIdentity(order) && order.length > 1 ? [...order.slice(1), order[0]!] : order];
    }
  }
}

function pick<T>(items: T[], order: number[]) {
  return order.map((index) => items[index]!);
}

// Lo que recibe el navegador: sin respuesta, sin explicación y con las listas mezcladas
export function present(question: GameQuestion, seed: string): StudentQuestion {
  const orders = displayOrders(question, seed);
  const { id, type, difficulty, prompt } = question;

  let content: QuestionContent;
  switch (type) {
    case "output": {
      const { code, options } = question.content as OutputContent;
      content = { code, options: pick(options, orders[0]!) };
      break;
    }
    case "multiple_choice": {
      const { options } = question.content as MultipleChoiceContent;
      content = { options: pick(options, orders[0]!) };
      break;
    }
    case "fill_blank": {
      const { code, blanks } = question.content as FillBlankContent;
      content = { code, blanks: blanks.map((options, b) => pick(options, orders[b]!)) };
      break;
    }
    case "order_lines": {
      const { lines } = question.content as OrderLinesContent;
      content = { lines: pick(lines, orders[0]!) };
      break;
    }
  }

  return { id, type, difficulty, prompt, content };
}