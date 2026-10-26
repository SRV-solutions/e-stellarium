import "dotenv/config";
import { sequelize } from "../db.js";
import { User } from "../models/index.js";
import { hashPassword, PASSWORD_MIN, PASSWORD_MAX } from "../lib/password.js";

const [email, name, password] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error('Uso: npm run create-admin -- <email> "<nombre>" <contraseña>');
  process.exit(1);
}
if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`);
  process.exit(1);
}

const user = await User.create({
  email,
  name,
  alias: email.split("@")[0].slice(0, 30),
  role: "admin",
  passwordHash: await hashPassword(password),
});

console.log(`Admin creado: ${user.email}`);
await sequelize.close();