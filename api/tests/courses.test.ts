import { describe, expect, it } from "vitest";
import { Enrollment } from "../src/models/index.js";
import { createUser, http, loginAs, provision } from "./helpers.js";

describe("GET /courses", () => {
  it("pide sesión", async () => {
    expect((await http().get("/courses")).status).toBe(401);
  });

  it("devuelve los cursos activos del alumno, sin datos internos", async () => {
    await createUser("alumno@test.com");
    await provision({ email: "alumno@test.com", name: "Alumno", paymentId: "3001", courses: ["python"] });
    const agent = await loginAs("alumno@test.com");

    const res = await agent.get("/courses");

    expect(res.status).toBe(200);
    expect(res.body.courses).toHaveLength(1);
    expect(res.body.courses[0]).toMatchObject({ key: "python", name: "Master en Python" });
    expect(res.body.courses[0].paymentId).toBeUndefined();
  });

  it("no muestra los cursos revocados", async () => {
    await createUser("alumno@test.com");
    await provision({ email: "alumno@test.com", name: "Alumno", paymentId: "3001", courses: ["python"] });
    await Enrollment.update({ status: "revoked" }, { where: {} });
    const agent = await loginAs("alumno@test.com");

    const res = await agent.get("/courses");

    expect(res.body.courses).toHaveLength(0);
  });
});