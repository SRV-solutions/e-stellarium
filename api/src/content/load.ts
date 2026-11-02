import { isDeepStrictEqual } from "node:util";
import { Op, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { Constellation, Product, Question, Star } from "../models/index.js";
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
  t: Transaction,
  summary: LoadSummary
) {
  const fields = {
    productId,
    starId,
    position,
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
    let constellation = await Constellation.findOne({ where: { productId: product.id }, transaction: t });
    if (!constellation) {
      constellation = await Constellation.create({ productId: product.id, ...file.constellation }, { transaction: t });
      summary.constellation = "created";
    } else if (hasChanges(constellation, file.constellation)) {
      await constellation.update(file.constellation, { transaction: t });
      summary.constellation = "updated";
    }

    // Las estrellas, y las preguntas de cada una
    for (const [i, starFile] of file.stars.entries()) {
      const position = i + 1;
      const fields = { title: starFile.title, description: starFile.description, kind: starFile.kind };

      let star = await Star.findOne({ where: { constellationId: constellation.id, position }, transaction: t });
      if (!star) {
        star = await Star.create({ constellationId: constellation.id, position, ...fields }, { transaction: t });
        summary.stars.created++;
      } else if (hasChanges(star, fields)) {
        await star.update(fields, { transaction: t });
        summary.stars.updated++;
      } else {
        summary.stars.unchanged++;
      }

      for (const [j, q] of starFile.questions.entries()) {
        await upsertQuestion(q, product.id, star.id, j + 1, t, summary);
      }
    }

    // Las preguntas del banco, sin estrella
    for (const q of file.bank) {
      await upsertQuestion(q, product.id, null, null, t, summary);
    }

    // Las que están en la base pero ya no en el archivo
    const fileSlugs = [...file.stars.flatMap((s) => s.questions), ...file.bank].map((q) => q.slug);
    const missing = await Question.findAll({
      where: { productId: product.id, slug: { [Op.notIn]: fileSlugs } },
      transaction: t,
    });
    summary.missing = missing.map((q) => q.slug!);

    return summary;
  });
}