import "dotenv/config";
import { UniqueConstraintError } from "sequelize";
import { sequelize } from "../db.js";
import { Enrollment, Product, User } from "../models/index.js";
import { hashPassword, PASSWORD_MIN, PASSWORD_MAX } from "../lib/password.js";
import { generateUniqueAlias } from "../lib/alias.js";

const [email, name, password, coursesArg = "python"] = process.argv.slice(2);

if (!email || !name || !password) {
  console.error('Uso: npm run create-student -- <email> "<nombre>" <contraseña> [curso1,curso2]');
  process.exit(1);
}
if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
  console.error(`La contraseña debe tener entre ${PASSWORD_MIN} y ${PASSWORD_MAX} caracteres.`);
  process.exit(1);
}

const keys = coursesArg.split(",").map((k) => k.trim()).filter(Boolean);

try {
  await sequelize.transaction(async (t) => {
    const products = await Product.findAll({ where: { key: keys, active: true }, transaction: t });
    if (products.length !== keys.length) {
      const found = products.map((p) => p.key);
      throw new Error(`Cursos desconocidos: ${keys.filter((k) => !found.includes(k)).join(", ")}`);
    }

    const user = await User.create(
      { email, name, alias: await generateUniqueAlias(t), passwordHash: await hashPassword(password) },
      { transaction: t }
    );
    for (const product of products) {
      await Enrollment.create({ userId: user.id, productId: product.id }, { transaction: t });
    }
  });
  console.log(`Alumno creado: ${email}, con ${keys.join(", ")}`);
} catch (err) {
  if (err instanceof UniqueConstraintError) {
    console.error("Ya existe un usuario con ese email.");
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
} finally {
  await sequelize.close();
}