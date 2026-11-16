import { Router } from "express";
import { Op, UniqueConstraintError } from "sequelize";
import { sequelize } from "../db.js";
import { Coupon, DemoLead } from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { clientIp } from "../lib/clientIp.js";
import { sendMail } from "../lib/mailer.js";
import { demoCouponEmail } from "../lib/email.js";
import { isDisposableEmail } from "../lib/disposableDomains.js";
import { SRV_WEB_URL } from "../lib/webUrl.js";
import { rateLimit } from "../middlewares/rateLimit.js";
import { present } from "../games/present.js";
import { grade, InvalidResponseError } from "../games/grade.js";
import { uniqueCouponCode } from "../games/examFlow.js";
import {
  DEMO_COUPON_HOURS,
  DEMO_COUPON_PERCENT,
  DEMO_IP_DAILY_LIMIT,
  DEMO_QUESTIONS,
  demoSeed,
  isDemoId,
  newDemoId,
} from "../games/demo.js";

// La demo para invitados (sin cuenta). Nada se guarda salvo el email de quien pide el cupón.
export const demoRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Sin mayúsculas ni espacios: "  Ana@Mail.COM " y "ana@mail.com" son el mismo email
export function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

// La estrella de prueba: las 5 preguntas mezcladas, sin respuesta. El demoId es la semilla de la mezcla.
// También manda lo que vale el cupón, así el cliente no repite los números
demoRouter.get("/demo", rateLimit(30), (_req, res) => {
  const demoId = newDemoId();
  res.json({
    demoId,
    questions: DEMO_QUESTIONS.map((q) => present(q, demoSeed(demoId, q.id))),
    coupon: { percent: DEMO_COUPON_PERCENT, hours: DEMO_COUPON_HOURS },
  });
});

// Corrige una respuesta. No guarda nada: no hay cuenta, ni XP, ni racha
demoRouter.post("/demo/answer", rateLimit(120), (req, res) => {
  const { demoId, questionId, response } = req.body ?? {};
  if (!isDemoId(demoId) || typeof questionId !== "string") throw new HttpError(400, "Faltan datos de la demo.");
  const question = DEMO_QUESTIONS.find((q) => q.id === questionId);
  if (!question) throw new HttpError(404, "No encontramos esa pregunta.");

  let result;
  try {
    result = grade(question, demoSeed(demoId, question.id), response);
  } catch (err) {
    if (err instanceof InvalidResponseError) throw new HttpError(400, "La respuesta no tiene un formato válido.");
    throw err;
  }
  res.json({ correct: result.correct, solution: result.solution, output: result.output, explanation: question.explanation });
});

// Pide el cupón con el email. Un cupón por email y pocos por IP al día; los dominios descartables no entran.
// El cupón llega solo por mail (no se muestra acá): así el email tiene que ser de verdad de quien lo pide.
demoRouter.post("/demo/coupon", rateLimit(5), async (req, res) => {
  const email = normalizeEmail(req.body?.email);
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, "Escribí un email válido.");
  if (isDisposableEmail(email)) {
    throw new HttpError(400, "Ese email es de una casilla descartable. Usá uno tuyo de verdad.");
  }

  const ip = clientIp(req);
  if (ip) {
    const today = await DemoLead.count({
      where: { ip, createdAt: { [Op.gt]: new Date(Date.now() - 86_400_000) } },
    });
    if (today >= DEMO_IP_DAILY_LIMIT) {
      throw new HttpError(429, "Ya pediste varios cupones hoy desde esta conexión. Probá mañana.");
    }
  }

  // Todo junto: el cupón (tabla protegida, se sella en esta transacción) y el email. Si el email ya
  // estaba, la restricción única frena el segundo y no queda ningún cupón suelto
  let coupon: Coupon;
  let leadId: string;
  try {
    ({ coupon, leadId } = await sequelize.transaction(async (t) => {
      const now = new Date();
      const coupon = await Coupon.create(
        {
          code: await uniqueCouponCode("dm", t),
          percent: DEMO_COUPON_PERCENT,
          source: "demo",
          expiresAt: new Date(now.getTime() + DEMO_COUPON_HOURS * 3_600_000),
          userId: null,
          constellationId: null,
          examAttemptId: null,
        },
        { transaction: t }
      );
      const lead = await DemoLead.create({ email, couponId: coupon.id, ip }, { transaction: t });
      return { coupon, leadId: lead.id };
    }));
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw new HttpError(409, "Ese email ya pidió su cupón. Es uno por persona.");
    }
    throw err;
  }

  // El mail, después del commit. Si no sale, se deshace todo: el invitado no tiene otra forma de recibir
  // el cupón, y si quedara guardado no podría volver a pedirlo
  try {
    const mail = demoCouponEmail(coupon.code, coupon.percent, coupon.expiresAt, SRV_WEB_URL);
    await sendMail({ to: email, ...mail });
  } catch (err) {
    console.error("No se pudo mandar el mail del cupón de la demo", err);
    await sequelize.transaction(async (t) => {
      await DemoLead.destroy({ where: { id: leadId }, transaction: t });
      await Coupon.destroy({ where: { id: coupon.id }, transaction: t });
    });
    throw new HttpError(502, "No pudimos mandarte el mail. Probá de nuevo en un rato.");
  }

  res.status(201).json({ sent: true });
});
