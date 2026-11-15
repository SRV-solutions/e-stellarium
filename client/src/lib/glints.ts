// Los nombres de las insignias de racha (los días son fijos). Cuántos destellos da cada una sale de
// GET /economy (economy.badges), porque se edita desde el panel
export const BADGE_NAMES: Record<number, string> = {
  7: "Cometa fugaz",
  30: "Cometa periódico",
  100: "Gran cometa",
};

// Los destellos que dieron las insignias de una respuesta. Se restan de glintsGained al mostrar
// lo de la pregunta, porque las insignias ya tienen su propio aviso
export const badgeGlints = (badges: { glints: number }[] | undefined) =>
  (badges ?? []).reduce((sum, b) => sum + b.glints, 0);

// "1.180": los destellos con punto de miles, como se escriben en Argentina
export const formatGlints = (n: number) => n.toLocaleString("es-AR");
