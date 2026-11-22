import "dotenv/config";
import { sequelize } from "../db.js";
import { checkIntegrity } from "../lib/integrity.js";

// Solo mira, no cambia nada: dice contra qué base corre y cuántos problemas hay en cada tabla. Sirve antes de
// `npm run seal-integrity` (que borra la alerta) para saber qué se va a dar por bueno.
// options existe en tiempo de ejecución, pero los tipos de Sequelize no la declaran: sin el cast, tsc no compila.
(sequelize as unknown as { options: { logging: false } }).options.logging = false;
try {
  const url = new URL(process.env.DATABASE_URL ?? "postgres://?");
  console.log(`Base: ${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`);
  const problems = await checkIntegrity();
  const counts = new Map<string, number>();
  for (const p of problems) counts.set(`${p.table} (${p.kind})`, (counts.get(`${p.table} (${p.kind})`) ?? 0) + 1);
  if (problems.length === 0) console.log("Sin problemas.");
  for (const [what, n] of counts) console.log(`${what}: ${n}`);
  for (const p of problems.filter((x) => x.kind !== "row")) console.log(p);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
