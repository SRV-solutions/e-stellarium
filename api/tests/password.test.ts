import { describe, expect, it } from "vitest";
import { createUser, http, provision, sentMails, tokenFromLastMail } from "./helpers.js";

async function newStudentToken() {
  await provision({ email: "nuevo@test.com", name: "Alumno Nuevo", paymentId: "2001", courses: ["python"] });
  return tokenFromLastMail();
}

describe("crear y recuperar contraseña", () => {
  it("el check reconoce un link válido y su tipo", async () => {
    const token = await newStudentToken();
    const res = await http().get(`/auth/password/check?token=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.type).toBe("set_password");
  });

  it("el check rechaza un token inventado", async () => {
    const res = await http().get("/auth/password/check?token=inventado");
    expect(res.status).toBe(400);
  });

  it("guarda la contraseña, inicia sesión y el link no se puede volver a usar", async () => {
    const token = await newStudentToken();

    const set = await http().post("/auth/password/set").send({ token, password: "NuevaClave123" });
    expect(set.status).toBe(200);
    expect(set.body.user.passwordHash).toBeUndefined();
    expect(set.headers["set-cookie"][0]).toMatch(/session=/);

    const login = await http().post("/auth/login").send({ email: "nuevo@test.com", password: "NuevaClave123" });
    expect(login.status).toBe(200);

    const reuse = await http().post("/auth/password/set").send({ token, password: "OtraClave123" });
    expect(reuse.status).toBe(400);
  });

  it("rechaza contraseñas demasiado cortas", async () => {
    const token = await newStudentToken();
    const res = await http().post("/auth/password/set").send({ token, password: "corta" });
    expect(res.status).toBe(400);
  });

  it("rechaza contraseñas de más de 72 bytes, contando los caracteres especiales", async () => {
    const token = await newStudentToken();
    // 40 "ñ" son 40 caracteres, pero 80 bytes en UTF-8
    const res = await http().post("/auth/password/set").send({ token, password: "ñ".repeat(40) });
    expect(res.status).toBe(400);
  });

  it("olvidé mi contraseña responde lo mismo exista o no la cuenta, y solo manda mail si existe", async () => {
    await createUser("alumno@test.com");

    const existing = await http().post("/auth/password/forgot").send({ email: "alumno@test.com" });
    const unknown = await http().post("/auth/password/forgot").send({ email: "nadie@test.com" });

    expect(existing.status).toBe(200);
    expect(existing.body).toEqual(unknown.body);
    expect(sentMails()).toHaveLength(1);
  });

  it("al usar un link, invalida los demás links pendientes del usuario", async () => {
    await createUser("alumno@test.com");
    await http().post("/auth/password/forgot").send({ email: "alumno@test.com" });
    const first = tokenFromLastMail();
    await http().post("/auth/password/forgot").send({ email: "alumno@test.com" });
    const second = tokenFromLastMail();

    await http().post("/auth/password/set").send({ token: second, password: "NuevaClave123" }).expect(200);
    const res = await http().post("/auth/password/set").send({ token: first, password: "OtraClave123" });
    expect(res.status).toBe(400);
  });
});