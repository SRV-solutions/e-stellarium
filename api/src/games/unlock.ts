type StarInfo = { id: string; position: number; kind: "lesson" | "exam" };

// Devuelve los ids de las estrellas que el alumno puede abrir
export function unlockedStarIds(stars: StarInfo[], completedIds: Set<string>): Set<string> {
  const lessons = stars.filter((s) => s.kind === "lesson").sort((a, b) => a.position - b.position);
  const unlocked = new Set<string>();

  lessons.forEach((star, i) => {
    const previous = lessons[i - 1];
    if (!previous || completedIds.has(previous.id) || completedIds.has(star.id)) {
      unlocked.add(star.id);
    }
  });

  const allLessonsDone = lessons.every((s) => completedIds.has(s.id));
  for (const exam of stars.filter((s) => s.kind === "exam")) {
    if (allLessonsDone) unlocked.add(exam.id);
  }

  return unlocked;
}