import { describe, expect, it } from "vitest";
import { parseContentFile } from "../src/content/parse.js";

const question = (slug: string) => ({
  slug,
  type: "output",
  difficulty: "easy",
  topic: "variables",
  prompt: "¿Qué imprime este código?",
  content: { code: "print(1)", options: ["1", "2"] },
  answer: { correct: 0 },
  explanation: "Imprime 1.",
});

const validFile = {
  course: "python",
  constellation: { name: "Constelación Python", published: true },
  stars: [{ title: "Variables", questions: [question("py-uno"), question("py-dos")] }],
  bank: [question("py-banco")],
};

describe("revisión del archivo de contenido", () => {
  it("acepta un archivo bien armado", () => {
    const result = parseContentFile(validFile);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.file.stars[0]!.kind).toBe("lesson");
    expect(result.file.stars[0]!.questions).toHaveLength(2);
    expect(result.file.bank).toHaveLength(1);
  });

  it("junta todos los errores, con su ubicación", () => {
    const result = parseContentFile({
      ...validFile,
      stars: [
        { title: "Variables", questions: [question("py-uno"), { ...question("py-uno"), difficulty: "facil" }] },
        { questions: [] },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Estrella 1, pregunta 2 (py-uno): El slug está repetido en el archivo.",
      "Estrella 1, pregunta 2 (py-uno): La dificultad tiene que ser easy, medium o hard.",
      "Estrella 2: falta el título.",
    ]);
  });

  it("corta enseguida si falta la estructura general", () => {
    const result = parseContentFile({ constellation: { name: "X" }, stars: [] });

    expect(result).toEqual({
      ok: false,
      errors: ["Falta el curso (course).", "Tiene que haber al menos una estrella."],
    });
  });
});