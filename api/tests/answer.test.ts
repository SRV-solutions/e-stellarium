import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { Answer, Star, StarCompletion, User, XpEvent } from "../src/models/index.js";
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
    expect(res.body).toEqual({
      correct: true,
      solution: { choice: right },
      output: "4",
      explanation: "2 + 2 es 4.",
      xpGained: 60,
      starXp: 50,
      starCompleted: true,
      newBadges: [],
    });
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

    expect(res.body).toMatchObject({
      correct: false,
      solution: { choice: options.indexOf("4") },
      xpGained: 0,
      starXp: 0,
    });
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

  it("corrige con la mezcla del intento que se le mostró", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    const first = (await shownOptions(agent, star.id)).indexOf("22");
    await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: first }, attempt: 0 });

    // Segundo intento: la pregunta viene con attempt 1 y su propia mezcla
    const res = await agent.get(`/stars/${star.id}`);
    const { attempt, content } = res.body.questions[0];
    const right = content.options.indexOf("4");
    const answer = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: right }, attempt });

    expect(attempt).toBe(1);
    expect(answer.body).toMatchObject({ correct: true, solution: { choice: right } });
  });

  it("da 400 si el intento no es un entero no negativo, y no guarda nada", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();

    for (const attempt of [-1, 1.5, "1", null]) {
      const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 0 }, attempt });
      expect(res.status).toBe(400);
    }
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

    it("da experiencia por cada pregunta, y el premio al completar la estrella", async () => {
    const { product, star } = await createPythonStar();
    const first = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const second = await createQuestion({ productId: product.id, starId: star.id, position: 2 });
    const agent = await enrolledStudent();
    const res1 = await agent.get(`/stars/${star.id}`);
    const right = (i: number) => res1.body.questions[i].content.options.indexOf("4");

    const a1 = await agent.post(`/questions/${first.id}/answer`).send({ response: { choice: right(0) } });
    expect(a1.body).toMatchObject({ xpGained: 10, starXp: 0, starCompleted: false });

    const a2 = await agent.post(`/questions/${second.id}/answer`).send({ response: { choice: right(1) } });
    expect(a2.body).toMatchObject({ xpGained: 60, starXp: 50, starCompleted: true });

    const user = await User.findOne({ where: { email: "alumno@test.com" } });
    expect(user!.totalXp).toBe(70);
    expect(await StarCompletion.count()).toBe(1);
  });

  it("no vuelve a dar experiencia por la misma pregunta ni por la misma estrella", async () => {
    const { product, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const agent = await enrolledStudent();
    const right = (await shownOptions(agent, star.id)).indexOf("4");

    await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: right } });
    const again = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: right } });

    expect(again.body).toMatchObject({ correct: true, xpGained: 0, starXp: 0, starCompleted: false });
    const user = await User.findOne({ where: { email: "alumno@test.com" } });
    expect(user!.totalXp).toBe(60);
    expect(await XpEvent.count()).toBe(2);
    expect(await StarCompletion.count()).toBe(1);
    expect(await Answer.count()).toBe(2);
  });

    it("da 403 si la pregunta es de una estrella bloqueada, y no guarda nada", async () => {
    const { product, constellation } = await createPythonStar();
    const second = await Star.create({ constellationId: constellation.id, position: 2, title: "Condicionales" });
    const question = await createQuestion({ productId: product.id, starId: second.id, position: 1 });
    const agent = await enrolledStudent();

    const res = await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: 0 } });

    expect(res.status).toBe(403);
    expect(await Answer.count()).toBe(0);
  });
});