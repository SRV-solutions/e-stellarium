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
  modules: [
    { number: 1, title: "Primeros pasos", classes: "1-7" },
    { number: 2, title: "Variables y tipos de datos", classes: "8-18" },
  ],
  stars: [{ slug: "py-variables", module: 2, title: "Variables", questions: [question("py-uno"), question("py-dos")] }],
  bank: [{ ...question("py-banco"), module: 1 }],
};

const exam = { slug: "py-examen", title: "Examen", kind: "exam", questions: [] };

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
        { slug: "py-variables", title: "Variables", questions: [question("py-uno"), { ...question("py-uno"), difficulty: "facil" }] },
        { slug: "py-variables", module: 9, title: "Otra", questions: [] },
        { questions: [] },
      ],
      bank: [{ ...question("py-banco"), module: 7 }],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toEqual([
      "Estrella 1, pregunta 2 (py-uno): El slug está repetido en el archivo.",
      "Estrella 1, pregunta 2 (py-uno): La dificultad tiene que ser easy, medium o hard.",
      "Estrella 2: el slug py-variables está repetido.",
      "Estrella 2: el módulo 9 no está en la lista de módulos.",
      "Estrella 3: falta el título.",
      "Banco, pregunta 1 (py-banco): El módulo 7 no está en la lista de módulos.",
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
      stars: [
        { slug: "py-variables", module: 2, title: "Variables", questions: [question("py-uno"), question("py-nueva"), question("py-dos")] },
      ],
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

  it("carga las preguntas de desafíos aparte del banco del examen", async () => {
    await loadContent(fileOf({ ...validFile, challenges: [question("py-desafio")] }));

    const bank = await Question.findOne({ where: { slug: "py-banco" } });
    const challenge = await Question.findOne({ where: { slug: "py-desafio" } });
    const lesson = await Question.findOne({ where: { slug: "py-uno" } });
    expect(bank!.pool).toBe("exam");
    expect(challenge).toMatchObject({ pool: "challenge", starId: null });
    expect(lesson!.pool).toBeNull();
  });

  it("guarda los módulos del curso y el de cada pregunta (las de lección, el de su estrella)", async () => {
    await loadContent(fileOf(validFile));

    expect((await Constellation.findOne())!.modules).toEqual(validFile.modules);
    expect((await Star.findOne())!.module).toBe(2);
    expect((await Question.findOne({ where: { slug: "py-uno" } }))!.module).toBe(2);
    expect((await Question.findOne({ where: { slug: "py-banco" } }))!.module).toBe(1);
  });

  it("inserta lecciones antes del examen sin que el examen se convierta en lección", async () => {
    await loadContent(fileOf({ ...validFile, stars: [...validFile.stars, exam] }));
    const examBefore = (await Star.findOne({ where: { kind: "exam" } }))!;

    const lesson = { slug: "py-tipos", module: 2, title: "Tipos", questions: [question("py-tres")] };
    const summary = await loadContent(fileOf({ ...validFile, stars: [...validFile.stars, lesson, exam] }));

    expect(summary.stars).toEqual({ created: 1, updated: 1, unchanged: 1 });
    const examAfter = (await Star.findOne({ where: { kind: "exam" } }))!;
    expect(examAfter.id).toBe(examBefore.id);
    expect(examAfter.position).toBe(3);
    expect((await Star.findOne({ where: { slug: "py-tipos" } }))!.position).toBe(2);
  });

  it("la primera carga con slugs adopta las estrellas que ya existían en el mismo lugar", async () => {
    await loadContent(fileOf(validFile));
    const old = (await Star.findOne())!;
    await old.update({ slug: null }); // como estaban antes de esta versión

    await loadContent(fileOf(validFile));

    expect(await Star.count()).toBe(1);
    expect((await Star.findByPk(old.id))!.slug).toBe("py-variables");
  });

  it("si una estrella de la base falta en el archivo, o cambia de tipo, no carga nada", async () => {
    await loadContent(fileOf({ ...validFile, stars: [...validFile.stars, exam] }));

    await expect(loadContent(fileOf(validFile))).rejects.toThrow("Examen (py-examen)");
    const asLesson = { ...exam, kind: "lesson" };
    await expect(loadContent(fileOf({ ...validFile, stars: [...validFile.stars, asLesson] }))).rejects.toThrow(
      /no puede cambiar de exam a lesson/
    );
    expect(await Star.count()).toBe(2);
  });

  it("si el curso no existe, no carga nada", async () => {
    await expect(loadContent(fileOf({ ...validFile, course: "cocina" }))).rejects.toThrow(
      "Curso desconocido: cocina"
    );
    expect(await Constellation.count()).toBe(0);
  });
});