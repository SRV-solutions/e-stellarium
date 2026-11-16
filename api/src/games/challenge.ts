// Los desafíos periódicos: funciones puras, sin base de datos.
import { createHash } from "node:crypto";
import type { Difficulty, QuestionType } from "../models/Question.js";
import type { ChallengePart } from "../models/ChallengeAttemptQuestion.js";
import { permutation } from "./shuffle.js";
import { addDays, argentinaDay } from "./streak.js";

// ---------- Cuándo sale ----------

// Qué días (0 = domingo, como getUTCDay) y a qué hora de Argentina sale. Viven en settings (challenge.*)
// y se editan desde el panel; estos son los de siempre, para las funciones puras y los tests.
export type ChallengeSchedule = { weekdays: number[]; hour: number };
export const DEFAULT_SCHEDULE: ChallengeSchedule = { weekdays: [1, 6], hour: 9 };
// Argentina no tiene horario de verano: siempre es UTC-3
const ARGENTINA_OFFSET_HOURS = -3;

function weekday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
}

// El momento exacto de la hora de salida de ese día (en Argentina)
function slotOn(day: string, hour: number): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) + (hour - ARGENTINA_OFFSET_HOURS) * 3_600_000);
}

// La última publicación que ya pasó: por ejemplo, un miércoles da el lunes a las 9:00
export function latestSlot(now: Date, schedule: ChallengeSchedule = DEFAULT_SCHEDULE): Date {
  const today = argentinaDay(now);
  for (let back = 0; back <= 7; back++) {
    const day = addDays(today, -back);
    if (schedule.weekdays.includes(weekday(day)) && slotOn(day, schedule.hour) <= now) return slotOn(day, schedule.hour);
  }
  throw new Error("No hay ningún día de desafío configurado");
}

// La próxima publicación después de `after`: es cuando cierra el desafío actual
export function nextSlot(after: Date, schedule: ChallengeSchedule = DEFAULT_SCHEDULE): Date {
  const today = argentinaDay(after);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const day = addDays(today, ahead);
    if (schedule.weekdays.includes(weekday(day)) && slotOn(day, schedule.hour) > after) return slotOn(day, schedule.hour);
  }
  throw new Error("No hay ningún día de desafío configurado");
}

// Cuándo sale y cuándo cierra el desafío que corresponde a `now`. previousClosesAt: cuándo cerró el
// anterior. Si cambiaron el horario mientras había uno abierto, la última salida del horario nuevo puede
// quedar antes de que cerrara el anterior: entonces el nuevo arranca justo cuando cerró el anterior (no se
// superponen) y dura hasta la siguiente salida de otro día (si no, cambiar solo la hora daría un desafío
// de una hora).
export function challengeWindow(
  now: Date,
  schedule: ChallengeSchedule = DEFAULT_SCHEDULE,
  previousClosesAt: Date | null = null
): { publishedAt: Date; closesAt: Date } {
  const publishedAt = latestSlot(now, schedule);
  if (!previousClosesAt || publishedAt >= previousClosesAt) return { publishedAt, closesAt: nextSlot(publishedAt, schedule) };
  const endOfDay = new Date(Date.parse(`${addDays(argentinaDay(previousClosesAt), 1)}T00:00:00Z`) - ARGENTINA_OFFSET_HOURS * 3_600_000 - 1);
  return { publishedAt: previousClosesAt, closesAt: nextSlot(endOfDay, schedule) };
}

// ---------- La receta ----------

// Cuántas preguntas de cada parte y de qué dificultad (una por lugar), y cuántas de sus cursos son de
// repaso. Vive en settings y la edita el admin; esta es la de siempre.
export type ChallengeRecipe = {
  own: { difficulties: Difficulty[]; review: number };
  explore: Difficulty[];
  discover: Difficulty[];
};
export const DEFAULT_RECIPE: ChallengeRecipe = {
  own: { difficulties: ["easy", "easy", "medium", "medium", "hard", "hard"], review: 2 },
  explore: ["easy", "easy", "medium"],
  discover: ["easy"],
};
export const MAX_CHALLENGE_QUESTIONS = 20;

// ---------- Lo que se guarda en settings ----------

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const; // en el orden de getUTCDay
type Values = Record<string, number>;

export function scheduleOf(s: Values): ChallengeSchedule {
  return { weekdays: DAY_KEYS.flatMap((d, i) => (s[`challenge.day_${d}`] ? [i] : [])), hour: s["challenge.hour"]! };
}

function slots(s: Values, part: string): Difficulty[] {
  return (["easy", "medium", "hard"] as Difficulty[]).flatMap((d) => Array(s[`challenge.${part}_${d}`] ?? 0).fill(d));
}

export function recipeOf(s: Values): ChallengeRecipe {
  return {
    own: { difficulties: slots(s, "own"), review: s["challenge.own_review"]! },
    explore: slots(s, "explore"),
    discover: slots(s, "discover"),
  };
}

// Lo que no puede pasar con los valores juntos (cada uno por separado ya tiene su mínimo y máximo)
export function challengeSettingsProblem(s: Values): string | null {
  const schedule = scheduleOf(s);
  const recipe = recipeOf(s);
  if (schedule.weekdays.length === 0) return "Elegí al menos un día para el desafío.";
  if (recipe.own.difficulties.length === 0) return "Tiene que haber al menos una pregunta de sus cursos.";
  if (recipe.own.review > recipe.own.difficulties.length) {
    return "No puede haber más preguntas de repaso que de sus cursos.";
  }
  const total = recipe.own.difficulties.length + recipe.explore.length + recipe.discover.length;
  if (total > MAX_CHALLENGE_QUESTIONS) return `Un desafío tiene hasta ${MAX_CHALLENGE_QUESTIONS} preguntas.`;
  return null;
}

export type Candidate = {
  id: string;
  productId: string;
  difficulty: Difficulty;
  type: QuestionType;
  seen: boolean; // se le mostró en algún desafío anterior
  failed: boolean; // se le mostró y nunca la acertó
  lastSeenAt: Date | null;
};

export type PlannedQuestion = { questionId: string; part: ChallengePart };

export type ChallengePlan = {
  questions: PlannedQuestion[];
  exploreProductId: string | null; // el curso que se le recomienda al final
};

const LEVEL: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

// Un número fijo para cada pregunta y semilla: desarma los empates igual cada vez
function tiebreak(seed: string, id: string) {
  return createHash("sha256").update(`${seed}:${id}`).digest().readUInt32LE(0);
}

function shuffled<T>(items: T[], seed: string): T[] {
  return permutation(seed, items.length).map((i) => items[i]!);
}

type Slot = { part: ChallengePart; difficulty: Difficulty; productIds: string[] };

// La mejor pregunta para un lugar: la dificultad pedida (o la más cercana), primero las que nunca
// vio, después las que falló, y entre las vistas, la que vio hace más tiempo.
function pickFor(slot: Slot, pool: Candidate[], used: Set<string>, seed: string): Candidate | null {
  const options = pool.filter((c) => !used.has(c.id) && slot.productIds.includes(c.productId));
  if (options.length === 0) return null;

  const key = (c: Candidate) => [
    Math.abs(LEVEL[c.difficulty] - LEVEL[slot.difficulty]),
    !c.seen ? 0 : c.failed ? 1 : 2,
    c.lastSeenAt?.getTime() ?? 0,
    tiebreak(seed, c.id),
  ];
  return options.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i]! - kb[i]!;
    return 0;
  })[0]!;
}

// Arma el desafío de un alumno. `own` son sus cursos; `candidates`, las preguntas de desafío de
// todos los cursos activos. La semilla es el id del intento: el mismo intento siempre da lo mismo.
export function planChallenge(
  own: string[],
  candidates: Candidate[],
  seed: string,
  recipe: ChallengeRecipe = DEFAULT_RECIPE
): ChallengePlan {
  const ownCourses = shuffled(
    own.filter((p) => candidates.some((c) => c.productId === p)),
    `${seed}:own`
  );
  if (ownCourses.length === 0) return { questions: [], exploreProductId: null };

  const others = shuffled(
    [...new Set(candidates.map((c) => c.productId))].filter((p) => !own.includes(p)).sort(),
    `${seed}:others`
  );
  const explore = others[0] ?? null;
  const discover = others[1] ?? others[0] ?? null;

  // Los lugares de sus cursos se reparten entre ellos, de a uno
  const slots: Slot[] = recipe.own.difficulties.map((difficulty, i) => ({
    part: "own",
    difficulty,
    productIds: [ownCourses[i % ownCourses.length]!],
  }));
  // Si no hay otro curso con preguntas, esos lugares también son de sus cursos
  for (const difficulty of recipe.explore) {
    slots.push(explore ? { part: "explore", difficulty, productIds: [explore] } : ownSlot(difficulty, slots.length));
  }
  for (const difficulty of recipe.discover) {
    slots.push(discover ? { part: "discover", difficulty, productIds: [discover] } : ownSlot(difficulty, slots.length));
  }
  function ownSlot(difficulty: Difficulty, i: number): Slot {
    return { part: "own", difficulty, productIds: [ownCourses[i % ownCourses.length]!] };
  }

  const used = new Set<string>();
  const picked: { slot: Slot; question: Candidate }[] = [];

  // Primero el repaso: las que falló en desafíos anteriores, la que vio hace más tiempo primero.
  // Cada una ocupa el lugar propio de dificultad más parecida.
  const toReview = candidates
    .filter((c) => c.failed && ownCourses.includes(c.productId))
    .sort((a, b) => a.lastSeenAt!.getTime() - b.lastSeenAt!.getTime() || tiebreak(seed, a.id) - tiebreak(seed, b.id))
    .slice(0, recipe.own.review);
  for (const question of toReview) {
    const free = slots
      .filter((s) => s.part === "own")
      .sort((a, b) => Math.abs(LEVEL[a.difficulty] - LEVEL[question.difficulty]) - Math.abs(LEVEL[b.difficulty] - LEVEL[question.difficulty]));
    const slot = free[0];
    if (!slot) break;
    slots.splice(slots.indexOf(slot), 1);
    used.add(question.id);
    picked.push({ slot, question });
  }

  // Después, el resto de los lugares. Si el curso del lugar se quedó sin preguntas, se prueba con
  // los otros de la misma parte (sus cursos, o los que no tiene).
  for (const slot of slots) {
    const question =
      pickFor(slot, candidates, used, seed) ??
      pickFor({ ...slot, productIds: slot.part === "own" ? ownCourses : others }, candidates, used, seed);
    if (!question) continue;
    used.add(question.id);
    picked.push({ slot, question });
  }

  // El orden: sus cursos mezclados, después Explorá y al final Descubrí (ahí va la recomendación)
  const byPart = (part: ChallengePart) =>
    shuffled(
      picked.filter((p) => p.slot.part === part).map((p) => ({ questionId: p.question.id, part })),
      `${seed}:${part}`
    );
  const questions = [...byPart("own"), ...byPart("explore"), ...byPart("discover")];

  return {
    questions,
    exploreProductId: questions.some((q) => q.part === "explore") ? explore : null,
  };
}

// La mezcla de opciones de una pregunta del desafío: distinta para cada alumno
export function challengeSeed(attemptId: string, questionId: string) {
  return `challenge:${attemptId}:${questionId}`;
}
