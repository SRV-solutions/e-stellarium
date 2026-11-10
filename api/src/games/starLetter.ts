// El nombre de cada estrella en su constelación: una letra griega por módulo de la guía.
// Si el módulo tiene varias estrellas, llevan un número chiquito (β¹, β², β³). El examen es siempre Ω.
// Una lección sin módulo toma la letra de su posición, como antes.

const GREEK = "αβγδεζηθικλμνξοπρστυφχψω";
const SUPERSCRIPT = "⁰¹²³⁴⁵⁶⁷⁸⁹";

type StarLike = { id: string; position: number; kind: "lesson" | "exam"; module: number | null };

function superscript(n: number) {
  return [...String(n)].map((d) => SUPERSCRIPT[Number(d)]).join("");
}

function greek(index: number) {
  return GREEK[index] ?? String(index + 1);
}

// Recibe todas las estrellas de una constelación y devuelve la letra de cada una, por id
export function starLetters(stars: StarLike[]): Map<string, string> {
  const ordered = [...stars].sort((a, b) => a.position - b.position);
  const perModule = new Map<number, number>();
  for (const star of ordered) {
    if (star.kind === "lesson" && star.module !== null) perModule.set(star.module, (perModule.get(star.module) ?? 0) + 1);
  }

  const letters = new Map<string, string>();
  const seen = new Map<number, number>();
  for (const star of ordered) {
    if (star.kind === "exam") letters.set(star.id, "Ω");
    else if (star.module === null) letters.set(star.id, greek(star.position - 1));
    else {
      const k = (seen.get(star.module) ?? 0) + 1;
      seen.set(star.module, k);
      const base = greek(star.module - 1);
      letters.set(star.id, perModule.get(star.module)! > 1 ? base + superscript(k) : base);
    }
  }
  return letters;
}
