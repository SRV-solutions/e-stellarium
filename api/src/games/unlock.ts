type StarInfo = { id: string; position: number; kind: "lesson" | "exam" };

// Para cada estrella completada, cuándo la completó
type CompletedAt = Map<string, Date>;

// El examen se abre unos días después de encender la última lección
export const EXAM_OPENS_AFTER_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Cuándo se abre el examen, o null si todavía le faltan lecciones
export function examOpensAt(stars: StarInfo[], completedAt: CompletedAt): Date | null {
  const lessons = stars.filter((s) => s.kind === "lesson");
  const dates = lessons.map((s) => completedAt.get(s.id));
  if (dates.some((d) => d === undefined)) return null;

  const last = Math.max(...dates.map((d) => d!.getTime()));
  return new Date(last + EXAM_OPENS_AFTER_DAYS * DAY_MS);
}

// Devuelve los ids de las estrellas que el alumno puede abrir
export function unlockedStarIds(
  stars: StarInfo[],
  completedAt: CompletedAt,
  now = new Date()
): Set<string> {
  const lessons = stars.filter((s) => s.kind === "lesson").sort((a, b) => a.position - b.position);
  const unlocked = new Set<string>();

  lessons.forEach((star, i) => {
    const previous = lessons[i - 1];
    if (!previous || completedAt.has(previous.id) || completedAt.has(star.id)) {
      unlocked.add(star.id);
    }
  });

  const opensAt = examOpensAt(stars, completedAt);
  for (const exam of stars.filter((s) => s.kind === "exam")) {
    if (completedAt.has(exam.id) || (opensAt && opensAt <= now)) unlocked.add(exam.id);
  }

  return unlocked;
}
