import { describe, expect, it } from "vitest";
import type { Agent } from "supertest";
import { sequelize } from "../src/db.js";
import { Answer, AuditLog, ExamAttemptQuestion, Product, Question, QuestionVersion, User } from "../src/models/index.js";
import { examSeed } from "../src/games/exam.js";
import { grade } from "../src/games/grade.js";
import { questionAt } from "../src/games/versions.js";
import { verifyAuditChain } from "../src/lib/audit.js";
import { loadContent } from "../src/content/load.js";
import { parseContentFile } from "../src/content/parse.js";
import {
  createExamReady,
  createPythonStar,
  createQuestion,
  createUser,
  enrolledStudent,
  loginAs,
  setRole,
} from "./helpers.js";

async function staff(role: "teacher" | "admin" | "super_admin", email = `${role}@test.com`) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

async function lastLog(action: string) {
  return (await AuditLog.findOne({ where: { action }, order: [["id", "DESC"]] }))!;
}

// Una pregunta completa de "¿Qué imprime?", lista para enviar
const complete = {
  type: "output",
  difficulty: "medium",
  topic: "Conversiones",
  module: 2,
  prompt: "¿Qué imprime este programa?",
  content: { code: 'print(int("3") + 4)', options: ["7", "34", "Error"] },
  answer: { correct: 0 },
  explanation: "int convierte el texto en número.",
};

// Crea, envía y aprueba una pregunta en la estrella. Devuelve su id
async function publishNew(admin: Agent, starId: string, fields: object = complete) {
  const created = await admin.post("/admin/questions").send({ course: "python", dest: { starId }, ...fields });
  expect(created.status).toBe(201);
  const id = created.body.question.id;
  expect((await admin.post(`/admin/questions/${id}/submit`)).status).toBe(200);
  expect((await admin.post(`/admin/questions/${id}/approve`)).status).toBe(200);
  return id as string;
}

describe("permisos y cursos del docente", () => {
  it("un alumno no entra; el docente ve solo sus cursos", async () => {
    const student = await enrolledStudent();
    expect((await student.get("/admin/questions?course=python")).status).toBe(403);

    const { star, product } = await createPythonStar();
    const question = await createQuestion({ productId: product.id, starId: star.id, position: 1 });
    const { user: teacher, agent } = await staff("teacher");

    // Sin cursos asignados no ve ninguno
    expect((await agent.get("/admin/content/courses")).body.courses).toEqual([]);
    expect((await agent.get("/admin/questions?course=python")).status).toBe(404);
    expect((await agent.get(`/admin/questions/${question.id}`)).status).toBe(404);

    const { agent: superAgent } = await staff("super_admin");
    const put = await superAgent.put(`/admin/users/${teacher.id}/teaching`).send({ courses: ["python"] });
    expect(put.body.courses).toEqual(["python"]);

    const courses = (await agent.get("/admin/content/courses")).body.courses;
    expect(courses.map((c: { key: string }) => c.key)).toEqual(["python"]);
    expect(courses[0].stars[0]).toMatchObject({ id: star.id, letter: "α" });
    expect((await agent.get(`/admin/questions/${question.id}`)).status).toBe(200);
    // El docente no aprueba
    expect((await agent.post(`/admin/questions/${question.id}/approve`)).status).toBe(403);
    // Los otros cursos siguen afuera
    expect((await agent.get("/admin/questions?course=scratch")).status).toBe(404);
  });

  it("asignar cursos queda en la bitácora, se revierte, y es solo para docentes", async () => {
    const { user: teacher } = await staff("teacher");
    const { user: admin } = await staff("admin");
    const { agent } = await staff("super_admin");

    expect((await agent.put(`/admin/users/${admin.id}/teaching`).send({ courses: ["python"] })).status).toBe(409);
    expect((await agent.put(`/admin/users/${teacher.id}/teaching`).send({ courses: ["nada"] })).status).toBe(400);

    await agent.put(`/admin/users/${teacher.id}/teaching`).send({ courses: ["python", "scratch"] });
    const log = await lastLog("teacher.courses_update");
    expect(log.before).toEqual({ courses: [] });
    expect(log.after).toEqual({ courses: ["python", "scratch"] });
    expect((await agent.get(`/admin/users/${teacher.id}`)).body.person.teaching).toEqual(["python", "scratch"]);

    expect((await agent.post(`/admin/audit/${log.id}/revert`)).status).toBe(200);
    expect((await agent.get(`/admin/users/${teacher.id}`)).body.person.teaching).toEqual([]);
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });
});

describe("el ciclo de una pregunta", () => {
  it("borrador → revisión → publicada; los alumnos la ven recién al aprobarla", async () => {
    const { star } = await createPythonStar();
    const { user: teacher, agent: teacherAgent } = await staff("teacher");
    const { agent: admin } = await staff("admin");
    await sequelize.query(
      `INSERT INTO teacher_products (user_id, product_id) SELECT :id, id FROM products WHERE key = 'python'`,
      { replacements: { id: teacher.id } }
    );
    const student = await enrolledStudent();

    // Un borrador a medias se guarda, pero no se puede enviar
    const created = await teacherAgent
      .post("/admin/questions")
      .send({ course: "python", dest: { starId: star.id }, type: "output", prompt: "¿Qué imprime?" });
    expect(created.status).toBe(201);
    const id = created.body.question.id;
    expect(created.body.question.open).toMatchObject({ number: 1, status: "draft" });
    const incomplete = await teacherAgent.post(`/admin/questions/${id}/submit`);
    expect(incomplete.status).toBe(400);
    expect(incomplete.body.problems).toContain("Falta el tema.");

    // Nadie la ve todavía
    expect((await student.get(`/stars/${star.id}`)).body.questions).toHaveLength(0);

    await teacherAgent.patch(`/admin/questions/${id}`).send(complete);
    expect((await teacherAgent.post(`/admin/questions/${id}/submit`)).body.question.open.status).toBe("in_review");
    // En revisión no se edita
    expect((await teacherAgent.patch(`/admin/questions/${id}`).send({ topic: "Otro" })).status).toBe(409);

    const list = await admin.get("/admin/questions?course=python&filter=review");
    expect(list.body.counts.review).toBe(1);
    expect(list.body.questions[0]).toMatchObject({ id, visible: false, open: { status: "in_review", authorName: "Alumno Test" } });

    const approved = await admin.post(`/admin/questions/${id}/approve`);
    expect(approved.body.question).toMatchObject({ visible: true, open: null, published: { number: 1 } });
    const log = await lastLog("content.approve");
    expect(log).toMatchObject({ targetType: "question", targetId: id, after: { status: "published", version: 1 } });

    const seen = (await student.get(`/stars/${star.id}`)).body.questions;
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id, version: 1 });
    expect(seen[0].content.options.sort()).toEqual(["34", "7", "Error"]);
  });

  it("editar algo publicado crea la versión siguiente; los alumnos siguen viendo la anterior", async () => {
    const { star } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    const id = await publishNew(admin, star.id);
    const student = await enrolledStudent();

    const edited = await admin.patch(`/admin/questions/${id}`).send({ explanation: "Más clara." });
    expect(edited.body.question.open).toMatchObject({ number: 2, status: "draft", explanation: "Más clara." });
    expect(edited.body.question.published).toMatchObject({ number: 1, explanation: complete.explanation });
    // El juego de una publicada no cambia
    expect((await admin.patch(`/admin/questions/${id}`).send({ type: "multiple_choice" })).status).toBe(400);

    expect((await student.get(`/stars/${star.id}`)).body.questions[0].version).toBe(1);

    await admin.post(`/admin/questions/${id}/submit`);
    await admin.post(`/admin/questions/${id}/approve`);
    expect((await student.get(`/stars/${star.id}`)).body.questions[0].version).toBe(2);
    const statuses = (await QuestionVersion.findAll({ where: { questionId: id }, order: [["number", "ASC"]] })).map((v) => v.status);
    expect(statuses).toEqual(["replaced", "published"]);
  });

  it("rechazar pide un comentario, la devuelve, y se puede revertir", async () => {
    const { star, product } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    const created = await admin.post("/admin/questions").send({ course: "python", dest: { starId: star.id }, ...complete });
    const id = created.body.question.id;
    await admin.post(`/admin/questions/${id}/submit`);

    expect((await admin.post(`/admin/questions/${id}/reject`).send({ comment: "  " })).status).toBe(400);
    const rejected = await admin.post(`/admin/questions/${id}/reject`).send({ comment: "Falta una opción." });
    expect(rejected.body.question.open.status).toBe("rejected");
    expect(rejected.body.question.reviews[0]).toMatchObject({ version: 1, decision: "rejected", comment: "Falta una opción." });

    const list = await admin.get(`/admin/questions?course=python&filter=rejected`);
    expect(list.body.questions[0].open.rejection).toMatchObject({ comment: "Falta una opción." });

    const log = await lastLog("content.reject");
    expect((await admin.post(`/admin/audit/${log.id}/revert`)).status).toBe(200);
    expect((await QuestionVersion.findOne({ where: { questionId: id } }))!.status).toBe("in_review");
    expect(product).toBeTruthy();
  });

  it("despublicar la esconde y volver a publicarla la muestra; los dos se revierten", async () => {
    const { star } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    const id = await publishNew(admin, star.id);
    const student = await enrolledStudent();

    await admin.post(`/admin/questions/${id}/unpublish`);
    expect((await student.get(`/stars/${star.id}`)).body.questions).toHaveLength(0);
    expect((await admin.get("/admin/questions?course=python&filter=unpublished")).body.counts.unpublished).toBe(1);

    const log = await lastLog("content.unpublish");
    expect((await admin.post(`/admin/audit/${log.id}/revert`)).status).toBe(200);
    expect((await student.get(`/stars/${star.id}`)).body.questions).toHaveLength(1);

    await admin.post(`/admin/questions/${id}/unpublish`);
    await admin.post(`/admin/questions/${id}/republish`);
    expect((await student.get(`/stars/${star.id}`)).body.questions).toHaveLength(1);
    expect((await verifyAuditChain()).brokenAt).toBeNull();
  });

  it("revertir una aprobación vuelve a la versión anterior, salvo que ya la hayan jugado", async () => {
    const { star } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    const id = await publishNew(admin, star.id);
    await admin.patch(`/admin/questions/${id}`).send({ explanation: "v2" });
    await admin.post(`/admin/questions/${id}/submit`);
    await admin.post(`/admin/questions/${id}/approve`);

    const log = await lastLog("content.approve");
    expect(log.before).toEqual({ status: "published", version: 1 });
    expect((await admin.post(`/admin/audit/${log.id}/revert`)).status).toBe(200);
    const question = (await Question.scope("withAnswer").findByPk(id))!;
    expect(question.version).toBe(1);
    expect(question.explanation).toBe(complete.explanation);
    expect((await QuestionVersion.findOne({ where: { questionId: id, number: 2 } }))!.status).toBe("in_review");

    // La v1 ya la jugó alguien: su aprobación no se revierte
    const first = await AuditLog.findOne({ where: { action: "content.approve", targetId: id }, order: [["id", "ASC"]] });
    const student = await createUser("otro@test.com");
    await Answer.create({ userId: student.id, questionId: id, questionVersion: 1, context: "star", correct: true, response: { choice: 0 } });
    const blocked = await admin.post(`/admin/audit/${first!.id}/revert`);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatch(/despublicala/);
  });

  it("el destino tiene que ser una lección del curso, y solo cambia mientras no se publicó", async () => {
    const { star } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    expect((await admin.post("/admin/questions").send({ course: "scratch", dest: { starId: star.id }, ...complete })).status).toBe(400);
    expect((await admin.post("/admin/questions").send({ course: "python", dest: { pool: "otro" }, ...complete })).status).toBe(400);

    const created = await admin.post("/admin/questions").send({ course: "python", dest: { pool: "exam" }, ...complete });
    const id = created.body.question.id;
    const moved = await admin.patch(`/admin/questions/${id}`).send({ dest: { starId: star.id } });
    expect(moved.body.question).toMatchObject({ starId: star.id, pool: null });
    await admin.post(`/admin/questions/${id}/submit`);
    await admin.post(`/admin/questions/${id}/approve`);
    expect((await admin.patch(`/admin/questions/${id}`).send({ dest: { pool: "exam" } })).status).toBe(400);
  });
});

describe("cada alumno juega con la versión que le tocó", () => {
  it("en una estrella: si se aprueba otra mientras juega, se le corrige con la que vio", async () => {
    const { star } = await createPythonStar();
    const { agent: admin } = await staff("super_admin");
    const id = await publishNew(admin, star.id);
    const student = await enrolledStudent();

    // Ve la v1 ("7" es la correcta)
    const shown = (await student.get(`/stars/${star.id}`)).body.questions[0];
    const right = shown.content.options.indexOf("7");

    // Mientras tanto se aprueba una v2 donde la correcta es otra
    await admin.patch(`/admin/questions/${id}`).send({ content: { code: "print(1)", options: ["1", "2", "3"] }, answer: { correct: 0 } });
    await admin.post(`/admin/questions/${id}/submit`);
    await admin.post(`/admin/questions/${id}/approve`);

    const res = await student.post(`/questions/${id}/answer`).send({ response: { choice: right }, version: shown.version });
    expect(res.status).toBe(200);
    expect(res.body.correct).toBe(true);
    expect(res.body.explanation).toBe(complete.explanation);
    expect((await Answer.findOne({ where: { questionId: id } }))!.questionVersion).toBe(1);

    // Una versión que nunca se publicó no sirve
    await admin.patch(`/admin/questions/${id}`).send({ explanation: "borrador" });
    expect((await student.post(`/questions/${id}/answer`).send({ response: { choice: 0 }, version: 3 })).status).toBe(404);
  });

  it("en el examen: el intento sigue con la versión del sorteo", async () => {
    const agent = await enrolledStudent();
    const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
    const { exam } = await createExamReady(user.id);
    const { agent: admin } = await staff("super_admin");

    const attemptId = (await agent.post(`/exams/${exam.id}/attempts`)).body.attemptId;
    const first = await agent.get(`/exam-attempts/${attemptId}`);
    const row = (await ExamAttemptQuestion.findOne({ where: { attemptId, position: 1 } }))!;
    expect(row.questionVersion).toBe(1);
    const v1 = (await questionAt(row.questionId, 1))!;

    // Se aprueba una v2 de esa pregunta con otro texto
    await admin.patch(`/admin/questions/${row.questionId}`).send({ prompt: "Versión nueva" });
    await admin.post(`/admin/questions/${row.questionId}/submit`);
    await admin.post(`/admin/questions/${row.questionId}/approve`);

    // La sigue viendo y se le corrige como la v1
    const again = await agent.get(`/exam-attempts/${attemptId}`);
    expect(again.body.question.prompt).toBe(first.body.question.prompt);
    expect(again.body.question.prompt).not.toBe("Versión nueva");
    const response = grade(v1, examSeed(attemptId, row.questionId), { choice: 0, choices: [0], order: [0, 1] }).solution;
    await agent.post(`/exam-attempts/${attemptId}/answer`).send({ position: 1, response });
    expect((await row.reload()).correct).toBe(true);
  });
});

describe("load-content y las versiones", () => {
  it("si cambia lo que dice una pregunta, crea una versión nueva ya publicada", async () => {
    const q = {
      slug: "py-uno",
      type: "output",
      difficulty: "easy",
      topic: "variables",
      prompt: "¿Qué imprime?",
      content: { code: "print(1)", options: ["1", "2"] },
      answer: { correct: 0 },
      explanation: "Imprime 1.",
    };
    const file = (explanation: string) => {
      const result = parseContentFile({
        course: "python",
        constellation: { name: "Python", published: true },
        modules: [{ number: 1, title: "Primeros pasos", classes: "1-7" }],
        stars: [{ slug: "py-a", module: 1, title: "A", questions: [{ ...q, explanation }] }],
      });
      if (!result.ok) throw new Error(result.errors.join(", "));
      return result.file;
    };
    await loadContent(file("Imprime 1."));
    const question = (await Question.findOne({ where: { slug: "py-uno" } }))!;
    expect(question.version).toBe(1);

    await loadContent(file("Imprime el uno."));
    await question.reload();
    expect(question.version).toBe(2);
    const versions = await QuestionVersion.findAll({ where: { questionId: question.id }, order: [["number", "ASC"]] });
    expect(versions.map((v) => [v.number, v.status])).toEqual([[1, "replaced"], [2, "published"]]);
    expect(await Product.count()).toBeGreaterThan(0);
  });
});
