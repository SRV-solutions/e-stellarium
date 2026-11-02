import "dotenv/config";
import { readFile } from "node:fs/promises";
import { sequelize } from "../db.js";
import { parseContentFile } from "../content/parse.js";
import { loadContent } from "../content/load.js";

const [path] = process.argv.slice(2);
if (!path) {
  console.error("Uso: npm run load-content -- <archivo.json>");
  process.exit(1);
}

try {
  const parsed = parseContentFile(JSON.parse(await readFile(path, "utf8")));

  if (!parsed.ok) {
    console.error(`El archivo tiene ${parsed.errors.length} errores. No se cargó nada.\n`);
    for (const error of parsed.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
  } else {
    const { constellation, stars, questions, missing } = await loadContent(parsed.file);
    console.log(`Constelación: ${constellation}`);
    console.log(`Estrellas: ${stars.created} nuevas, ${stars.updated} actualizadas, ${stars.unchanged} sin cambios`);
    console.log(
      `Preguntas: ${questions.created} nuevas, ${questions.updated} actualizadas, ${questions.unchanged} sin cambios`
    );
    if (missing.length > 0) {
      console.log(`\nEstán en la base pero no en el archivo (no se tocaron): ${missing.join(", ")}`);
    }
  }
} catch (err) {
  if (err instanceof SyntaxError) {
    console.error(`El archivo no es un JSON válido: ${err.message}`);
  } else {
    console.error(err instanceof Error ? err.message : err);
  }
  process.exitCode = 1;
} finally {
  await sequelize.close();
}