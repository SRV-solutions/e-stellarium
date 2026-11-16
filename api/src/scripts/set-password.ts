import "dotenv/config";
import { sequelize } from "../db.js";
import { PasswordToken, User } from "../models/index.js";
import { writeAudit } from "../lib/audit.js";
import { hashPassword, validatePassword } from "../lib/password.js";

// Cambia la contraseña de un usuario desde la compu, para cuando el mail de "Olvidé mi contraseña"
// no puede llegar. Invalida los links de contraseña que tuviera pendientes, igual que la app.
const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error("Uso: npm run set-password -- <email> <contraseña>");
  process.exit(1);
}

try {
  const error = validatePassword(password);
  if (error) throw new Error(error);
  const passwordHash = await hashPassword(password);

  // En una transacción para que se selle el dvh del usuario (tabla protegida)
  await sequelize.transaction(async (t) => {
    const user = await User.findOne({ where: { email: email.trim().toLowerCase() }, transaction: t });
    if (!user) throw new Error(`No existe un usuario con el email ${email}.`);
    await user.update({ passwordHash }, { transaction: t });
    await PasswordToken.update({ usedAt: new Date() }, { where: { userId: user.id, usedAt: null }, transaction: t });
    // Sin actor (es un script) y sin la contraseña ni su hash. No se puede revertir
    await writeAudit(t, {
      actorId: null,
      ip: null,
      action: "user.password_set",
      targetType: "user",
      targetId: user.id,
      reversible: false,
    });
  });
  console.log(`Listo: ${email} ya puede entrar con la contraseña nueva.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
