// La experiencia que da cada cosa. Tienen que coincidir con XP en api/src/games/progress.ts
export const XP_PER_QUESTION = 10;
export const XP_PER_STAR = 50;

// Lo máximo que se puede ganar en una estrella: todas sus preguntas y encenderla
export function xpToGain(questionCount: number) {
  return questionCount * XP_PER_QUESTION + XP_PER_STAR;
}
