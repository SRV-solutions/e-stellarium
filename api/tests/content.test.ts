import { describe, expect, it } from "vitest";
import { parseContentFile } from "../src/content/parse.js";
import { loadContent } from "../src/content/load.js";
import { Constellation, Question, Star } from "../src/models/index.js";

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

// Revisa el archivo y devuelve el contenido listo para cargar
function fileOf(data: unknown) {
  const result = parseContentFile(data);
  if (!result.ok) throw new Error(result.errors.join("\n"));
  return result.file;
}

describe("carga de contenido", () => {
  it("crea la constelación, las estrellas y las preguntas", async () => {
    const summary = await loadContent(fileOf(validFile));

    expect(summary).toEqual({
      constellation: "created",
      stars: { created: 1, updated: 0, unchanged: 0 },
      questions: { created: 3, updated: 0, unchanged: 0 },
      missing: [],
    });
    expect((await Constellation.findOne())!.published).toBe(true);
    expect(await Question.count({ where: { status: "published" } })).toBe(3);
  });

  it("al volver a cargar el mismo archivo, no cambia nada", async () => {
    await loadContent(fileOf(validFile));

    const summary = await loadContent(fileOf(validFile));

    expect(summary).toMatchObject({
      constellation: "unchanged",
      stars: { created: 0, updated: 0, unchanged: 1 },
      questions: { created: 0, updated: 0, unchanged: 3 },
    });
    expect(await Question.count()).toBe(3);
  });

  it("inserta una pregunta en el medio y corre las de abajo", async () => {
    await loadContent(fileOf(validFile));
    const withNew = {
      ...validFile,
      stars: [{ title: "Variables", questions: [question("py-uno"), question("py-nueva"), question("py-dos")] }],
    };

    const summary = await loadContent(fileOf(withNew));

    expect(summary.questions).toEqual({ created: 1, updated: 1, unchanged: 2 });
    const star = await Star.findOne();
    const inOrder = await Question.findAll({ where: { starId: star!.id }, order: [["position", "ASC"]] });
    expect(inOrder.map((q) => q.slug)).toEqual(["py-uno", "py-nueva", "py-dos"]);
  });

  it("avisa las preguntas que ya no están en el archivo, sin borrarlas", async () => {
    await loadContent(fileOf(validFile));

    const summary = await loadContent(fileOf({ ...validFile, bank: [] }));

    expect(summary.missing).toEqual(["py-banco"]);
    expect(await Question.count()).toBe(3);
  });

  it("si el curso no existe, no carga nada", async () => {
    await expect(loadContent(fileOf({ ...validFile, course: "cocina" }))).rejects.toThrow(
      "Curso desconocido: cocina"
    );
    expect(await Constellation.count()).toBe(0);
  });
});