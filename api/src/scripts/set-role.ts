import "dotenv/config";
import { sequelize } from "../db.js";
import { User } from "../models/index.js";
import type { RoleKey } from "../models/Role.js";
import { changeUserRole } from "../admin/users.js";

// Cambia el rol de un usuario desde la compu (por ejemplo, para el primer super admin).
// Pasa por las mismas protecciones que PATCH /admin/users/:id/role y queda en la bitácora sin actor.
const [email, roleKey] = process.argv.slice(2);

if (!email || !roleKey) {
  console.error("Uso: npm run set-role -- <email> <student|teacher|admin|super_admin>");
  process.exit(1);
}

try {
  const user = await User.findOne({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`No existe un usuario con el email ${email}.`);

  const result = await sequelize.transaction((t) =>
    changeUserRole(t, { actorId: null, ip: null }, user.id, roleKey as RoleKey)
  );
  console.log(`${result.email} ahora es ${result.role}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
