import { describe, expect, it } from "vitest";
import { createUser, http, loginAs, PASSWORD } from "./helpers.js";

describe("login, logout y /me", () => {
  it("inicia sesión con email y contraseña correctos", async () => {
    await createUser("alumno@test.com");

    const res = await http().post("/auth/login").send({ email: "alumno@test.com", password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("alumno@test.com");
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(res.headers["set-cookie"][0]).toMatch(/session=.*HttpOnly/);
  });

  it("acepta el email con mayúsculas y espacios", async () => {
    await createUser("alumno@test.com");
    const res = await http().post("/auth/login").send({ email: "  Alumno@Test.com ", password: PASSWORD });
    expect(res.status).toBe(200);
  });

  it("responde lo mismo si la contraseña es incorrecta o si el email no existe", async () => {
    await createUser("alumno@test.com");

    const wrongPassword = await http().post("/auth/login").send({ email: "alumno@test.com", password: "otra-cosa" });
    const unknownEmail = await http().post("/auth/login").send({ email: "nadie@test.com", password: PASSWORD });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it("no deja entrar a quien todavía no eligió su contraseña", async () => {
    await createUser("alumno@test.com", null);
    const res = await http().post("/auth/login").send({ email: "alumno@test.com", password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it("/me devuelve el usuario con sesión y 401 sin sesión", async () => {
    await createUser("alumno@test.com");
    const agent = await loginAs("alumno@test.com");

    expect((await agent.get("/me")).status).toBe(200);
    expect((await http().get("/me")).status).toBe(401);
  });

  it("después del logout, /me da 401", async () => {
    await createUser("alumno@test.com");
    const agent = await loginAs("alumno@test.com");

    await agent.post("/auth/logout").expect(204);
    expect((await agent.get("/me")).status).toBe(401);
  });

  it("acepta la contraseña aunque los acentos lleguen en otra forma interna", async () => {
  await createUser("alumno@test.com", "Contraseña123".normalize("NFC"));
  const res = await http()
    .post("/auth/login")
    .send({ email: "alumno@test.com", password: "Contraseña123".normalize("NFD") });
  expect(res.status).toBe(200);
});
});