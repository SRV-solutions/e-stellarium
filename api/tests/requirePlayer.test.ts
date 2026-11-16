import { describe, expect, it } from "vitest";
import { createUser, enrolledStudent, loginAs, provision, setRole } from "./helpers.js";

const GAME_ROUTES = ["/shop", "/challenges/current", "/ranking", "/review/today", "/constellations"];

describe("las pantallas de juego y el staff sin cursos", () => {
  it("el staff sin cursos recibe 403, pero /economy y /courses siguen abiertos", async () => {
    await setRole(await createUser("admin@test.com"), "super_admin");
    const admin = await loginAs("admin@test.com");
    for (const route of GAME_ROUTES) await admin.get(route).expect(403);
    await admin.post("/shop/purchases").send({ item: "streak_freeze" }).expect(403);
    await admin.get("/economy").expect(200);
    expect((await admin.get("/courses").expect(200)).body.courses).toEqual([]);
  });

  it("el staff que cursa algo juega como un alumno", async () => {
    await setRole(await createUser("docente@test.com"), "teacher");
    await provision({ email: "docente@test.com", name: "Docente", paymentId: "9001", courses: ["python"] }).expect(201);
    const teacher = await loginAs("docente@test.com");
    for (const route of GAME_ROUTES) await teacher.get(route).expect(200);
  });

  it("un alumno no se ve afectado", async () => {
    const agent = await enrolledStudent();
    for (const route of GAME_ROUTES) await agent.get(route).expect(200);
  });
});
