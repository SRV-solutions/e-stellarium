// La experiencia que da cada cosa. Tienen que coincidir con XP en api/src/games/progress.ts
export const XP_PER_QUESTION = 10;
export const XP_PER_STAR = 50;

// Lo máximo que se puede ganar en una estrella: todas sus preguntas y encenderla
export function xpToGain(questionCount: number) {
  return questionCount * XP_PER_QUESTION + XP_PER_STAR;
}

// El repaso del día: poco, porque su valor es la constancia
export const XP_PER_REVIEW_ANSWER = 2;
export const XP_PER_REVIEW = 10;

// Los desafíos periódicos
export const XP_PER_CHALLENGE_ANSWER = 5;
export const XP_PER_CHALLENGE = 20;
