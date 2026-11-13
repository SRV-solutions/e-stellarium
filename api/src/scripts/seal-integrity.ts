import "dotenv/config";
import { sequelize } from "../db.js";
import { checkIntegrity, sealAll } from "../lib/integrity.js";

// Recalcula todos los DVH y DVV dando por buenos los datos de hoy. Se corre UNA vez, después de
// desplegar el bloque 4 (las filas que ya existían no tienen dvh). Si después hay una alerta, primero
// se revisa qué cambió: correr esto la borra.
try {
  const before = await checkIntegrity();
  await sealAll();
  console.log(`Sellado. Antes había ${before.length} problemas; ahora hay ${(await checkIntegrity()).length}.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
