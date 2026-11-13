import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { Coupon, User } from "../src/models/index.js";
import { createExamReady, enrolledStudent, rightResponse, wrongResponse, sentMails, loginAs, createUser } from "./helpers.js";

// Un alumno de Python con la lección encendida hace `daysAgo` días
async function examStudent(daysAgo = 4) {
  const agent = await enrolledStudent();
  const user = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
  const ready = await createExamReady(user.id, daysAgo);
  return { agent, user, ...ready };
}

// Rinde el examen entero respondiendo bien las primeras `right` preguntas
async function takeExam(agent: ReturnType<typeof request.agent>, examId: string, right = 10) {
  let res = await agent.post(`/exams/${examId}/attempts`);
  expect(res.status).toBe(201);
  const attemptId = res.body.attemptId;

  for (let position = 1; position <= 10; position++) {
    const response = position <= right ? await rightResponse(attemptId, position) : await wrongResponse(attemptId, position);
    res = await agent.post(`/exam-attempts/${attemptId}/answer`).send({ position, response });
    expect(res.status).toBe(200);
  }
  return { attemptId, res };
}

describe("GET /exams/:starId", () => {
  it("dice cuándo se abre y las reglas", async () => {
    const { agent, exam } = await examStudent(1);

    const res = await agent.get(`/exams/${exam.id}`);
    expect(res.status).toBe(200);
    expect(res.body.state.status).toBe("waiting");
    expect(res.body.star.letter).toBe("Ω");
    expect(res.body.rules).toMatchObject({ questions: 10, passMark: 7, couponPercent: 60 });
    expect(res.body.course).toEqual({ key: "python", name: expect.any(String) });
    expect(res.body.coupon).toBeNull();
  });

  it("da 404 si no es un examen, no tiene el curso o el id no es válido", async () => {
    const { agent, lesson, exam } = await examStudent();
    expect((await agent.get(`/exams/${lesson.id}`)).status).toBe(404);
    expect((await agent.get(`/exams/no-es-un-id`)).status).toBe(404);

    await createUser("otro@test.com");
    const other = await loginAs("otro@test.com");
    expect((await other.get(`/exams/${exam.id}`)).status).toBe(404);
  });
});

describe("rendir el examen por la API", () => {
  it("no deja empezar antes de los 3 días", async () => {
    const { agent, exam } = await examStudent(1);
    expect((await agent.post(`/exams/${exam.id}/attempts`)).status).toBe(409);
  });

  it("la pregunta no trae la respuesta, y el reloj viene del servidor", async () => {
    const { agent, exam } = await examStudent();
    const res = await agent.post(`/exams/${exam.id}/attempts`);

    expect(res.body).toMatchObject({ status: "question", position: 1, total: 10 });
    expect(res.body.remainingMs).toBeLessThanOrEqual(res.body.timeLimitSeconds * 1000);
    expect(res.body.question.answer).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('"correct"');
  });

  it("aprobado: resultado con cupón, mail, y el examen queda aprobado", async () => {
    const { agent, exam } = await examStudent();
    const { attemptId, res } = await takeExam(agent, exam.id);

    expect(res.body).toMatchObject({ status: "finished", correctCount: 10, passed: true, xpGained: 100 });
    const code = res.body.coupon.code;

    const mail = sentMails().at(-1)!;
    expect(mail.to).toBe("alumno@test.com");
    expect(mail.html).toContain(code);

    const after = await agent.get(`/exams/${exam.id}`);
    expect(after.body.state).toEqual({ status: "passed", correctCount: 10, attemptId });
    expect(after.body.coupon).toMatchObject({ code, percent: 60, usedAt: null });

    expect((await agent.get(`/exam-attempts/${attemptId}`)).body).toEqual(res.body);

    const coupons = await agent.get("/coupons");
    expect(coupons.body.coupons).toEqual([expect.objectContaining({ code, percent: 60, course: expect.any(Object) })]);

    const map = await agent.get("/constellations");
    const examStar = map.body.constellations[0].stars.find((s: { kind: string }) => s.kind === "exam");
    expect(examStar).toMatchObject({ completed: true, exam: { status: "passed" } });
  });

  it("no aprobado: sin cupón ni mail, y el mapa dice cuándo puede reintentar", async () => {
    const { agent, exam } = await examStudent();
    const { res } = await takeExam(agent, exam.id, 3);

    expect(res.body).toMatchObject({ status: "finished", correctCount: 3, passed: false, coupon: null });
    expect(sentMails().some((m) => m.subject.includes("cupón"))).toBe(false);

    const map = await agent.get("/constellations");
    const examStar = map.body.constellations[0].stars.find((s: { kind: string }) => s.kind === "exam");
    expect(examStar.exam).toMatchObject({ status: "retry_wait", lastCorrect: 3, couponPercent: 60 });
    expect((await agent.post(`/exams/${exam.id}/attempts`)).status).toBe(409);
  });

  it("no deja ver el intento de otro alumno", async () => {
    const { agent, exam } = await examStudent();
    const { body } = await agent.post(`/exams/${exam.id}/attempts`);

    await createUser("otro@test.com");
    const other = await loginAs("otro@test.com");
    expect((await other.get(`/exam-attempts/${body.attemptId}`)).status).toBe(404);
    expect(
      (await other.post(`/exam-attempts/${body.attemptId}/answer`).send({ position: 1, response: { choice: 0 } })).status
    ).toBe(404);
  });
});

describe("cupones para wearesrv.com", () => {
  const key = () => process.env.INTERNAL_API_KEY!;

  async function passedCoupon() {
    const { agent, exam } = await examStudent();
    const { res } = await takeExam(agent, exam.id);
    return res.body.coupon.code as string;
  }

  it("piden la clave interna", async () => {
    expect((await request(app).post("/coupons/validate").send({ code: "x" })).status).toBe(401);
    expect((await request(app).post("/coupons/redeem").send({ code: "x" })).status).toBe(401);
  });

  it("consultar no lo consume; canjear sí, y una sola vez", async () => {
    const code = await passedCoupon();

    const check = await request(app).post("/coupons/validate").set("x-api-key", key()).send({ code: code.toLowerCase() });
    expect(check.body).toMatchObject({ valid: true, code, percent: 60 });

    const first = await request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ valid: true, percent: 60 });

    const second = await request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code });
    expect(second.status).toBe(409);
    expect(second.body).toEqual({ valid: false, reason: "used" });
  });

  it("dos canjes al mismo tiempo: solo uno gana", async () => {
    const code = await passedCoupon();
    const redeem = () => request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code });

    const results = await Promise.all([redeem(), redeem(), redeem()]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
  });

  it("un código vencido o inexistente no vale", async () => {
    const code = await passedCoupon();
    await Coupon.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { code } });

    const expired = await request(app).post("/coupons/redeem").set("x-api-key", key()).send({ code });
    expect(expired.body).toEqual({ valid: false, reason: "expired" });

    const missing = await request(app).post("/coupons/validate").set("x-api-key", key()).send({ code: "ESTL-PY-NOEXIS" });
    expect(missing.body).toEqual({ valid: false, reason: "not_found" });
  });
});
