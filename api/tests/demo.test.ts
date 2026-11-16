import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { QueryTypes } from "sequelize";
import { sequelize } from "../src/db.js";
import { Coupon, DemoLead } from "../src/models/index.js";
import { sendMail } from "../src/lib/mailer.js";
import { checkIntegrity } from "../src/lib/integrity.js";
import { grade } from "../src/games/grade.js";
import { DEMO_QUESTIONS, demoSeed } from "../src/games/demo.js";
import { isDisposableEmail } from "../src/lib/disposableDomains.js";
import { rateLimit } from "../src/middlewares/rateLimit.js";
import { errorHandler } from "../src/middlewares/errorHandler.js";
import { createUser, http, loginAs, sentMails, setRole } from "./helpers.js";

// Cada test usa su propia IP (la cabecera de Netlify): los límites por IP no se pisan entre tests
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter}`;

function getDemo() {
  return http().get("/demo").set("x-nf-client-connection-ip", nextIp());
}

// La solución de la mezcla de esa partida (lo que haría el navegador para acertar). grade lanza si la
// respuesta no tiene la forma, así que se arma una válida de cada tipo
function solutionFor(demoId: string, questionId: string) {
  const question = DEMO_QUESTIONS.find((q) => q.id === questionId)!;
  const seed = demoSeed(demoId, questionId);
  let probe: object;
  switch (question.type) {
    case "output":
    case "multiple_choice":
      probe = { choice: 0 };
      break;
    case "fill_blank":
      probe = { choices: (question.content as { blanks: string[][] }).blanks.map(() => 0) };
      break;
    case "order_lines":
      probe = { order: (question.content as { lines: string[] }).lines.map((_, i) => i) };
      break;
  }
  return grade(question, seed, probe).solution;
}

describe("GET /demo", () => {
  it("devuelve las 5 preguntas, sin respuestas ni explicaciones, y lo que vale el cupón", async () => {
    const res = await getDemo().expect(200);

    expect(res.body.demoId).toMatch(/^[0-9a-f]{16}$/);
    expect(res.body.questions).toHaveLength(5);
    expect(res.body.coupon).toEqual({ percent: 25, hours: 24 });
    expect(new Set(res.body.questions.map((q: { type: string }) => q.type))).toEqual(
      new Set(["output", "multiple_choice", "fill_blank", "order_lines"])
    );

    const text = JSON.stringify(res.body);
    for (const q of DEMO_QUESTIONS) {
      expect(text).not.toContain(q.explanation);
    }
    for (const q of res.body.questions) {
      expect(q).not.toHaveProperty("answer");
      expect(q).not.toHaveProperty("explanation");
      expect(q.difficulty).toBe("easy");
    }
  });

  it("no necesita sesión", async () => {
    await http().get("/demo").set("x-nf-client-connection-ip", nextIp()).expect(200);
  });

  it("cada partida tiene su propio id (la semilla de la mezcla)", async () => {
    const a = (await getDemo()).body;
    const b = (await getDemo()).body;
    expect(a.demoId).not.toBe(b.demoId);
  });
});

describe("POST /demo/answer", () => {
  const ip = nextIp();
  const answer = (body: object) => http().post("/demo/answer").set("x-nf-client-connection-ip", ip).send(body);

  it("corrige cada juego: acierta con la solución de su mezcla", async () => {
    const { demoId, questions } = (await getDemo()).body;

    for (const q of questions as { id: string; type: string }[]) {
      const solution = solutionFor(demoId, q.id);
      const response =
        "choice" in solution ? { choice: solution.choice } : "choices" in solution ? { choices: solution.choices } : { order: solution.order };
      const res = await answer({ demoId, questionId: q.id, response }).expect(200);
      expect(res.body.correct).toBe(true);
      expect(res.body.explanation).toBe(DEMO_QUESTIONS.find((d) => d.id === q.id)!.explanation);
    }
  });

  it("si erró, dice cuál era la correcta, y en los juegos de armar no muestra la salida", async () => {
    const { demoId } = (await getDemo()).body;

    // Ordenar las líneas al revés
    const order = await answer({ demoId, questionId: "demo-suma", response: { order: [3, 2, 1, 0] } }).expect(200);
    expect(order.body.correct).toBe(false);
    expect(order.body.output).toBeNull();
    expect(order.body.solution.order).toHaveLength(4);

    // Una opción de "¿Qué imprime?": la salida es la opción correcta y se muestra siempre
    const solution = solutionFor(demoId, "demo-hola") as { choice: number };
    const wrong = solution.choice === 0 ? 1 : 0;
    const output = await answer({ demoId, questionId: "demo-hola", response: { choice: wrong } }).expect(200);
    expect(output.body.correct).toBe(false);
    expect(output.body.output).toBe("Hola, Ana");
    expect(output.body.solution).toEqual(solution);
  });

  it("rechaza datos mal armados", async () => {
    const { demoId } = (await getDemo()).body;
    await answer({ questionId: "demo-hola", response: { choice: 0 } }).expect(400);
    await answer({ demoId: "no-es-un-id", questionId: "demo-hola", response: { choice: 0 } }).expect(400);
    await answer({ demoId, questionId: "demo-hola", response: { choice: 9 } }).expect(400);
    await answer({ demoId, questionId: "demo-hola", response: "texto" }).expect(400);
    await answer({ demoId, questionId: "demo-no-existe", response: { choice: 0 } }).expect(404);
  });

  it("no guarda nada", async () => {
    const { demoId } = (await getDemo()).body;
    await answer({ demoId, questionId: "demo-hola", response: { choice: 0 } }).expect(200);
    const [{ count }] = await sequelize.query<{ count: string }>("SELECT count(*) FROM answers", { type: QueryTypes.SELECT });
    expect(Number(count)).toBe(0);
  });
});

describe("POST /demo/coupon", () => {
  const post = (email: unknown, ip = nextIp()) =>
    http().post("/demo/coupon").set("x-nf-client-connection-ip", ip).send({ email });

  it("manda un cupón del 25 % por 24 horas al email normalizado, sin dueño", async () => {
    const before = Date.now();
    const res = await post("  Visita@Gmail.COM ", "198.51.100.7").expect(201);
    expect(res.body).toEqual({ sent: true });
    // El código no se muestra en pantalla: llega solo por mail
    expect(JSON.stringify(res.body)).not.toContain("ESTL");

    const lead = await DemoLead.findOne({ where: { email: "visita@gmail.com" } });
    expect(lead).not.toBeNull();
    expect(lead!.ip).toBe("198.51.100.7");

    const coupon = (await Coupon.findByPk(lead!.couponId))!;
    expect(coupon.source).toBe("demo");
    expect(coupon.percent).toBe(25);
    expect(coupon.userId).toBeNull();
    expect(coupon.code).toMatch(/^ESTL-DM-[2-9A-Z]{6}$/);
    const hours = (coupon.expiresAt.getTime() - before) / 3_600_000;
    expect(hours).toBeGreaterThan(23.9);
    expect(hours).toBeLessThan(24.1);

    expect(sendMail).toHaveBeenCalledTimes(1);
    const [mail] = sentMails();
    expect(mail!.to).toBe("visita@gmail.com");
    expect(mail!.html).toContain(coupon.code);
    expect(mail!.html).toContain("25 %");
    expect(mail!.html).toContain("https://wearesrv.com");
  });

  it("el cupón sirve en wearesrv.com y se puede canjear una sola vez", async () => {
    await post("canje@gmail.com").expect(201);
    const code = (await Coupon.findOne({ where: { source: "demo" } }))!.code;
    const key = process.env.INTERNAL_API_KEY!;

    const check = await http().post("/coupons/validate").set("x-api-key", key).send({ code }).expect(200);
    expect(check.body).toMatchObject({ valid: true, percent: 25 });
    await http().post("/coupons/redeem").set("x-api-key", key).send({ code }).expect(200);
    await http().post("/coupons/redeem").set("x-api-key", key).send({ code }).expect(409);
  });

  it("después de vencer ya no vale", async () => {
    await post("vence@gmail.com").expect(201);
    const coupon = (await Coupon.findOne({ where: { source: "demo" } }))!;
    await sequelize.transaction((t) => coupon.update({ expiresAt: new Date(Date.now() - 1000) }, { transaction: t }));
    const key = process.env.INTERNAL_API_KEY!;
    const check = await http().post("/coupons/validate").set("x-api-key", key).send({ code: coupon.code }).expect(200);
    expect(check.body).toEqual({ valid: false, reason: "expired" });
  });

  it("un cupón por email, aunque lo escriba distinto", async () => {
    await post("repetida@gmail.com").expect(201);
    await post("  REPETIDA@gmail.com").expect(409);
    expect(await Coupon.count({ where: { source: "demo" } })).toBe(1);
    expect(await DemoLead.count()).toBe(1);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("rechaza un email que no es un email", async () => {
    for (const email of ["", "sin-arroba", "a@b", "a b@c.com", 42, null, `${"a".repeat(250)}@x.com`]) {
      await post(email).expect(400);
    }
    expect(await DemoLead.count()).toBe(0);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("bloquea los dominios descartables, también sus subdominios", async () => {
    await post("alguien@mailinator.com").expect(400);
    await post("alguien@YOPMAIL.com").expect(400);
    await post("alguien@x.guerrillamail.com").expect(400);
    expect(await DemoLead.count()).toBe(0);
    // Uno parecido pero legítimo pasa
    await post("alguien@mailinator-no.com").expect(201);
    expect(isDisposableEmail("a@gmail.com")).toBe(false);
  });

  it("limita los cupones por IP: 3 por día", async () => {
    const ip = "192.0.2.50";
    await post("uno@gmail.com", ip).expect(201);
    await post("dos@gmail.com", ip).expect(201);
    await post("tres@gmail.com", ip).expect(201);
    await post("cuatro@gmail.com", ip).expect(429);
    expect(await DemoLead.count()).toBe(3);

    // Otra IP sí puede
    await post("cuatro@gmail.com", "192.0.2.51").expect(201);
  });

  it("la IP vuelve a poder pedir pasado el día", async () => {
    const ip = "192.0.2.60";
    for (const n of [1, 2, 3]) await post(`dia${n}@gmail.com`, ip).expect(201);
    await sequelize.query("UPDATE demo_leads SET created_at = now() - interval '25 hours'");
    await post("dia4@gmail.com", ip).expect(201);
  });

  it("si el mail no sale, no queda nada guardado y puede volver a pedirlo", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(sendMail).mockRejectedValueOnce(new Error("Resend caído"));

    await post("reintento@gmail.com").expect(502);
    expect(await DemoLead.count()).toBe(0);
    expect(await Coupon.count({ where: { source: "demo" } })).toBe(0);

    await post("reintento@gmail.com").expect(201);
    expect(await DemoLead.count()).toBe(1);
    spy.mockRestore();
  });

  it("deja la integridad en verde (el cupón sin dueño se sella como los demás)", async () => {
    await post("integridad@gmail.com").expect(201);
    expect(await checkIntegrity()).toEqual([]);
  });

  it("la base no deja un cupón de la demo con dueño, ni uno de la tienda sin dueño", async () => {
    await post("regla@gmail.com").expect(201);
    await expect(
      sequelize.query("UPDATE coupons SET source = 'shop' WHERE source = 'demo'")
    ).rejects.toThrow(/coupons_source_matches/);
  });
});

describe("Cupones del panel", () => {
  it("el cupón de la demo aparece como de un invitado, se busca por su email y se puede anular", async () => {
    await http().post("/demo/coupon").set("x-nf-client-connection-ip", nextIp()).send({ email: "Panel@gmail.com" }).expect(201);
    await setRole(await createUser("admin@test.com"), "admin");
    const agent = await loginAs("admin@test.com");

    const list = await agent.get("/admin/coupons?q=panel@gmail").expect(200);
    expect(list.body.coupons).toHaveLength(1);
    expect(list.body.coupons[0]).toMatchObject({
      source: "demo",
      percent: 25,
      status: "live",
      user: { id: null, email: "panel@gmail.com" },
    });

    await agent.delete(`/admin/coupons/${list.body.coupons[0].id}`).send({ reason: "Abuso" }).expect(200);
    const key = process.env.INTERNAL_API_KEY!;
    const code = list.body.coupons[0].code;
    const check = await http().post("/coupons/validate").set("x-api-key", key).send({ code }).expect(200);
    expect(check.body).toEqual({ valid: false, reason: "voided" });
  });
});

describe("rateLimit", () => {
  it("frena a la IP que pasa el máximo por minuto y no a las demás", async () => {
    const app = express();
    app.get("/x", rateLimit(2), (_req, res) => void res.json({ ok: true }));
    app.use(errorHandler);

    const hit = (ip: string) => request(app).get("/x").set("x-nf-client-connection-ip", ip);
    await hit("198.51.100.1").expect(200);
    await hit("198.51.100.1").expect(200);
    await hit("198.51.100.1").expect(429);
    await hit("198.51.100.2").expect(200);
  });

  it("vuelve a dejar pasar cuando termina la ventana", async () => {
    vi.useFakeTimers();
    try {
      const app = express();
      app.get("/x", rateLimit(1, 1000), (_req, res) => void res.json({ ok: true }));
      app.use(errorHandler);
      const hit = () => request(app).get("/x").set("x-nf-client-connection-ip", "198.51.100.9");
      vi.setSystemTime(new Date("2026-11-16T12:00:00Z"));
      await hit().expect(200);
      await hit().expect(429);
      vi.setSystemTime(new Date("2026-11-16T12:00:02Z"));
      await hit().expect(200);
    } finally {
      vi.useRealTimers();
    }
  });
});
