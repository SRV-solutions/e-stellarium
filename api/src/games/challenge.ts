// Los desafíos periódicos: funciones puras, sin base de datos.
import { createHash } from "node:crypto";
import type { Difficulty, QuestionType } from "../models/Question.js";
import type { ChallengePart } from "../models/ChallengeAttemptQuestion.js";
import { permutation } from "./shuffle.js";
import { addDays, argentinaDay } from "./streak.js";

// ---------- Cuándo sale ----------

// Lunes (1) y sábados (6) a las 9:00 de Argentina. Cuando exista la tabla settings, salen de ahí.
export const CHALLENGE_WEEKDAYS = [1, 6];
export const CHALLENGE_HOUR = 9;
// Argentina no tiene horario de verano: siempre es UTC-3
const ARGENTINA_OFFSET_HOURS = -3;

function weekday(day: string) {
  return new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = domingo
}

// El momento exacto de las 9:00 de Argentina de ese día
function slotOn(day: string): Date {
  const utcHour = CHALLENGE_HOUR - ARGENTINA_OFFSET_HOURS;
  return new Date(`${day}T${String(utcHour).padStart(2, "0")}:00:00Z`);
}

// La última publicación que ya pasó: por ejemplo, un miércoles da el lunes a las 9:00
export function latestSlot(now: Date): Date {
  const today = argentinaDay(now);
  for (let back = 0; back <= 7; back++) {
    const day = addDays(today, -back);
    if (CHALLENGE_WEEKDAYS.includes(weekday(day)) && slotOn(day) <= now) return slotOn(day);
  }
  throw new Error("No hay ningún día de desafío configurado");
}

// La próxima publicación después de `after`: es cuando cierra el desafío actual
export function nextSlot(after: Date): Date {
  const today = argentinaDay(after);
  for (let ahead = 0; ahead <= 8; ahead++) {
    const day = addDays(today, ahead);
    if (CHALLENGE_WEEKDAYS.includes(weekday(day)) && slotOn(day) > after) return slotOn(day);
  }
  throw new Error("No hay ningún día de desafío configurado");
}

// ---------- La receta ----------

// Cuántas preguntas de cada parte y de qué dificultad. Cuando exista settings, la edita el admin.
export const RECIPE = {
  own: { difficulties: ["easy", "easy", "medium", "medium", "hard", "hard"] as Difficulty[], review: 2 },
  explore: ["easy", "easy", "medium"] as Difficulty[],
  discover: ["easy"] as Difficulty[],
};

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
export function planChallenge(own: string[], candidates: Candidate[], seed: string): ChallengePlan {
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
  const slots: Slot[] = RECIPE.own.difficulties.map((difficulty, i) => ({
    part: "own",
    difficulty,
    productIds: [ownCourses[i % ownCourses.length]!],
  }));
  // Si no hay otro curso con preguntas, esos lugares también son de sus cursos
  for (const difficulty of RECIPE.explore) {
    slots.push(explore ? { part: "explore", difficulty, productIds: [explore] } : ownSlot(difficulty, slots.length));
  }
  for (const difficulty of RECIPE.discover) {
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
    .slice(0, RECIPE.own.review);
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
