import type {
  AnswerResult,
  ContentCourse,
  ContentRow,
  Difficulty,
  QuestionDetail,
  QuestionType,
  QuestionVersionData,
  StudentQuestion,
} from "../../types";

// Lo que comparten las pantallas de contenido: los nombres, el borrador del formulario (y cómo se
// convierte en lo que guarda la API) y la vista del alumno (mezclar y corregir acá mismo: es el staff,
// que ya conoce la respuesta).

export const TYPE_INFO: Record<QuestionType, { name: string; description: string }> = {
  output: { name: "¿Qué imprime?", description: "Ve un código y elige qué sale en pantalla." },
  fill_blank: { name: "Completá el hueco", description: "Ve un código con huecos y elige qué va en cada uno." },
  order_lines: { name: "Ordená las líneas", description: "Recibe las líneas mezcladas y las pone en orden." },
  multiple_choice: { name: "Opción múltiple", description: "Una pregunta de concepto, sin código." },
};
export const TYPES = Object.keys(TYPE_INFO) as QuestionType[];

export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: "Fácil", medium: "Media", hard: "Difícil" };

// El estado de una pregunta en la lista: el de su versión abierta, o si los alumnos la ven
export type RowState = "draft" | "in_review" | "rejected" | "published" | "unpublished";

export const STATE_NAMES: Record<RowState, string> = {
  published: "Publicada",
  in_review: "En revisión",
  draft: "Borrador",
  rejected: "Rechazada",
  unpublished: "Despublicada",
};

// Lo mismo, dicho para quien la escribe
export const STATE_PLAIN: Record<RowState, string> = {
  draft: "Todavía no la enviaste",
  in_review: "Espera que un admin la revise",
  rejected: "Volvió con un comentario: corregila",
  published: "La ven los alumnos",
  unpublished: "Los alumnos no la ven",
};

export function rowState(row: Pick<ContentRow, "open" | "visible">): RowState {
  if (row.open) return row.open.status;
  return row.visible ? "published" : "unpublished";
}

// ---------- Destinos ----------

// "star:<id>", "exam" o "challenge": así entra en un <select>
export type DestKey = string;

export const destKey = (q: { starId: string | null; pool: "exam" | "challenge" | null }): DestKey =>
  q.starId ? `star:${q.starId}` : (q.pool ?? "challenge");

export function destPayload(key: DestKey) {
  return key.startsWith("star:") ? { starId: key.slice(5) } : { pool: key };
}

export function destLabel(course: ContentCourse | undefined, key: DestKey) {
  if (key === "exam") return { letter: "Ω", name: "Examen final" };
  if (key === "challenge") return { letter: "✦", name: "Desafíos semanales" };
  const star = course?.stars.find((s) => `star:${s.id}` === key);
  return { letter: star?.letter ?? "·", name: star?.title ?? "Una lección" };
}

// ---------- El borrador del formulario ----------

export type Draft = {
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  module: number | null;
  prompt: string;
  code: string; // ¿Qué imprime? y Completá el hueco
  options: string[]; // ¿Qué imprime? y Opción múltiple
  correct: number;
  blanks: string[][]; // Completá el hueco: las opciones de cada hueco
  correctBlanks: number[];
  lines: string; // Ordená las líneas: el código en orden, una línea por renglón
  output: string; // Completá el hueco y Ordená las líneas: se muestra si acierta
  explanation: string;
};

export function emptyDraft(type: QuestionType = "output"): Draft {
  return {
    type,
    difficulty: "easy",
    topic: "",
    module: null,
    prompt: type === "output" ? "¿Qué imprime este programa?" : "",
    code: "",
    options: ["", "", ""],
    correct: 0,
    blanks: [["", ""]],
    correctBlanks: [0],
    lines: "",
    output: "",
    explanation: "",
  };
}

const strings = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)) : []);

// Una versión de la API, en el formato del formulario
export function draftFrom(v: QuestionVersionData): Draft {
  const d = emptyDraft(v.type);
  const content = v.content;
  const answer = v.answer;
  Object.assign(d, {
    difficulty: v.difficulty,
    topic: v.topic,
    module: v.module,
    prompt: v.prompt,
    explanation: v.explanation,
    code: typeof content.code === "string" ? content.code : "",
    output: typeof answer.output === "string" ? answer.output : "",
  });
  if (v.type === "output" || v.type === "multiple_choice") {
    if (Array.isArray(content.options)) d.options = strings(content.options);
    d.correct = typeof answer.correct === "number" ? answer.correct : 0;
  }
  if (v.type === "fill_blank" && Array.isArray(content.blanks)) {
    d.blanks = (content.blanks as unknown[]).map(strings);
    d.correctBlanks = Array.isArray(answer.correct) ? (answer.correct as number[]) : d.blanks.map(() => 0);
  }
  if (v.type === "order_lines" && Array.isArray(content.lines)) d.lines = strings(content.lines).join("\n");
  return d;
}

const holesIn = (code: string) => code.split("___").length - 1;

// Un hueco nuevo en el código suma su lista de opciones; uno borrado saca la última si está vacía
export function syncBlanks(d: Draft): Draft {
  const holes = Math.max(1, holesIn(d.code));
  const blanks = [...d.blanks];
  const correct = [...d.correctBlanks];
  while (blanks.length < holes) {
    blanks.push(["", ""]);
    correct.push(0);
  }
  while (blanks.length > holes && blanks.at(-1)!.every((o) => !o.trim())) {
    blanks.pop();
    correct.pop();
  }
  return { ...d, blanks, correctBlanks: correct };
}

// Las líneas del programa, sin los renglones vacíos del final
function linesOf(d: Draft) {
  const lines = d.lines.split("\n");
  while (lines.length > 0 && !lines.at(-1)!.trim()) lines.pop();
  return lines;
}

// Lo que se manda a la API: content y answer según el juego
export function payloadOf(d: Draft) {
  let content: Record<string, unknown>;
  let answer: Record<string, unknown>;
  const output = d.output.trim() ? { output: d.output.replace(/\s+$/, "") } : {};
  switch (d.type) {
    case "output":
      content = { code: d.code, options: d.options };
      answer = { correct: d.correct };
      break;
    case "multiple_choice":
      content = { options: d.options };
      answer = { correct: d.correct };
      break;
    case "fill_blank":
      content = { code: d.code, blanks: d.blanks };
      answer = { correct: d.correctBlanks, ...output };
      break;
    case "order_lines": {
      const lines = linesOf(d);
      content = { lines };
      answer = { order: lines.map((_, i) => i), ...output };
      break;
    }
  }
  return {
    type: d.type,
    difficulty: d.difficulty,
    topic: d.topic,
    module: d.module,
    prompt: d.prompt,
    explanation: d.explanation,
    content,
    answer,
  };
}

// Lo que le falta para poder enviarla. La API lo vuelve a revisar al enviar; esto es para avisar mientras escribe
export function problemsOf(d: Draft): string[] {
  const p: string[] = [];
  if (!d.prompt.trim()) p.push("Falta lo que se le pregunta.");
  if ((d.type === "output" || d.type === "fill_blank") && !d.code.trim()) p.push("Falta el código.");
  if (d.type === "output" || d.type === "multiple_choice") {
    if (d.options.some((o) => !o.trim())) p.push("Hay opciones vacías.");
    else if (new Set(d.options).size !== d.options.length) p.push("Hay opciones repetidas.");
  }
  if (d.type === "fill_blank") {
    const holes = holesIn(d.code);
    if (d.code.trim() && holes === 0) p.push("Marcá al menos un hueco con ___ en el código.");
    else if (holes !== d.blanks.length) p.push(`El código tiene ${holes} huecos, pero hay opciones para ${d.blanks.length}.`);
    if (d.blanks.some((b) => b.some((o) => !o.trim()))) p.push("Algún hueco tiene opciones vacías.");
    else if (d.blanks.some((b) => new Set(b).size !== b.length)) p.push("Algún hueco tiene opciones repetidas.");
  }
  if (d.type === "order_lines") {
    const lines = linesOf(d);
    if (lines.length < 2) p.push("Escribí al menos 2 líneas.");
    else if (lines.some((l) => !l.trim())) p.push("Hay líneas vacías en el medio.");
  }
  if ((d.type === "fill_blank" || d.type === "order_lines") && !d.output.trim()) p.push("Falta lo que imprime cuando está bien.");
  if (!d.explanation.trim()) p.push("Falta la explicación.");
  if (!d.topic.trim()) p.push("Falta el tema.");
  return p;
}

// ---------- La vista del alumno ----------

// Una mezcla al azar (en la app real la mezcla la arma la API; acá alcanza con que se vea mezclado)
export function shuffled(n: number): number[] {
  const order = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  if (n > 1 && order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

export type Mix = number[][]; // el orden en que se muestra cada lista (opciones, cada hueco o las líneas)

export function mixFor(d: Draft): Mix {
  if (d.type === "fill_blank") return d.blanks.map((b) => shuffled(b.length));
  if (d.type === "order_lines") return [shuffled(linesOf(d).length)];
  return [shuffled(d.options.length)];
}

// La pregunta como la recibe el alumno, con la mezcla. Si la mezcla quedó vieja (cambiaron las listas), null
export function studentQuestion(d: Draft, mix: Mix): StudentQuestion | null {
  const base = { id: "preview", difficulty: d.difficulty, prompt: d.prompt, attempt: 0, solved: false };
  const pick = (items: string[], order: number[] | undefined) =>
    order && order.length === items.length ? order.map((i) => items[i]!) : null;
  if (d.type === "output" || d.type === "multiple_choice") {
    const options = pick(d.options, mix[0]);
    if (!options) return null;
    return d.type === "output"
      ? { ...base, type: "output", content: { code: d.code, options } }
      : { ...base, type: "multiple_choice", content: { options } };
  }
  if (d.type === "fill_blank") {
    if (mix.length !== d.blanks.length) return null;
    const blanks = d.blanks.map((b, i) => pick(b, mix[i]));
    if (blanks.some((b) => !b)) return null;
    return { ...base, type: "fill_blank", content: { code: d.code, blanks: blanks as string[][] } };
  }
  const lines = pick(linesOf(d), mix[0]);
  return lines && { ...base, type: "order_lines", content: { lines } };
}

// Corrige como la API (games/grade.ts), para ver el veredicto en la vista previa
export function gradePreview(d: Draft, mix: Mix, response: unknown): AnswerResult {
  const r = response as { choice?: number; choices?: number[]; order?: number[] };
  const base = { xpGained: 0, starXp: 0, starCompleted: false, newBadges: [], explanation: d.explanation };
  if (d.type === "output" || d.type === "multiple_choice") {
    const order = mix[0]!;
    return {
      ...base,
      correct: order[r.choice!] === d.correct,
      solution: { choice: order.indexOf(d.correct) },
      output: d.type === "output" ? d.options[d.correct]! : null,
    };
  }
  if (d.type === "fill_blank") {
    const correct = r.choices!.every((c, b) => mix[b]![c] === d.correctBlanks[b]);
    return {
      ...base,
      correct,
      solution: { choices: d.correctBlanks.map((c, b) => mix[b]!.indexOf(c)) },
      output: correct && d.output.trim() ? d.output : null,
    };
  }
  const lines = linesOf(d);
  const order = mix[0]!;
  const correct = r.order!.every((shown, i) => lines[order[shown]!] === lines[i]);
  return {
    ...base,
    correct,
    solution: { order: lines.map((_, i) => order.indexOf(i)) },
    output: correct && d.output.trim() ? d.output : null,
  };
}

// ---------- Fechas ----------

const TIME_ZONE = "America/Argentina/Buenos_Aires";

// "hace 5 min", "hace 2 horas", "ayer", "12 nov"
export function when(iso: string) {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
  if (hours < 48) return "ayer";
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: TIME_ZONE });
}

export type { ContentCourse, QuestionDetail };
