import { Router } from "express";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { config } from "../config.js";
import { User, PasswordToken } from "../models/index.js";
import { HttpError } from "../lib/errors.js";
import { hashPassword, validatePassword } from "../lib/password.js";
import { hashToken, createPasswordToken } from "../lib/passwordTokens.js";
import { startSession } from "../lib/session.js";
import { sendMail } from "../lib/mailer.js";
import { resetPasswordEmail } from "../lib/email.js";

const INVALID_LINK = "El link no es válido o ya venció. Pedí uno nuevo desde «Olvidé mi contraseña».";

// Busca un token que exista, no esté usado y no esté vencido
async function findUsableToken(rawToken: unknown, transaction?: Transaction) {
  if (typeof rawToken !== "string" || !rawToken) return null;
  return PasswordToken.findOne({
    where: {
      tokenHash: hashToken(rawToken),
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
}

export const passwordRouter = Router();

passwordRouter.get("/auth/password/check", async (req, res) => {
  const token = await findUsableToken(req.query.token);
  if (!token) throw new HttpError(400, INVALID_LINK);
  res.json({ type: token.type });
});

passwordRouter.post("/auth/password/set", async (req, res) => {
  const { token: rawToken, password } = req.body ?? {};

  const error = validatePassword(password);
  if (error) throw new HttpError(400, error);

  // Hasheamos antes de abrir la transacción: tarda ~250 ms y no hace falta tener la fila bloqueada
  const passwordHash = await hashPassword(password);

  const user = await sequelize.transaction(async (t) => {
    const token = await findUsableToken(rawToken, t);
    if (!token) throw new HttpError(400, INVALID_LINK);

    const user = await User.findByPk(token.userId, { transaction: t });
    if (!user) throw new HttpError(400, INVALID_LINK);

    await user.update({ passwordHash }, { transaction: t });

    // Se invalidan TODOS los links pendientes del usuario, no solo el que usó
    await PasswordToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null }, transaction: t }
    );
    return user;
  });

  startSession(res, user.id);
  const { passwordHash: _hash, ...publicUser } = user.toJSON();
  res.json({ user: publicUser });
});

passwordRouter.post("/auth/password/forgot", async (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email.trim()) {
    throw new HttpError(400, "Escribí tu email.");
  }

  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (user) {
    const token = await createPasswordToken(user.id, "reset_password");
    try {
      const link = `${config.appUrl}/crear-contrasena?token=${token}`;
      await sendMail({ to: user.email, ...resetPasswordEmail(user.name, link) });
    } catch (err) {
      console.error("No se pudo enviar el mail de recuperación", err);
    }
  }

  // La misma respuesta exista o no la cuenta
  res.json({
    message: "Si ese email tiene una cuenta, te enviamos un link para cambiar tu contraseña. Revisá también la carpeta de spam.",
  });
});