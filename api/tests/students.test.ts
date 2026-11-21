import { describe, expect, it } from "vitest";
import { AuditLog, Enrollment, PasswordToken, Product, StarCompletion, TeacherProduct, User } from "../src/models/index.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { checkIntegrity } from "../src/lib/integrity.js";
import { createPythonStar, createUser, enrolledStudent, loginAs, provision, sentMails, setRole } from "./helpers.js";

async function staff(role: "teacher" | "admin" | "super_admin", email = `${role}@test.com`) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

async function lastLog(action: string) {
  return (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;
}

async function student(email: string, courses: string[], paymentId: string) {
  await createUser(email);
  await provision({ email, name: "Alumno", paymentId, courses });
  return (await User.findOne({ where: { email } }))!;
}

async function statusOf(userId: string, key: string) {
  const product = await Product.findOne({ where: { key } });
  return (await Enrollment.findOne({ where: { userId, productId: product!.id } }))?.status ?? null;
}

describe("GET /admin/students", () => {
  it("lista a los alumnos con las lecciones encendidas de cada curso, sin staff ni bajas", async () => {
    const { star } = await createPythonStar();
    const sofia = await student("sofia@test.com", ["python"], "1");
    await StarCompletion.create({ userId: sofia.id, starId: star.id });
    const gone = await student("baja@test.com", ["python"], "2");
    await gone.update({ deletedAt: new Date() });
    const { agent } = await staff("admin");

    const res = await agent.get("/admin/students").expect(200);
    expect(res.body.students.map((s: { email: string }) => s.email)).toEqual(["sofia@test.com"]);
    expect(res.body.students[0].courses).toEqual([{ key: "python", name: "Master en Python", lit: 1, total: 1, passed: false }]);
    expect(res.body.courses).toEqual([{ key: "python", name: "Master en Python", count: 1 }]);
  });

  it("el docente ve solo a los alumnos de sus cursos, y solo esos cursos", async () => {
    await createPythonStar();
    await student("py@test.com", ["python"], "1");
    await student("js@test.com", ["fundamentos-backend"], "2");
    const both = await student("los2@test.com", ["python", "fundamentos-backend"], "3");
    const { user: teacher, agent } = await staff("teacher");
    const python = await Product.findOne({ where: { key: "python" } });
    await TeacherProduct.create({ userId: teacher.id, productId: python!.id });

    const res = await agent.get("/admin/students").expect(200);
    expect(res.body.students.map((s: { email: string }) => s.email).sort()).toEqual(["los2@test.com", "py@test.com"]);
    const row = res.body.students.find((s: { id: string }) => s.id === both.id);
    expect(row.courses.map((c: { key: string }) => c.key)).toEqual(["python"]);

    const js = await User.findOne({ where: { email: "js@test.com" } });
    expect((await agent.get(`/admin/students/${js!.id}`)).status).toBe(404);
    const detail = await agent.get(`/admin/students/${both.id}`).expect(200);
    expect(detail.body.student.courses.map((c: { key: string }) => c.key)).toEqual(["python"]);
    expect(detail.body.student.access).toBeUndefined(); // no puede dar cursos ni mandar links
  });

  it("busca por nombre o email y pide students:view", async () => {
    await createPythonStar();
    await student("sofia@test.com", ["python"], "1");
    const { agent } = await staff("admin");
    expect((await agent.get("/admin/students?q=SOFIA")).body.students).toHaveLength(1);
    expect((await agent.get("/admin/students?q=nadie")).body.students).toHaveLength(0);
    expect((await agent.get("/admin/students?course=nada")).status).toBe(404);

    const alumno = await enrolledStudent(["python"], "otro@test.com");
    expect((await alumno.get("/admin/students")).status).toBe(403);
  });
});

describe("GET /admin/students/:id", () => {
  it("trae dónde va, el examen, los desafíos y cómo entra", async () => {
    const { star } = await createPythonStar();
    const sofia = await student("sofia@test.com", ["python"], "1");
    const { agent } = await staff("admin");

    const res = await agent.get(`/admin/students/${sofia.id}`).expect(200);
    const course = res.body.student.courses[0];
    expect(course).toMatchObject({ key: "python", status: "active", manual: false, lit: 0, total: 1 });
    expect(course.current).toMatchObject({ lesson: star.title, index: 1, of: 1 });
    expect(res.body.student.access).toEqual({ hasPassword: true, linkUntil: null });
    expect(res.body.student.alias).toBe(sofia.alias);
    expect(res.body.student.courseOptions.length).toBeGreaterThan(1);
    expect((await agent.get("/admin/students/no-es-un-id")).status).toBe(404);
  });
});

describe("Altas manuales y cursos", () => {
  it("da de alta a alguien nuevo: crea la cuenta, le da el curso y le manda la bienvenida", async () => {
    const { agent } = await staff("admin");
    const res = await agent
      .post("/admin/enrollments")
      .send({ email: "Nueva@Test.com", name: "Nueva Alumna", courses: ["python"] })
      .expect(201);
    expect(res.body).toMatchObject({ created: true, courses: ["python"], emailSent: true });

    const user = (await User.findOne({ where: { email: "nueva@test.com" } }))!;
    const enrollment = await Enrollment.findOne({ where: { userId: user.id } });
    expect(enrollment!.paymentId).toBeNull(); // dado a mano: un reembolso no lo toca
    expect(sentMails().at(-1)!.html).toContain("create-password?token=");
    expect((await lastLog("user.create")).reversible).toBe(false);
    const grant = await lastLog("enrollment.grant");
    expect(grant.before).toEqual({ courses: [] });
    expect(grant.after).toEqual({ courses: ["python"] });
    expect((await verifyAuditChain()).brokenAt).toBeNull();
    // La cuenta nueva quedó sellada (el admin del test lo crea un ayudante, sin sellar)
    expect((await checkIntegrity()).filter((p) => p.rowId === user.id)).toEqual([]);
  });

  it("a una cuenta que ya existe le suma los cursos y le avisa sin link", async () => {
    const sofia = await student("sofia@test.com", ["python"], "1");
    const { agent } = await staff("admin");
    const res = await agent
      .post("/admin/enrollments")
      .send({ email: "sofia@test.com", courses: ["python", "fundamentos-backend"] })
      .expect(201);
    expect(res.body).toMatchObject({ created: false, courses: ["fundamentos-backend", "python"] });
    expect(sentMails().at(-1)!.subject).toBe("Tenés cursos nuevos en E-Stellarium");
    const lookup = await agent.get("/admin/enrollments/lookup?email=SOFIA@test.com").expect(200);
    expect(lookup.body.user).toMatchObject({ id: sofia.id, deleted: false, courses: ["fundamentos-backend", "python"] });
    expect((await agent.get("/admin/enrollments/lookup?email=nadie@test.com")).body.user).toBeNull();
    expect(sentMails().at(-1)!.html).toContain("Master en JavaScript");
    expect(await statusOf(sofia.id, "fundamentos-backend")).toBe("active");

    // Si ya los tiene todos, no hay nada que hacer
    expect((await agent.post("/admin/enrollments").send({ email: "sofia@test.com", courses: ["python"] })).status).toBe(409);
    // Sin nombre no se crea una cuenta
    expect((await agent.post("/admin/enrollments").send({ email: "x@test.com", courses: ["python"] })).status).toBe(400);
  });

  it("saca un curso sin borrar el avance, lo devuelve y se revierte desde la bitácora", async () => {
    const sofia = await student("sofia@test.com", ["python", "fundamentos-backend"], "1");
    const { agent } = await staff("super_admin");

    await agent.delete(`/admin/users/${sofia.id}/courses/python`).expect(200);
    expect(await statusOf(sofia.id, "python")).toBe("revoked");
    expect((await agent.delete(`/admin/users/${sofia.id}/courses/python`)).status).toBe(409);
    const revoke = await lastLog("enrollment.revoke");
    expect(revoke.after).toEqual({ courses: ["fundamentos-backend"] });
    // La bitácora los muestra con su nombre
    const audit = await agent.get("/admin/audit?action=enrollment.revoke").expect(200);
    expect(audit.body.entries[0].after).toEqual({ courses: ["Master en JavaScript"] });

    // Revertir el registro le devuelve el curso
    await agent.post(`/admin/audit/${revoke.id}/revert`).send({}).expect(200);
    expect(await statusOf(sofia.id, "python")).toBe("active");

    // Darle uno desde la ficha
    sentMails().length = 0;
    await agent.post(`/admin/users/${sofia.id}/courses`).send({ course: "scratch" }).expect(200);
    expect(await statusOf(sofia.id, "scratch")).toBe("active");
    expect((await agent.post(`/admin/users/${sofia.id}/courses`).send({ course: "scratch" })).status).toBe(409);
    const grant = await lastLog("enrollment.grant");
    await agent.post(`/admin/audit/${grant.id}/revert`).send({}).expect(200);
    expect(await statusOf(sofia.id, "scratch")).toBe("revoked");
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("no toca a alguien dado de baja y pide users:manage", async () => {
    const gone = await student("baja@test.com", ["python"], "1");
    await gone.update({ deletedAt: new Date() });
    const { agent } = await staff("admin");
    expect((await agent.post(`/admin/users/${gone.id}/courses`).send({ course: "scratch" })).status).toBe(409);
    expect((await agent.post("/admin/enrollments").send({ email: "baja@test.com", courses: ["scratch"] })).status).toBe(409);

    const { agent: teacher } = await staff("teacher");
    expect((await teacher.post("/admin/enrollments").send({ email: "a@test.com", name: "A", courses: ["python"] })).status).toBe(403);
    expect((await teacher.delete(`/admin/users/${gone.id}/courses/python`)).status).toBe(403);
  });
});

describe("POST /admin/users/:id/link", () => {
  it("si no creó la contraseña, manda un link nuevo y el anterior deja de servir", async () => {
    await provision({ email: "nueva@test.com", name: "Nueva", paymentId: "1", courses: ["python"] });
    const user = (await User.findOne({ where: { email: "nueva@test.com" } }))!;
    const first = (await PasswordToken.findOne({ where: { userId: user.id } }))!;
    const { agent } = await staff("admin");

    const res = await agent.post(`/admin/users/${user.id}/link`).expect(200);
    expect(res.body).toEqual({ type: "set_password", emailSent: true });
    await first.reload();
    expect(first.usedAt).not.toBeNull();
    expect(await PasswordToken.count({ where: { userId: user.id, usedAt: null } })).toBe(1);
    expect((await lastLog("user.link_resent")).after).toEqual({ link: "set_password" });
    const detail = await agent.get(`/admin/students/${user.id}`).expect(200);
    expect(detail.body.student.access.linkUntil).not.toBeNull();
  });

  it("si ya tiene contraseña, manda el link para cambiarla", async () => {
    const sofia = await student("sofia@test.com", ["python"], "1");
    const { agent } = await staff("admin");
    const res = await agent.post(`/admin/users/${sofia.id}/link`).expect(200);
    expect(res.body.type).toBe("reset_password");
    expect(sentMails().at(-1)!.subject).toBe("Cambiá tu contraseña de E-Stellarium");
  });
});
