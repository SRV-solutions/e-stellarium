// La figura de cada constelación y dónde va cada estrella sobre ella.
// Todo en unidades del SVG: el mapa se escala entero, así que no se deforma.

export type Layout = "wide" | "tall";
export type Point = { x: number; y: number };
// Un punto de la figura y hacia dónde va la línea en ese punto (para poner la letra al costado)
export type Spot = Point & { tx: number; ty: number };

export type Figure = {
  name: string; // cómo se llama la figura: "la Pitón"
  width: number;
  height: number;
  strokes: Point[][]; // uno o más trazos; entre trazo y trazo, el salto va de puntos
  center: Point; // donde va el examen
};

// Una curva suave que pasa por los puntos dados, como una lista de puntos muy juntos
function curve(points: [number, number][], steps = 24): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      // Catmull-Rom: la curva pasa justo por cada punto
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      out.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
    }
  }
  const last = points[points.length - 1]!;
  out.push({ x: last[0], y: last[1] });
  return out;
}

// La pitón enroscada (Python): entra por la cola, afuera, y se enrosca hasta el examen, en el centro
function python(layout: Layout): Figure {
  const wide = layout === "wide";
  const width = wide ? 1000 : 400;
  const height = wide ? 600 : 760;
  const cx = width / 2;
  const cy = height / 2;
  const [rx0, rx1, ry0, ry1] = wide ? [455, 175, 268, 112] : [160, 72, 350, 150];
  const start = (wide ? 0.78 : 0.62) * Math.PI;
  const turns = 1.3;
  const line = Array.from({ length: 401 }, (_, i) => {
    const t = i / 400;
    const angle = start + t * turns * 2 * Math.PI;
    const e = Math.pow(t, 0.9);
    return { x: cx + (rx0 + (rx1 - rx0) * e) * Math.cos(angle), y: cy + (ry0 + (ry1 - ry0) * e) * Math.sin(angle) };
  });
  return { name: "la Pitón", width, height, strokes: [line], center: { x: cx, y: cy } };
}

// Las llaves (JavaScript): se baja por la que abre, se salta y se sube por la que cierra. El examen queda adentro: { Ω }
function braces(layout: Layout): Figure {
  const wide = layout === "wide";
  const width = wide ? 1000 : 400;
  const height = wide ? 600 : 800;
  const open: [number, number][] = wide
    ? [[370, 40], [275, 52], [245, 110], [243, 200], [225, 262], [130, 300], [225, 338], [243, 400], [245, 490], [275, 548], [370, 560]]
    : [[170, 40], [118, 58], [104, 140], [103, 290], [88, 365], [42, 400], [88, 435], [103, 510], [104, 660], [118, 742], [170, 760]];
  const close = open.map(([x, y]) => [width - x, y] as [number, number]).reverse();
  return { name: "las Llaves", width, height, strokes: [curve(open), curve(close)], center: { x: width / 2, y: height / 2 } };
}

// Para un curso sin figura propia: una onda que cruza el cielo
function wave(layout: Layout): Figure {
  const wide = layout === "wide";
  const points: [number, number][] = wide
    ? [[70, 470], [250, 330], [420, 420], [600, 250], [780, 300], [930, 120]]
    : [[200, 700], [90, 560], [300, 420], [110, 280], [280, 150], [200, 50]];
  const width = wide ? 1000 : 400;
  const height = wide ? 560 : 760;
  const end = points[points.length - 1]!;
  // El examen va al final, un poco más allá
  return { name: "la Onda", width, height, strokes: [curve(points.slice(0, -1))], center: { x: end[0], y: end[1] } };
}

const FIGURES: Record<string, (layout: Layout) => Figure> = {
  python,
  "fundamentos-backend": braces,
};

export function figureFor(courseKey: string, layout: Layout): Figure {
  return (FIGURES[courseKey] ?? wave)(layout);
}

// ---- Dónde va cada estrella ----

function lengths(line: Point[]) {
  const acc = [0];
  for (let i = 1; i < line.length; i++) acc.push(acc[i - 1]! + Math.hypot(line[i]!.x - line[i - 1]!.x, line[i]!.y - line[i - 1]!.y));
  return acc;
}

function spotAt(line: Point[], acc: number[], distance: number): Spot {
  let i = acc.findIndex((v) => v >= distance - 1e-6);
  if (i === -1) i = line.length - 1;
  if (i === 0) i = 1;
  const a = line[i - 1]!;
  const b = line[i]!;
  const t = Math.min(1, Math.max(0, (distance - acc[i - 1]!) / (acc[i]! - acc[i - 1]! || 1)));
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, tx: (b.x - a.x) / len, ty: (b.y - a.y) / len };
}

// Dos estrellas del mismo módulo quedan a esta fracción de la distancia entre módulos: se ven como estrellas dobles
const PAIR = 0.42;

// Reparte las lecciones (en orden, con su módulo) sobre la figura. Con dos trazos, corta entre dos módulos,
// donde las estrellas quedan mejor repartidas. Devuelve el lugar de cada una y dónde empieza el segundo trazo (o -1)
export function placeStars(modules: (number | null)[], figure: Figure): { spots: Spot[]; cut: number } {
  const count = modules.length;
  const acc = figure.strokes.map(lengths);
  const total = acc.reduce((sum, a) => sum + a[a.length - 1]!, 0);
  const sameModule = (i: number) => modules[i] !== null && modules[i] === modules[i - 1];

  let cut = -1;
  if (figure.strokes.length > 1 && count > 1) {
    const share = acc[0]![acc[0]!.length - 1]! / total;
    let best = Infinity;
    for (let i = 1; i < count; i++) {
      if (sameModule(i)) continue;
      const diff = Math.abs(i / count - share);
      if (diff < best) {
        best = diff;
        cut = i;
      }
    }
  }

  const groups = cut === -1 ? [[0, count]] : [[0, cut], [cut, count]];
  const spots: Spot[] = [];
  groups.forEach(([from, to], s) => {
    const line = figure.strokes[s]!;
    const length = acc[s]![acc[s]!.length - 1]!;
    const gaps = [];
    for (let i = from! + 1; i < to!; i++) gaps.push(sameModule(i) ? PAIR : 1);
    const units = gaps.reduce((a, b) => a + b, 0);
    let walked = 0;
    for (let i = from!; i < to!; i++) {
      if (i > from!) walked += gaps[i - from! - 1]!;
      spots.push(spotAt(line, acc[s]!, units === 0 ? length / 2 : (length * walked) / units));
    }
  });
  return { spots, cut };
}

// ---- Dónde va cada letra ----

export type Box = { x: number; y: number; w: number; h: number };
export type LetterSpot = { x: number; y: number; anchor: "start" | "middle" | "end" };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// Cuánto ocupa una letra (un cálculo aproximado: los números chiquitos son más angostos)
function letterBox(letter: string, fontSize: number, at: LetterSpot): Box {
  const chars = [...letter];
  const w = fontSize * (0.72 + (chars.length - 1) * 0.45) + 2;
  const h = fontSize * 1.1;
  const x = at.anchor === "start" ? at.x : at.anchor === "end" ? at.x - w : at.x - w / 2;
  return { x, y: at.y - h / 2, w, h };
}

// Cada letra va a un costado de la línea, hacia afuera de la figura. Si ahí choca con otra letra, con una
// estrella o con algo de `blocked` (la mira, el examen), prueba otros lugares; si no hay ninguno libre, queda en el primero
export function placeLetters(
  spots: Spot[],
  letters: string[],
  figure: Figure,
  fontSize: number,
  blocked: Box[]
): (LetterSpot | null)[] {
  const taken: Box[] = [...blocked, ...spots.map((p) => ({ x: p.x - 9, y: p.y - 9, w: 18, h: 18 }))];
  const inside = (b: Box) => b.x > 2 && b.y > 2 && b.x + b.w < figure.width - 2 && b.y + b.h < figure.height - 2;

  return spots.map((p, i) => {
    const letter = letters[i];
    if (!letter) return null;
    // La perpendicular a la línea, del lado de afuera (lejos del centro)
    let nx = -p.ty;
    let ny = p.tx;
    if (nx * (p.x - figure.center.x) + ny * (p.y - figure.center.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    const directions = [
      [nx, ny], [-nx, -ny],
      [nx + p.tx, ny + p.ty], [nx - p.tx, ny - p.ty],
      [-nx + p.tx, -ny + p.ty], [-nx - p.tx, -ny - p.ty],
    ];
    let first: [LetterSpot, Box] | null = null;
    for (const distance of [17, 26]) {
      for (const [dx0, dy0] of directions) {
        const len = Math.hypot(dx0!, dy0!);
        const dx = dx0! / len;
        const dy = dy0! / len;
        const at: LetterSpot = {
          x: p.x + dx * distance,
          y: p.y + dy * distance,
          anchor: dx > 0.4 ? "start" : dx < -0.4 ? "end" : "middle",
        };
        const box = letterBox(letter, fontSize, at);
        first ??= [at, box];
        if (inside(box) && !taken.some((t) => overlaps(t, box))) {
          taken.push(box);
          return at;
        }
      }
    }
    taken.push(first![1]);
    return first![0];
  });
}
