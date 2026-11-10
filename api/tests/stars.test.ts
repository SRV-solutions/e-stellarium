import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPythonStar, createQuestion, createUser, enrolledStudent, http, loginAs } from "./helpers.js";
import { Star, StarCompletion, User } from "../src/models/index.js";

describe("GET /stars/:id", () => {
  it("pide sesión", async () => {
    expect((await http().get(`/stars/${randomUUID()}`)).status).toBe(401);
  });

  it("devuelve las preguntas publicadas, en orden, sin respuesta ni explicación", async () => {
    const { product, star } = await createPythonStar();
    const second = await createQuestion({ productId: product.id, starId: star.id, position: 2 });
    const first = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    await createQuestion({ productId: product.id, starId: star.id, position: 3, status: "draft" });
    const agent = await enrolledStudent();

    const res = await agent.get(`/stars/${star.id}`);

    expect(res.status).toBe(200);
    expect(res.body.star).toMatchObject({ id: star.id, title: "Variables" });
    expect(res.body.questions.map((q: { id: string }) => q.id)).toEqual([first.id, second.id]);
    for (const question of res.body.questions) {
      expect(question).not.toHaveProperty("answer");
      expect(question).not.toHaveProperty("explanation");
    }
  });

  it("cada pregunta trae su intento: cuántas veces la respondió el alumno", async () => {
    const { product, star } = await createPythonStar();
    const first = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    await createQuestion({ productId: product.id, starId: star.id, position: 2 });
    const agent = await enrolledStudent();

    const before = await agent.get(`/stars/${star.id}`);
    expect(before.body.questions.map((q: { attempt: number }) => q.attempt)).toEqual([0, 0]);

    await agent.post(`/questions/${first.id}/answer`).send({ response: { choice: 0 }, attempt: 0 });
    await agent.post(`/questions/${first.id}/answer`).send({ response: { choice: 1 }, attempt: 0 });

    const after = await agent.get(`/stars/${star.id}`);
    expect(after.body.questions.map((q: { attempt: number }) => q.attempt)).toEqual([2, 0]);
  });

  it("marca las preguntas que el alumno ya acertó alguna vez", async () => {
    const { product, star } = await createPythonStar();
    const first = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const second = await createQuestion({ productId: product.id, starId: star.id, position: 2 });
    const agent = await enrolledStudent();
    const shown = await agent.get(`/stars/${star.id}`);
    expect(shown.body.questions.map((q: { solved: boolean }) => q.solved)).toEqual([false, false]);

    // La primera: mal y después bien. La segunda: solo mal
    const options = (i: number) => shown.body.questions[i].content.options as string[];
    await agent.post(`/questions/${first.id}/answer`).send({ response: { choice: options(0).indexOf("22") }, attempt: 0 });
    const again = await agent.get(`/stars/${star.id}`);
    const right = again.body.questions[0].content.options.indexOf("4");
    await agent.post(`/questions/${first.id}/answer`).send({ response: { choice: right }, attempt: 1 });
    await agent.post(`/questions/${second.id}/answer`).send({ response: { choice: options(1).indexOf("22") }, attempt: 0 });

    const after = await agent.get(`/stars/${star.id}`);
    expect(after.body.questions.map((q: { solved: boolean }) => q.solved)).toEqual([true, false]);
  });

  it("trae el curso, la estrella que sigue y si ya estaba encendida", async () => {
    const { product, constellation, star } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const exam = await Star.create({ constellationId: constellation.id, position: 3, title: "Examen", kind: "exam" });
    const second = await Star.create({ constellationId: constellation.id, position: 2, title: "Condicionales" });
    const agent = await enrolledStudent();

    const before = await agent.get(`/stars/${star.id}`);
    expect(before.body.star.completed).toBe(false);
    expect(before.body.course).toEqual({ key: "python", name: product.name });
    expect(before.body.star.letter).toBe("α");
    expect(before.body.nextStar).toEqual({ id: second.id, title: "Condicionales", kind: "lesson", position: 2, letter: "β" });

    const right = before.body.questions[0].content.options.indexOf("4");
    await agent.post(`/questions/${question.id}/answer`).send({ response: { choice: right }, attempt: 0 });

    const after = await agent.get(`/stars/${star.id}`);
    expect(after.body.star.completed).toBe(true);

    // La última estrella no tiene siguiente
    await StarCompletion.create({ userId: (await User.findOne())!.id, starId: second.id });
    // El examen se abre 3 días después de la última lección
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await StarCompletion.update({ createdAt: fourDaysAgo }, { where: {} });
    const last = await agent.get(`/stars/${exam.id}`);
    expect(last.body.nextStar).toBeNull();
    expect(last.body.star.letter).toBe("Ω");
  });

  it("da 404 si el alumno no tiene el curso", async () => {
    const { star } = await createPythonStar();
    await createUser("alumno@test.com");
    const agent = await loginAs("alumno@test.com");

    expect((await agent.get(`/stars/${star.id}`)).status).toBe(404);
  });

  it("da 404 si la constelación no está publicada", async () => {
    const { star } = await createPythonStar({ published: false });
    const agent = await enrolledStudent();

    expect((await agent.get(`/stars/${star.id}`)).status).toBe(404);
  });

  it("da 404 si la estrella no existe o el id no es válido", async () => {
    const agent = await enrolledStudent();

    expect((await agent.get(`/stars/${randomUUID()}`)).status).toBe(404);
    expect((await agent.get("/stars/abc")).status).toBe(404);
  });

    it("da 403 si la estrella está bloqueada", async () => {
    const { constellation } = await createPythonStar();
    const second = await Star.create({ constellationId: constellation.id, position: 2, title: "Condicionales" });
    const agent = await enrolledStudent();

    const res = await agent.get(`/stars/${second.id}`);

    expect(res.status).toBe(403);
  });
});