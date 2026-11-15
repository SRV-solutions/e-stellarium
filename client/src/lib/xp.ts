import type { Economy } from "../types";

// Lo máximo que se puede ganar en una estrella: todas sus preguntas y encenderla.
// Los números salen de GET /economy (useAuth().economy): se editan desde el panel, no están acá
export function xpToGain(questionCount: number, xp: Economy["xp"]) {
  return questionCount * xp.questionCorrect + xp.starCompleted;
}
