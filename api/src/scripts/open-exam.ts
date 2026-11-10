import "dotenv/config";
import { sequelize } from "../db.js";
import { Constellation, Product, Star, StarCompletion, User } from "../models/index.js";
import { EXAM_OPENS_AFTER_DAYS } from "../games/unlock.js";
import { getExamState } from "../games/examState.js";

// Solo para probar: enciende todas las lecciones de un curso con fecha de hace unos días,
// así el examen ya está abierto. No da experiencia ni toca las respuestas.
const [email, courseKey = "python"] = process.argv.slice(2);

if (!email) {
  console.error("Uso: npm run open-exam -- <email> [curso]");
  process.exit(1);
}
// Es una trampa: solo para las cuentas de prueba, nunca para un alumno real
if (!/^wearesrv\+[^@]+@gmail\.com$/.test(email)) {
  console.error("Solo funciona con cuentas de prueba (wearesrv+algo@gmail.com).");
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;

try {
  const lit = await sequelize.transaction(async (t) => {
    const user = await User.findOne({ where: { email }, transaction: t });
    if (!user) throw new Error(`No existe el usuario ${email}.`);

    const product = await Product.findOne({ where: { key: courseKey }, transaction: t });
    const constellation =
      product && (await Constellation.findOne({ where: { productId: product.id }, transaction: t }));
    if (!constellation) throw new Error(`El curso ${courseKey} no tiene constelación.`);

    const lessons = await Star.findAll({
      where: { constellationId: constellation.id, kind: "lesson" },
      transaction: t,
    });

    // Un día más que lo necesario, para no depender de la hora exacta
    const createdAt = new Date(Date.now() - (EXAM_OPENS_AFTER_DAYS + 1) * DAY_MS);
    for (const lesson of lessons) {
      await StarCompletion.findOrCreate({ where: { userId: user.id, starId: lesson.id }, transaction: t });
    }
    // La fecha de creación solo se puede cambiar con el update del modelo, no el de la fila
    await StarCompletion.update(
      { createdAt },
      { where: { userId: user.id, starId: lessons.map((l) => l.id) }, transaction: t }
    );

    const exam = await Star.findOne({
      where: { constellationId: constellation.id, kind: "exam" },
      transaction: t,
    });
    return { user, exam, lessons: lessons.length };
  });

  console.log(`Lecciones encendidas: ${lit.lessons}, con fecha de hace ${EXAM_OPENS_AFTER_DAYS + 1} días.`);
  if (lit.exam) {
    const state = await getExamState(lit.user.id, lit.exam);
    console.log(`Estado del examen: ${state.status}`);
  } else {
    console.log("Ojo: esta constelación todavía no tiene estrella de examen.");
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
