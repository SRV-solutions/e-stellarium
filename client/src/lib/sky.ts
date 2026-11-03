export type Layout = "wide" | "tall";
export type Point = { x: number; y: number };

// El tamaño del cielo en cada formato (en unidades del SVG, no en píxeles)
export const SKY = {
  wide: { width: 1000, height: 560, fontSize: 15 },
  tall: { width: 400, height: 700, fontSize: 17 },
};

// Dónde va cada estrella para que juntas formen una serpiente
export function serpentPoints(count: number, layout: Layout): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = count === 1 ? 0.5 : i / (count - 1);
    return layout === "wide"
      ? { x: 95 + 775 * t, y: 470 - 355 * t - 80 * Math.sin(2.4 * Math.PI * t) }
      : { x: 200 - 115 * Math.cos(2.4 * Math.PI * t), y: 640 - 545 * t };
  });
}

// Una curva suave que pasa por todos los puntos
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  let d = `M${points[0]!.x} ${points[0]!.y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }
  return d;
}

const GREEK = "αβγδεζηθικλμνξοπρστυφχψω";

// La letra griega de la estrella en esa posición (desde 0). Después de la 24.ª, un número
export function greekLetter(index: number) {
  return GREEK[index] ?? String(index + 1);
}