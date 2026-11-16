import { describe, expect, it } from "vitest";
import { sequelize } from "../src/db.js";
import { Coupon, CouponVoid, Notification, Question, TeacherProduct, User } from "../src/models/index.js";
import { refreshNotices } from "../src/games/notices.js";
import { checkChallengeBank } from "../src/games/challengeBank.js";
import { awardStreakBadges } from "../src/games/glints.js";
import { runIntegrityCheck, sealAll } from "../src/lib/integrity.js";
import { argentinaDay, addDays } from "../src/games/streak.js";
import { createPythonStar, createUser, enrolledStudent, http, loginAs, provision, sentMails, setRole } from "./helpers.js";

async function staff(role: "teacher" | "admin" | "super_admin", email = `${role}@test.com`) {
  const user = await setRole(await createUser(email), role);
  return { user, agent: await loginAs(email) };
}

const kinds = async (userId: string) =>
  (await Notification.findAll({ where: { userId }, order: [["createdAt", "ASC"]] })).map((n) => n.kind);

// Un momento de hoy en Argentina (UTC-3, sin horario de verano)
function argentinaAt(hour: number, minute = 0) {
  const day = argentinaDay();
  return new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-03:00`);
}

describe("la campanita", () => {
  it("lista, cuenta y marca como leídos solo los avisos propios", async () => {
    await createUser("sofia@test.com");
    // Ya tiene cuenta y le llega un curso: aviso "Ya tenés Python"
    await provision({ email: "sofia@test.com", name: "Sofía", paymentId: "5001", courses: ["python"] }).expect(201);
    const sofia = await loginAs("sofia@test.com");

    expect((await sofia.get("/notifications/unread-count").expect(200)).body).toEqual({ count: 1 });
    const list = await sofia.get("/notifications").expect(200);
    expect(list.body.unread).toBe(1);
    expect(list.body.items[0]).toMatchObject({
      kind: "courses",
      title: "Ya tenés Master en Python",
      link: "/constellations",
      emailSent: true,
      readAt: null,
    });

    // Otro no puede marcar los de Sofía
    await createUser("tomas@test.com");
    const tomas = await loginAs("tomas@test.com");
    await tomas.post("/notifications/read").send({ ids: [list.body.items[0].id] }).expect(200);
    expect((await sofia.get("/notifications/unread-count")).body.count).toBe(1);

    expect((await sofia.post("/notifications/read").send({ ids: ["no-es-un-id"] })).status).toBe(400);
    expect((await sofia.post("/notifications/read").send({ ids: [list.body.items[0].id] }).expect(200)).body).toEqual({ unread: 0 });
    expect((await sofia.get("/notifications")).body.items[0].readAt).not.toBeNull();

    // Sin sesión, nada
    expect((await http().get("/notifications/unread-count")).status).toBe(401);
  });

  it("borra los leídos hace más de 90 días", async () => {
    const user = await createUser("sofia@test.com");
    const old = new Date(Date.now() - 91 * 86_400_000);
    await Notification.create({ userId: user.id, kind: "badge", title: "Vieja", body: "x", link: null, key: null, readAt: old });
    await Notification.create({ userId: user.id, kind: "badge", title: "Vieja sin leer", body: "x", link: null, key: null });
    const agent = await loginAs("sofia@test.com");
    const res = await agent.get("/notifications").expect(200);
    expect(res.body.items.map((n: { title: string }) => n.title)).toEqual(["Vieja sin leer"]);
  });
});

describe("los avisos que dependen de la hora", () => {
  it("racha en riesgo: desde las 18 si no jugó hoy, una sola vez, y se va si juega", async () => {
    const user = await createUser("sofia@test.com");
    await user.update({ streak: 6, lastActiveOn: addDays(argentinaDay(), -1) });

    await refreshNotices(user, argentinaAt(17, 59));
    expect(await kinds(user.id)).toEqual([]);

    await refreshNotices(user, argentinaAt(18, 5));
    await refreshNotices(user, argentinaAt(19, 0));
    const [notice] = await Notification.findAll({ where: { userId: user.id } });
    expect(notice).toMatchObject({ kind: "streak_risk", title: "Tu racha de 6 días está en riesgo", link: "/review" });
    expect(await kinds(user.id)).toEqual(["streak_risk"]);

    // Jugó: el aviso de hoy ya no sirve
    await user.update({ lastActiveOn: argentinaDay() });
    await refreshNotices(user, argentinaAt(20, 0));
    expect(await kinds(user.id)).toEqual([]);

    // Sin racha, no hay nada que perder
    await user.update({ streak: 0, lastActiveOn: null });
    await refreshNotices(user, argentinaAt(21, 0));
    expect(await kinds(user.id)).toEqual([]);
  });

  it("cupón por vencer: solo los vigentes que vencen en 2 días o menos, una vez", async () => {
    const user = await createUser("sofia@test.com");
    const now = new Date();
    const base = { userId: user.id, source: "shop" as const, constellationId: null, examAttemptId: null };
    const soon = await sequelize.transaction((t) =>
      Coupon.create({ ...base, code: "ESTL-TI-AAAAAA", percent: 20, expiresAt: new Date(now.getTime() + 36 * 3_600_000) }, { transaction: t })
    );
    await sequelize.transaction(async (t) => {
      await Coupon.create({ ...base, code: "ESTL-TI-BBBBBB", percent: 10, expiresAt: new Date(now.getTime() + 5 * 86_400_000) }, { transaction: t });
      await Coupon.create({ ...base, code: "ESTL-TI-CCCCCC", percent: 10, expiresAt: new Date(now.getTime() + 86_400_000), usedAt: now }, { transaction: t });
      const voided = await Coupon.create({ ...base, code: "ESTL-TI-DDDDDD", percent: 10, expiresAt: new Date(now.getTime() + 86_400_000) }, { transaction: t });
      await CouponVoid.create({ couponId: voided.id, reason: "Prueba", voidedBy: null }, { transaction: t });
    });

    await refreshNotices(user, now);
    await refreshNotices(user, now);
    const all = await Notification.findAll({ where: { userId: user.id } });
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ kind: "coupon_expiring", key: `coupon_expiring:${soon.id}` });
    expect(all[0]!.title).toMatch(/^Tu cupón del 20 % vence (mañana|el .+)$/);
  });

  it("desafío nuevo: a quien tiene un curso con constelación y todavía no lo empezó", async () => {
    await createPythonStar();
    const agent = await enrolledStudent(["python"]);
    const student = (await User.findOne({ where: { email: "alumno@test.com" } }))!;
    await createUser("staff@test.com"); // sin cursos: no le llega

    await agent.get("/notifications/unread-count").expect(200);
    await agent.get("/notifications/unread-count").expect(200);
    const challenge = (await Notification.findAll({ where: { userId: student.id, kind: "challenge" } }))!;
    expect(challenge).toHaveLength(1);
    expect(challenge[0]).toMatchObject({ link: "/challenges" });
    expect(challenge[0]!.title).toMatch(/^Salió el desafío del /);
    const staffUser = (await User.findOne({ where: { email: "staff@test.com" } }))!;
    await refreshNotices(staffUser);
    expect(await kinds(staffUser.id)).toEqual([]);
  });
});

describe("los avisos de lo que pasa", () => {
  it("insignia ganada y cupón de regalo (con mail)", async () => {
    const sofia = await createUser("sofia@test.com");
    await sequelize.transaction((t) => awardStreakBadges(sofia, 7, t));
    const { agent } = await staff("admin");
    await agent
      .post("/admin/coupons")
      .send({ email: "sofia@test.com", percent: 25, validDays: 30, reason: "Beca", notify: true })
      .expect(201);
    const rows = await Notification.findAll({ where: { userId: sofia.id }, order: [["createdAt", "ASC"]] });
    expect(rows.map((n) => [n.kind, n.title])).toEqual([
      ["badge", "Ganaste la insignia de 7 días"],
      ["coupon", "Te regalamos un cupón del 25 %"],
    ]);
    expect(rows[1]!.emailSent).toBe(true);
  });

  it("contenido: para revisar a quienes aprueban; aprobada o devuelta, al autor", async () => {
    const { star, product } = await createPythonStar();
    const { user: teacher, agent: teacherAgent } = await staff("teacher");
    await TeacherProduct.create({ userId: teacher.id, productId: product.id });
    const { user: admin, agent: adminAgent } = await staff("admin");
    const { user: boss } = await staff("super_admin");
    await createUser("alumno@test.com");

    const created = await teacherAgent.post("/admin/questions").send({
      course: "python",
      dest: { starId: star.id },
      type: "output",
      difficulty: "easy",
      topic: "Sumas",
      prompt: "¿Qué imprime esta suma?",
      content: { code: "print(1 + 1)", options: ["2", "11"] },
      answer: { correct: 0 },
      explanation: "1 + 1 es 2.",
    });
    const id = created.body.question.id;
    await teacherAgent.post(`/admin/questions/${id}/submit`).expect(200);

    expect(await kinds(admin.id)).toEqual(["content_review"]);
    expect(await kinds(boss.id)).toEqual(["content_review"]);
    expect(await kinds(teacher.id)).toEqual([]);
    const review = (await Notification.findOne({ where: { userId: admin.id } }))!;
    expect(review).toMatchObject({ title: "Alumno mandó una pregunta para revisar", link: `/admin/content/${id}` });
    expect(review.body).toContain("«¿Qué imprime esta suma?»");

    await adminAgent.post(`/admin/questions/${id}/reject`).send({ comment: "Sumale un tercer número." }).expect(200);
    const rejected = (await Notification.findOne({ where: { userId: teacher.id } }))!;
    expect(rejected).toMatchObject({ kind: "content_rejected", title: "Alumno te devolvió una pregunta" });
    expect(rejected.body).toContain("Sumale un tercer número.");
    // El "para revisar" de los demás ya no está pendiente
    expect(await Notification.count({ where: { kind: "content_review", readAt: null } })).toBe(0);

    // La vuelve a mandar: es otro aviso. Y al aprobarla, le avisa
    await teacherAgent.post(`/admin/questions/${id}/submit`).expect(200);
    expect(await Notification.count({ where: { userId: admin.id, kind: "content_review" } })).toBe(2);
    await adminAgent.post(`/admin/questions/${id}/approve`).expect(200);
    expect(await kinds(teacher.id)).toEqual(["content_rejected", "content_approved"]);
  });

  it("se acaban las preguntas de desafío: avisa una vez por curso y dificultad, hasta que se reponen", async () => {
    const { product } = await createPythonStar();
    const { user: admin } = await staff("admin");
    await setRole(await createUser("docente@test.com"), "teacher"); // sin content:approve: no le llega
    const before = sentMails().length;

    await sequelize.transaction((t) => checkChallengeBank(t));
    // Con la receta inicial, un desafío pide 2 de cada dificultad de un mismo curso: hacen falta 6
    const titles = (await Notification.findAll({ where: { userId: admin.id } })).map((n) => n.title).sort();
    expect(titles).toEqual([
      "Se acaban las difíciles de Master en Python",
      "Se acaban las fáciles de Master en Python",
      "Se acaban las medias de Master en Python",
    ]);
    expect(sentMails().length - before).toBe(3);
    expect(await Notification.count({ where: { kind: "challenge_bank_low" } })).toBe(3);

    // Una segunda revisión no repite
    await sequelize.transaction((t) => checkChallengeBank(t));
    expect(await Notification.count({ where: { userId: admin.id } })).toBe(3);

    // Se reponen las difíciles, y después se despublican: vuelve a avisar solo esa
    const hard: Question[] = [];
    for (let i = 0; i < 6; i++) {
      hard.push(
        await Question.create({
          productId: product.id,
          pool: "challenge",
          type: "output",
          difficulty: "hard",
          topic: "t",
          prompt: `¿Qué imprime? ${i}`,
          content: { code: `print(${i})`, options: [String(i), "x"] },
          answer: { correct: 0 },
          explanation: "Así.",
          status: "published",
        })
      );
    }
    await sequelize.transaction((t) => checkChallengeBank(t));
    expect(await sequelize.query("SELECT difficulty FROM challenge_bank_alerts ORDER BY difficulty", { plain: false, raw: true }).then(([r]) => r)).toEqual([
      { difficulty: "easy" },
      { difficulty: "medium" },
    ]);

    const { agent } = await staff("super_admin", "boss@test.com");
    await agent.post(`/admin/questions/${hard[0]!.id}/unpublish`).expect(200);
    const again = await Notification.findAll({ where: { userId: admin.id, title: "Se acaban las difíciles de Master en Python" } });
    expect(again).toHaveLength(2);
    expect(again.map((n) => n.body)).toContain("Quedan 5 preguntas para los desafíos: alcanzan para menos de 3. Hace falta sumar más.");
  });

  it("falla de integridad: a los super admins, en la campanita", async () => {
    const { user: boss } = await staff("super_admin");
    const { user: admin } = await staff("admin");
    await sealAll();
    await sequelize.transaction(async (t) => {
      await sequelize.query("SELECT set_config('integrity.sealing', 'on', true)", { transaction: t });
      await sequelize.query(`UPDATE users SET total_xp = 99999 WHERE id = '${admin.id}'`, { transaction: t });
    });
    const check = await runIntegrityCheck("manual");
    expect(check!.ok).toBe(false);
    const notices = await Notification.findAll({ where: { kind: "integrity_fail" } });
    expect(notices.map((n) => n.userId)).toEqual([boss.id]);
    expect(notices[0]).toMatchObject({ title: "Falló la verificación de integridad", link: "/admin/audit", emailSent: true });
    expect(notices[0]!.body).toBe("1 problema en users. Mirá cuáles en la bitácora.");
  });
});

