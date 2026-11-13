import "dotenv/config";
import { sequelize } from "../db.js";
import { Role, User } from "../models/index.js";

// Cambia el rol de un usuario desde la compu (por ejemplo, para el primer super admin).
// Desde la app se hace con PATCH /admin/users/:id/role, que tiene las protecciones.
const [email, roleKey] = process.argv.slice(2);

if (!email || !roleKey) {
  console.error("Uso: npm run set-role -- <email> <student|teacher|admin|super_admin>");
  process.exit(1);
}

try {
  const role = await Role.findOne({ where: { key: roleKey } });
  if (!role) throw new Error(`No existe el rol ${roleKey}.`);
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`No existe un usuario con el email ${email}.`);

  await user.update({ roleId: role.id });
  console.log(`${user.email} ahora es ${role.name}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
