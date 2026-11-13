import { describe, expect, it } from "vitest";
import { Enrollment, ProcessedPayment, User } from "../src/models/index.js";
import { createUser, loginAs, provision, sentMails } from "./helpers.js";
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
describe("POST /provision/refund", () => {
  const refund = (paymentId: unknown) =>
    request(app).post("/provision/refund").set("x-api-key", process.env.INTERNAL_API_KEY!).send({ paymentId });

  async function coursesOf(email: string) {
    const user = await User.findOne({ where: { email } });
    const enrollments = await Enrollment.findAll({ where: { userId: user!.id } });
    return Object.fromEntries(enrollments.map((e) => [e.paymentId, e.status]));
  }

  it("rechaza las llamadas sin el secreto compartido", async () => {
    const res = await request(app).post("/provision/refund").send({ paymentId: "1001" });
    expect(res.status).toBe(401);
  });

  it("valida el paymentId y responde 404 si ese pago nunca dio un alta", async () => {
    expect((await refund("abc")).status).toBe(400);
    expect((await refund(undefined)).status).toBe(400);
    expect((await refund("999")).status).toBe(404);
  });

  it("revoca solo los cursos de ese pago, y el alumno deja de verlos", async () => {
    await createUser("nuevo@test.com"); // ya tiene contraseña, así puede entrar
    await provision(body);
    await provision({ ...body, paymentId: "1002", courses: ["fundamentos-backend"] });

    const res = await refund(1001);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("refunded");
    expect(res.body.courses.sort()).toEqual(["python", "scripting"]);
    expect(await coursesOf("nuevo@test.com")).toEqual({ "1001": "revoked", "1002": "active" });

    const agent = await loginAs("nuevo@test.com");
    const courses = await agent.get("/courses");
    expect(courses.body.courses.map((c: { key: string }) => c.key)).toEqual(["fundamentos-backend"]);
  });

  it("es idempotente, y reenviar el alta de ese pago no devuelve el curso", async () => {
    await provision(body);
    await refund("1001");

    const second = await refund("1001");
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("already_refunded");

    expect((await provision(body)).body.status).toBe("already_processed");
    expect(await Enrollment.count({ where: { status: "active" } })).toBe(0);
  });

  it("si lo vuelve a comprar con otro pago, el curso se reactiva", async () => {
    await provision(body);
    await refund("1001");
    await provision({ ...body, paymentId: "1003", courses: ["python"] });

    const enrollments = await Enrollment.findAll({ where: { status: "active" } });
    expect(enrollments).toHaveLength(1);
    expect(enrollments[0].paymentId).toBe("1003");
  });
});
