import { isDeepStrictEqual } from "node:util";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Constellation, Product, Question, Star } from "../models/index.js";
import type { QuestionPool } from "../models/Question.js";
import type { ContentFile, ContentQuestion } from "./parse.js";

export type LoadSummary = {
  constellation: "created" | "updated" | "unchanged";
  stars: { created: number; updated: number; unchanged: number };
  questions: { created: number; updated: number; unchanged: number };
  missing: string[];
};

// ¿Algún campo nuevo es distinto del que ya está guardado?
function hasChanges(existing: { get(key: string): unknown }, fields: Record<string, unknown>) {
  return Object.entries(fields).some(([key, value]) => !isDeepStrictEqual(existing.get(key), value));
}

async function upsertQuestion(
  q: ContentQuestion,
  productId: string,
  starId: string | null,
  position: number | null,
  pool: QuestionPool | null,
  module: number | null,
  t: Transaction,
  summary: LoadSummary
) {
  const fields = {
    productId,
    starId,
    position,
    pool,
    module,
    type: q.type,
    difficulty: q.difficulty,
    topic: q.topic,
    prompt: q.prompt,
    content: q.content,
    answer: q.answer,
    explanation: q.explanation,
    status: "published" as const,
  };

  const existing = await Question.scope("withAnswer").findOne({ where: { slug: q.slug }, transaction: t });
  if (!existing) {
    await Question.create({ slug: q.slug, ...fields }, { transaction: t });
    summary.questions.created++;
  } else if (hasChanges(existing, fields)) {
    await existing.update(fields, { transaction: t });
    summary.questions.updated++;
  } else {
    summary.questions.unchanged++;
  }
}

export async function loadContent(file: ContentFile): Promise<LoadSummary> {
  return sequelize.transaction(async (t) => {
    const summary: LoadSummary = {
      constellation: "unchanged",
      stars: { created: 0, updated: 0, unchanged: 0 },
      questions: { created: 0, updated: 0, unchanged: 0 },
      missing: [],
    };

    // El curso
    const product = await Product.findOne({ where: { key: file.course }, transaction: t });
    if (!product) throw new Error(`Curso desconocido: ${file.course}`);

    // La constelación
    // La constelación, con la lista de módulos del curso
    const constellationFields = { ...file.constellation, modules: file.modules };
    let constellation = await Constellation.findOne({ where: { productId: product.id }, transaction: t });
    if (!constellation) {
      constellation = await Constellation.create({ productId: product.id, ...constellationFields }, { transaction: t });
      summary.constellation = "created";
    } else if (hasChanges(constellation, constellationFields)) {
      await constellation.update(constellationFields, { transaction: t });
      summary.constellation = "updated";
    }

    // Las estrellas se buscan por slug, así se pueden insertar y reordenar sin que una se convierta
    // en otra. Una estrella vieja sin slug se adopta si está en el mismo lugar y es del mismo tipo
    // (pasa una sola vez, en la primera carga con slugs).
    const existing = await Star.findAll({ where: { constellationId: constellation.id }, transaction: t });
    const claimed = new Set<string>();
    const matches = file.stars.map((starFile, i) => {
      const star =
        existing.find((s) => s.slug === starFile.slug) ??
        existing.find((s) => s.slug === null && s.position === i + 1 && s.kind === starFile.kind && !claimed.has(s.id));
      if (star) claimed.add(star.id);
      return star ?? null;
    });

    // Antes de escribir nada: ninguna estrella de la base puede faltar en el archivo (tiene progreso
    // de alumnos), y ninguna puede cambiar de lección a examen o al revés
    const leftovers = existing.filter((s) => !claimed.has(s.id));
    if (leftovers.length > 0) {
      const names = leftovers.map((s) => `${s.title} (${s.slug ?? `lugar ${s.position}, sin slug`})`).join(", ");
      throw new Error(`Estas estrellas están en la base pero no en el archivo: ${names}. No se cargó nada.`);
    }
    matches.forEach((star, i) => {
      if (star && star.kind !== file.stars[i]!.kind) {
        throw new Error(`La estrella ${file.stars[i]!.slug} no puede cambiar de ${star.kind} a ${file.stars[i]!.kind}. No se cargó nada.`);
      }
    });

    for (const [i, starFile] of file.stars.entries()) {
      const fields = {
        slug: starFile.slug,
        position: i + 1,
        title: starFile.title,
        description: starFile.description,
        kind: starFile.kind,
        module: starFile.module,
      };

      let star = matches[i];
      if (!star) {
        star = await Star.create({ constellationId: constellation.id, ...fields }, { transaction: t });
        summary.stars.created++;
      } else if (hasChanges(star, fields)) {
        await star.update(fields, { transaction: t });
        summary.stars.updated++;
      } else {
        summary.stars.unchanged++;
      }

      // Las preguntas de una lección son del módulo de su estrella, salvo que digan otro
      for (const [j, q] of starFile.questions.entries()) {
        await upsertQuestion(q, product.id, star.id, j + 1, null, q.module ?? starFile.module, t, summary);
      }
    }

    // Las preguntas sin estrella: el banco del examen y las de los desafíos
    for (const q of file.bank) {
      await upsertQuestion(q, product.id, null, null, "exam", q.module ?? null, t, summary);
    }
    for (const q of file.challenges) {
      await upsertQuestion(q, product.id, null, null, "challenge", q.module ?? null, t, summary);
    }

    // Las que están en la base pero ya no en el archivo
    const fileSlugs = [...file.stars.flatMap((s) => s.questions), ...file.bank, ...file.challenges].map((q) => q.slug);
    const missing = await Question.findAll({
      where: { productId: product.id, slug: { [Op.notIn]: fileSlugs } },
      transaction: t,
    });
    summary.missing = missing.map((q) => q.slug!);

    return summary;
  });
}