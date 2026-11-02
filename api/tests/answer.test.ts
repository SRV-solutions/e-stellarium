import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { Answer } from "../src/models/index.js";
import { createPythonStar, createQuestion, createUser, enrolledStudent, http, loginAs } from "./helpers.js";

async function shownOptions(agent: Agent, starId: string): Promise<string[]> {
  const res = await agent.get(`/stars/${starId}`);
  return res.body.questions[0].content.options;
}

describe("POST /questions/:id/answer", () => {
  it("pide sesión", async () => {
    const res = await http().post(`/questions/${randomUUID()}/answer`).send({ response: { choice: 0 } });
    expect(res.status).toBe(401);
  });

  it("acierta, devuelve la solución y la explicación, y guarda la respuesta", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    const right = (await shownOptions(agent, star.id)).indexOf("4");

    const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: right } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ correct: true, solution: { choice: right }, explanation: "2 + 2 es 4." });
    const answers = await Answer.findAll();
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({ correct: true, context: "star", response: { choice: right } });
  });

  it("marca el error y muestra dónde estaba la correcta", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    const options = await shownOptions(agent, star.id);

    const res = await agent
      .post(`/questions/${question.id}/answer`)
      .send({ response: { choice: options.indexOf("22") } });

    expect(res.body).toMatchObject({ correct: false, solution: { choice: options.indexOf("4") } });
    expect(await Answer.count({ where: { correct: false } })).toBe(1);
  });

  it("da 400 si la respuesta no tiene forma válida, y no guarda nada", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();

    expect((await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 9 } })).status).toBe(400);
    expect((await agent.post(`/questions/${question.id}/answer`)).status).toBe(400);
    expect(await Answer.count()).toBe(0);
  });

  it("da 404 si el alumno no tiene el curso", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    await createUser("alumno@test.com");
    const agent = await loginAs("alumno@test.com");

    const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 0 } });

    expect(res.status).toBe(404);
  });

  it("da 404 para preguntas en borrador o del banco", async () => {
    const { product, star } = await createPythonStar();
    const draft = await createQuestion({ productId: product.id, starId: star.id, position: 1, status: "draft" });
    const bank = await createQuestion({ productId: product.id });
    const agent = await enrolledStudent();

    for (const question of [draft, bank]) {
      const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 0 } });
      expect(res.status).toBe(404);
    }
  });
});