import { describe, expect, it } from "vitest";
import { Enrollment, ProcessedPayment, User } from "../src/models/index.js";
import { createUser, provision, sentMails } from "./helpers.js";
import request from "supertest";
import { app } from "../src/app.js";

const body = {
  email: "nuevo@test.com",
  name: "Alumno Nuevo",
  paymentId: "1001",
  courses: ["python", "scripting"],
};

describe("POST /provision", () => {
  it("rechaza las llamadas sin el secreto compartido", async () => {
    const res = await request(app).post("/provision").send(body);
    expect(res.status).toBe(401);
  });

  it("valida los datos que recibe", async () => {
    expect((await provision({ ...body, email: "no-es-un-email" })).status).toBe(400);
    expect((await provision({ ...body, paymentId: "abc" })).status).toBe(400);
    expect((await provision({ ...body, courses: [] })).status).toBe(400);
  });

  it("crea el usuario, sus inscripciones y manda la bienvenida con el link", async () => {
    const res = await provision(body);

    expect(res.status).toBe(201);
    const user = await User.findOne({ where: { email: "nuevo@test.com" } });
    expect(user).not.toBeNull();
    expect(await Enrollment.count({ where: { userId: user!.id } })).toBe(2);

    const mails = sentMails();
    expect(mails).toHaveLength(1);
    expect(mails[0].to).toBe("nuevo@test.com");
    expect(mails[0].html).toContain("/create-password?token=");
  });

  it("es idempotente: el mismo pago dos veces no duplica nada", async () => {
    await provision(body);
    const second = await provision(body);

    expect(second.status).toBe(200);
    expect(second.body.status).toBe("already_processed");
    expect(await Enrollment.count()).toBe(2);
    expect(sentMails()).toHaveLength(1);
  });

  it("no duplica un curso que el alumno ya tenía", async () => {
    await provision(body);
    await provision({ ...body, paymentId: "1002", courses: ["python"] });

    expect(await Enrollment.count()).toBe(2);
  });

  it("con un curso desconocido responde 422 y deshace todo, incluido el registro del pago", async () => {
    const res = await provision({ ...body, courses: ["python", "cocina"] });

    expect(res.status).toBe(422);
    expect(await ProcessedPayment.findByPk("1001")).toBeNull();
    expect(await User.count()).toBe(0);
    expect(sentMails()).toHaveLength(0);
  });

  it("si el alumno ya tiene contraseña, manda el mail de cursos nuevos, sin link", async () => {
    await createUser("nuevo@test.com");
    await provision(body);

    const [mail] = sentMails();
    expect(mail.subject).toContain("cursos nuevos");
    expect(mail.html).not.toContain("token=");
  });
});