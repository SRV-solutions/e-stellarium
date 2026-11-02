import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPythonStar, createQuestion, createUser, enrolledStudent, http, loginAs } from "./helpers.js";
import { Star } from "../src/models/index.js";

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