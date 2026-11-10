import { validateQuestion } from "../games/validate.js";
import type { Difficulty, QuestionAnswer, QuestionContent, QuestionType } from "../models/Question.js";
import type { StarKind } from "../models/Star.js";

export type ContentQuestion = {
  slug: string;
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  prompt: string;
  content: QuestionContent;
  answer: QuestionAnswer;
  explanation: string;
};

export type ContentStar = {
  title: string;
  description: string | null;
  kind: StarKind;
  questions: ContentQuestion[];
};

export type ContentFile = {
  course: string;
  constellation: { name: string; description: string | null; published: boolean };
  stars: ContentStar[];
  bank: ContentQuestion[];
  challenges: ContentQuestion[];
};

const TYPES = ["output", "fill_blank", "order_lines", "multiple_choice"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

// Revisa una pregunta. Anota los errores en `errors` y devuelve la pregunta si está bien
function checkQuestion(raw: unknown, where: string, seen: Set<string>, errors: string[]) {
  if (!isObject(raw)) {
    errors.push(`${where}: tiene que ser un objeto.`);
    return null;
  }
  const { slug, type, difficulty, topic, prompt, content, answer, explanation } = raw;
  const label = typeof slug === "string" ? `${where} (${slug})` : where;
  const problems: string[] = [];

  if (typeof slug !== "string" || !SLUG.test(slug) || slug.length > 80) {
    problems.push("El slug tiene que ser en minúsculas, con números y guiones, como py-variables-suma.");
  } else if (seen.has(slug)) {
    problems.push("El slug está repetido en el archivo.");
  } else {
    seen.add(slug);
  }
  if (typeof type !== "string" || !TYPES.includes(type)) problems.push(`Tipo de juego inválido: ${String(type)}.`);
  if (typeof difficulty !== "string" || !DIFFICULTIES.includes(difficulty)) {
    problems.push("La dificultad tiene que ser easy, medium o hard.");
  }
  if (!isText(topic) || topic.length > 60) problems.push("Falta el tema (topic), o tiene más de 60 caracteres.");
  if (!isText(prompt)) problems.push("Falta el enunciado (prompt).");
  if (!isText(explanation)) problems.push("Falta la explicación.");
  if (typeof type === "string" && TYPES.includes(type)) {
    problems.push(...validateQuestion(type, content, answer));
  }

  for (const problem of problems) errors.push(`${label}: ${problem}`);
  return problems.length === 0 ? (raw as ContentQuestion) : null;
}

type ParseResult = { ok: true; file: ContentFile } | { ok: false; errors: string[] };

export function parseContentFile(data: unknown): ParseResult {
  if (!isObject(data)) return { ok: false, errors: ["El archivo tiene que ser un objeto JSON."] };
  const { course, constellation, stars, bank = [], challenges = [] } = data;
  const errors: string[] = [];

  // Primero, la estructura general
  if (!isText(course)) errors.push("Falta el curso (course).");
  if (!isObject(constellation) || !isText(constellation.name)) errors.push("Falta el nombre de la constelación.");
  if (!Array.isArray(stars) || stars.length === 0) errors.push("Tiene que haber al menos una estrella.");
  if (!Array.isArray(bank)) errors.push("El banco (bank) tiene que ser una lista.");
  if (!Array.isArray(challenges)) errors.push("Las preguntas de desafíos (challenges) tienen que ser una lista.");
  if (
    errors.length > 0 ||
    !isText(course) ||
    !isObject(constellation) ||
    !Array.isArray(stars) ||
    !Array.isArray(bank) ||
    !Array.isArray(challenges)
  ) {
    return { ok: false, errors };
  }

  // Después, cada estrella y cada pregunta
  const seen = new Set<string>();
  const parsedStars: ContentStar[] = [];
  stars.forEach((rawStar, i) => {
    const where = `Estrella ${i + 1}`;
    if (!isObject(rawStar) || !isText(rawStar.title)) {
      errors.push(`${where}: falta el título.`);
      return;
    }
    const kind = rawStar.kind ?? "lesson";
    if (kind !== "lesson" && kind !== "exam") errors.push(`${where}: kind tiene que ser lesson o exam.`);
    if (!Array.isArray(rawStar.questions)) {
      errors.push(`${where}: falta la lista de preguntas.`);
      return;
    }
    const questions = rawStar.questions.map((q, j) =>
      checkQuestion(q, `${where}, pregunta ${j + 1}`, seen, errors)
    );
    parsedStars.push({
      title: rawStar.title,
      description: isText(rawStar.description) ? rawStar.description : null,
      kind: kind as StarKind,
      questions: questions.filter((q) => q !== null),
    });
  });
  if (parsedStars.filter((s) => s.kind === "exam").length > 1) {
    errors.push("Solo puede haber un examen por constelación.");
  }
  const parsedBank = bank.map((q, j) => checkQuestion(q, `Banco, pregunta ${j + 1}`, seen, errors));
  const parsedChallenges = challenges.map((q, j) =>
    checkQuestion(q, `Desafíos, pregunta ${j + 1}`, seen, errors)
  );

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    file: {
      course,
      constellation: {
        name: constellation.name as string,
        description: isText(constellation.description) ? constellation.description : null,
        published: constellation.published === true,
      },
      stars: parsedStars,
      bank: parsedBank.filter((q) => q !== null),
      challenges: parsedChallenges.filter((q) => q !== null),
    },
  };
}