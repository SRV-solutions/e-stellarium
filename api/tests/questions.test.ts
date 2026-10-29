import { describe, expect, it } from "vitest";
import { Constellation, Product, Question, Star } from "../src/models/index.js";

async function productId(key: string) {
  const product = await Product.findOne({ where: { key } });
  return product!.id;
}

async function createPythonStar() {
  const constellation = await Constellation.create({
    productId: await productId("python"),
    name: "Constelación Python",
  });
  return Star.create({ constellationId: constellation.id, position: 1, title: "Variables" });
}

function outputQuestion(fields: { productId: string; starId?: string; position?: number }) {
  return Question.create({
    ...fields,
    type: "output",
    difficulty: "easy",
    topic: "variables",
    prompt: "¿Qué imprime este código?",
    content: { code: "x = 3\nprint(x * 2)", options: ["6", "32", "x * 2", "Error"] },
    answer: { correct: 0 },
    explanation: "x vale 3, y 3 * 2 es 6.",
  });
}

describe("preguntas", () => {
  it("no trae la respuesta salvo que se pida con withAnswer", async () => {
    const { id } = await outputQuestion({ productId: await productId("python") });

    const normal = await Question.findByPk(id);
    expect(normal!.answer).toBeUndefined();
    expect(normal!.toJSON()).not.toHaveProperty("answer");

    const withAnswer = await Question.scope("withAnswer").findByPk(id);
    expect(withAnswer!.answer).toEqual({ correct: 0 });
  });

  it("permite una pregunta en una estrella del mismo curso", async () => {
    const star = await createPythonStar();

    const question = await outputQuestion({
      productId: await productId("python"),
      starId: star.id,
      position: 1,
    });

    expect(question.starId).toBe(star.id);
  });

  it("rechaza una pregunta en una estrella de otro curso", async () => {
    const star = await createPythonStar();

    await expect(
      outputQuestion({ productId: await productId("fundamentos-backend"), starId: star.id, position: 1 })
    ).rejects.toThrow(/questions_star_product_match/);
  });

  it("al borrar la estrella, la pregunta queda en el banco", async () => {
    const star = await createPythonStar();
    const { id } = await outputQuestion({
      productId: await productId("python"),
      starId: star.id,
      position: 1,
    });

    await star.destroy();

    const question = await Question.findByPk(id);
    expect(question).not.toBeNull();
    expect(question!.starId).toBeNull();
  });
});