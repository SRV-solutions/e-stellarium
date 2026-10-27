import { Router } from "express";
import { UniqueConstraintError } from "sequelize";
import { sequelize } from "../db.js";
import { User, Product, Enrollment, ProcessedPayment } from "../models/index.js";
import { requireInternalKey } from "../middlewares/requireInternalKey.js";
import { HttpError } from "../lib/errors.js";
import { createPasswordToken } from "../lib/passwordTokens.js";
import { generateUniqueAlias } from "../lib/alias.js";
import { sendMail } from "../lib/mailer.js";
import { welcomeEmail, newCoursesEmail } from "../lib/email.js";
import { config } from "../config.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ProvisionResult = {
  user: User;
  products: Product[];
  token: string | null;
};

export const provisionRouter = Router();

provisionRouter.post("/provision", requireInternalKey, async (req, res) => {
  // Validar lo que llega
  const { email, name, paymentId, courses } = req.body ?? {};
  const paymentIdStr = String(paymentId ?? "");

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    throw new HttpError(400, "Email inválido.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new HttpError(400, "Falta el nombre.");
  }
  if (!/^\d{1,20}$/.test(paymentIdStr)) {
    throw new HttpError(400, "paymentId inválido.");
  }
  if (!Array.isArray(courses) || courses.length === 0 || !courses.every((c) => typeof c === "string")) {
    throw new HttpError(400, "courses tiene que ser una lista de claves de cursos.");
  }

  // Idempotencia, camino rápido: si el pago ya se procesó, no hacemos nada
  if (await ProcessedPayment.findByPk(paymentIdStr)) {
    res.json({ status: "already_processed" });
    return;
  }

  // Todo el alta en una transacción
  let result: ProvisionResult;
  try {
    result = await sequelize.transaction(async (t) => {
      await ProcessedPayment.create({ paymentId: paymentIdStr }, { transaction: t });

      const keys = [...new Set(courses as string[])];
      const products = await Product.findAll({ where: { key: keys, active: true }, transaction: t });
      if (products.length !== keys.length) {
        const found = products.map((p) => p.key);
        const missing = keys.filter((k) => !found.includes(k));
        throw new HttpError(422, `Cursos desconocidos: ${missing.join(", ")}`);
      }

      let user = await User.scope("withPassword").findOne({
        where: { email: email.trim().toLowerCase() },
        transaction: t,
      });
      if (!user) {
        user = await User.create(
          { email, name: name.trim(), alias: await generateUniqueAlias(t) },
          { transaction: t }
        );
      }

      for (const product of products) {
        const [enrollment, created] = await Enrollment.findOrCreate({
          where: { userId: user.id, productId: product.id },
          defaults: { userId: user.id, productId: product.id, paymentId: paymentIdStr },
          transaction: t,
        });
        // Si tenía el curso revocado (por un reembolso viejo) y lo vuelve a comprar, se reactiva
        if (!created && enrollment.status === "revoked") {
          await enrollment.update({ status: "active", paymentId: paymentIdStr }, { transaction: t });
        }
      }

      const token = user.passwordHash ? null : await createPasswordToken(user.id, "set_password", t);
      return { user, products, token };
    });
  } catch (err) {
    // Dos avisos del mismo pago al mismo tiempo: el segundo choca con la clave primaria
    if (err instanceof UniqueConstraintError && "payment_id" in (err.fields ?? {})) {
      res.json({ status: "already_processed" });
      return;
    }
    throw err;
  }

  // El mail va DESPUÉS del commit: un mail no se puede deshacer
  const { user, products, token } = result;
  const courseNames = products.map((p) => p.name);
  let emailSent = true;
  try {
    const mail = token
      ? welcomeEmail(user.name, `${config.appUrl}/create-password?token=${token}`, courseNames)
      : newCoursesEmail(user.name, courseNames);
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    console.error("No se pudo enviar el mail de alta", err);
    emailSent = false;
  }

  res.status(201).json({
    status: "provisioned",
    courses: products.map((p) => p.key),
    emailSent,
  });
});