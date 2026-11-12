// Los destellos que da cada cosa. Son los mismos números que GLINTS y STREAK_BADGES en
// api/src/games/glints.ts: si cambian allá, se cambian acá. Solo se usan para mostrar
export const GLINTS = {
  challengeCorrect: 3,
  challengeCompleted: 10,
  reviewCompleted: 3,
};

// Las insignias de racha: los días seguidos que piden y los destellos que dan
export const STREAK_BADGES = [
  { days: 7, name: "Cometa fugaz", glints: 20 },
  { days: 30, name: "Cometa periódico", glints: 60 },
  { days: 100, name: "Gran cometa", glints: 200 },
];

// Los destellos que dieron las insignias de una respuesta. Se restan de glintsGained al mostrar
// lo de la pregunta, porque las insignias ya tienen su propio aviso
export const badgeGlints = (badges: { glints: number }[] | undefined) =>
  (badges ?? []).reduce((sum, b) => sum + b.glints, 0);

// "1.180": los destellos con punto de miles, como se escriben en Argentina
export const formatGlints = (n: number) => n.toLocaleString("es-AR");
