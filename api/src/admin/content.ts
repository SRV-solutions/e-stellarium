import { QueryTypes, type Transaction } from "sequelize";
import { sequelize } from "../db.js";
import { HttpError } from "../lib/errors.js";
import { writeAudit, type AuditContext } from "../lib/audit.js";
import { roleKeyOf } from "../lib/permissions.js";
import {
  Constellation,
  Product,
  Question,
  QuestionReview,
  QuestionVersion,
  Star,
  TeacherProduct,
  User,
} from "../models/index.js";
import type { Difficulty, QuestionAnswer, QuestionContent, QuestionPool, QuestionType } from "../models/Question.js";
import type { VersionStatus } from "../models/QuestionVersion.js";
import { validateQuestion } from "../games/validate.js";
import { starLetters } from "../games/starLetter.js";
import type { ChangeOptions } from "./users.js";

// El contenido desde el panel (content:edit y content:approve).
// questions tiene lo que ven los alumnos (la versión aprobada); question_versions, cada versión entera.
// Se edita siempre la versión abierta (borrador, en revisión o rechazada; hay una sola por pregunta):
// si la pregunta ya está publicada, editar crea la siguiente. Los alumnos no ven nada nuevo hasta que
// un admin la aprueba. Aprobar, rechazar, despublicar y volver a publicar quedan en la bitácora.

const TYPES: QuestionType[] = ["output", "fill_blank", "order_lines", "multiple_choice"];
const DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];
const POOLS: QuestionPool[] = ["exam", "challenge"];
const OPEN: VersionStatus[] = ["draft", "in_review", "rejected"];
export const QUESTIONS_PAGE_SIZE = 50;

// ---------- Qué cursos ve cada uno ----------

// Los cursos que puede ver y editar: el docente, solo los suyos (teacher_products); el resto, todos.
// null = todos
export async function contentScope(user: User, t?: Transaction): Promise<string[] | null> {
  if ((await roleKeyOf(user, t)) !== "teacher") return null;
  const rows = await TeacherProduct.findAll({ where: { userId: user.id }, transaction: t });
  return rows.map((r) => r.productId);
}

function inScope(scope: string[] | null, productId: string) {
  return scope === null || scope.includes(productId);
}

// Los cursos con su constelación: las estrellas (con su letra) y los módulos, para el formulario
export async function listCourses(scope: string[] | null) {
  const products = await Product.findAll({
    where: { active: true, ...(scope ? { id: scope } : {}) },
    order: [["name", "ASC"]],
  });
  const constellations = await Constellation.findAll({
    where: { productId: products.map((p) => p.id) },
    include: [Star],
  });
  return products.map((p) => {
    const c = constellations.find((x) => x.productId === p.id);
    const stars = [...(c?.Stars ?? [])].sort((a, b) => a.position - b.position);
    const letters = starLetters(stars);
    return {
      key: p.key,
      name: p.name,
      modules: (c?.modules ?? []).map((m) => ({ number: m.number, title: m.title })),
      // El examen no lleva preguntas propias: usa el banco
      stars: stars
        .filter((s) => s.kind === "lesson")
        .map((s) => ({ id: s.id, letter: letters.get(s.id)!, title: s.title, module: s.module })),
    };
  });
}

// ---------- Lo que se puede escribir en una versión ----------

export type VersionFields = {
  type: QuestionType;
  difficulty: Difficulty;
  topic: string;
  module: number | null;
  prompt: string;
  content: QuestionContent;
  answer: QuestionAnswer;
  explanation: string;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, name: string, max: number) {
  if (typeof value !== "string" || value.length > max) throw new HttpError(400, `${name}: tiene que ser un texto de hasta ${max} letras.`);
  return value;
}

// Lo que mandó el panel. En un borrador puede faltar casi todo (se guarda a medias); recién al enviarla
// a revisión se exige que esté completa (problemsOf)
export function parseFields(body: unknown, partial: boolean): Partial<VersionFields> {
  if (!isObject(body)) throw new HttpError(400, "Faltan los datos de la pregunta.");
  const out: Partial<VersionFields> = {};
  if (body.type !== undefined || !partial) {
    if (!TYPES.includes(body.type as QuestionType)) throw new HttpError(400, "Ese juego no existe.");
    out.type = body.type as QuestionType;
  }
  if (body.difficulty !== undefined) {
    if (!DIFFICULTIES.includes(body.difficulty as Difficulty)) throw new HttpError(400, "Esa dificultad no existe.");
    out.difficulty = body.difficulty as Difficulty;
  }
  if (body.topic !== undefined) out.topic = text(body.topic, "El tema", 60).trim();
  if (body.prompt !== undefined) out.prompt = text(body.prompt, "El enunciado", 1000);
  if (body.explanation !== undefined) out.explanation = text(body.explanation, "La explicación", 4000);
  if (body.module !== undefined) {
    if (body.module !== null && (!Number.isInteger(body.module) || (body.module as number) < 1)) {
      throw new HttpError(400, "El módulo tiene que ser un número.");
    }
    out.module = body.module as number | null;
  }
  if (body.content !== undefined) {
    if (!isObject(body.content)) throw new HttpError(400, "El contenido tiene que ser un objeto.");
    out.content = body.content as QuestionContent;
  }
  if (body.answer !== undefined) {
    if (!isObject(body.answer)) throw new HttpError(400, "La respuesta tiene que ser un objeto.");
    out.answer = body.answer as QuestionAnswer;
  }
  return out;
}

// Lo que le falta para poder enviarla a revisión (vacío si está lista)
export function problemsOf(v: VersionFields): string[] {
  const problems: string[] = [];
  if (!v.prompt.trim()) problems.push("Falta el enunciado.");
  if (!v.topic.trim()) problems.push("Falta el tema.");
  if (!v.explanation.trim()) problems.push("Falta la explicación.");
  // Al acertar, el juego muestra la salida del programa; sin ella le diría que no hace lo que pide
  if ((v.type === "fill_blank" || v.type === "order_lines") && !String((v.answer as { output?: unknown }).output ?? "").trim()) {
    problems.push("Falta lo que imprime cuando está bien.");
  }
  return [...problems, ...validateQuestion(v.type, v.content, v.answer)];
}

// Dónde va: { starId } (una lección del curso) o { pool: "exam" | "challenge" }
type Destination = { starId: string; pool: null } | { starId: null; pool: QuestionPool };

async function parseDestination(value: unknown, productId: string, t: Transaction): Promise<Destination> {
  if (!isObject(value)) throw new HttpError(400, "Falta dónde va la pregunta.");
  if (typeof value.pool === "string") {
    if (!POOLS.includes(value.pool as QuestionPool)) throw new HttpError(400, "Ese destino no existe.");
    return { starId: null, pool: value.pool as QuestionPool };
  }
  const star =
    typeof value.starId === "string"
      ? await Star.findByPk(value.starId, { include: [Constellation], transaction: t }).catch(() => null)
      : null;
  if (!star || star.Constellation!.productId !== productId || star.kind !== "lesson") {
    throw new HttpError(400, "Esa lección no es de este curso.");
  }
  return { starId: star.id, pool: null };
}

// El lugar siguiente en la estrella (bloqueada: dos preguntas nuevas a la vez no toman el mismo)
async function nextPosition(starId: string, t: Transaction) {
  await Star.findByPk(starId, { lock: t.LOCK.UPDATE, transaction: t });
  const max = (await Question.max("position", { where: { starId }, transaction: t })) as number | null;
  return (max ?? 0) + 1;
}

// ---------- Leer ----------

type ListFilter = "all" | "review" | "draft" | "rejected" | "published" | "unpublished" | "mine";
const FILTERS: ListFilter[] = ["all", "review", "draft", "rejected", "published", "unpublished", "mine"];

// Cada filtro, en SQL (q = la pregunta, ov = su versión abierta)
const FILTER_WHERE: Record<ListFilter, string> = {
  all: "TRUE",
  review: "ov.status = 'in_review'",
  draft: "ov.status = 'draft'",
  rejected: "ov.status = 'rejected'",
  published: "q.status = 'published'",
  unpublished: "q.status <> 'published' AND q.version IS NOT NULL",
  mine: "ov.status IN ('draft', 'rejected') AND ov.author_id = :me",
};

export type QuestionFilters = { course: string; filter: ListFilter; dest: string | null; q: string | null; offset: number };

export function parseQuestionFilters(query: Record<string, unknown>): QuestionFilters {
  const course = typeof query.course === "string" ? query.course : "";
  if (!course) throw new HttpError(400, "Falta el curso.");
  const filter = (query.filter ?? "all") as ListFilter;
  if (!FILTERS.includes(filter)) throw new HttpError(400, "Ese filtro no existe.");
  const dest = typeof query.dest === "string" && query.dest ? query.dest : null;
  if (dest && !POOLS.includes(dest as QuestionPool) && !/^[0-9a-f-]{36}$/i.test(dest)) throw new HttpError(400, "Ese destino no existe.");
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim().slice(0, 100) : null;
  const offset = Number(query.offset ?? 0);
  if (!Number.isInteger(offset) || offset < 0) throw new HttpError(400, "offset inválido.");
  return { course, filter, dest, q, offset };
}

async function courseIn(scope: string[] | null, key: string, t?: Transaction) {
  const product = await Product.findOne({ where: { key }, transaction: t });
  if (!product || !inScope(scope, product.id)) throw new HttpError(404, "No existe ese curso.");
  return product;
}

type ListRow = {
  id: string;
  star_id: string | null;
  pool: QuestionPool | null;
  status: string;
  answers: string;
  pub_number: number | null;
  pub_type: QuestionType | null;
  pub_prompt: string | null;
  pub_topic: string | null;
  pub_difficulty: Difficulty | null;
  open_number: number | null;
  open_status: VersionStatus | null;
  open_type: QuestionType | null;
  open_prompt: string | null;
  open_updated_at: Date | null;
  open_submitted_at: Date | null;
  author_name: string | null;
  rejection: string | null;
  rejected_by: string | null;
  pub_content: Record<string, unknown> | null;
  open_content: Record<string, unknown> | null;
};

// Un pedacito del código, para distinguir en la lista preguntas con el mismo enunciado: la última
// línea con algo (casi siempre el print), o la primera de las que hay que ordenar
function snippetOf(content: Record<string, unknown> | null): string | null {
  if (!content) return null;
  if (typeof content.code === "string") {
    const lines = content.code.split(/\r?\n/).filter((l) => l.trim());
    return lines.at(-1)?.trim().slice(0, 80) ?? null;
  }
  if (Array.isArray(content.lines) && typeof content.lines[0] === "string") return content.lines[0].trim().slice(0, 80);
  return null;
}

const LIST_FROM = `
  FROM questions q
  LEFT JOIN stars s ON s.id = q.star_id
  LEFT JOIN question_versions pv ON pv.question_id = q.id AND pv.status = 'published'
  LEFT JOIN question_versions ov ON ov.question_id = q.id AND ov.status IN ('draft', 'in_review', 'rejected')`;

// Las preguntas de un curso, de a 50: por lección (en orden) y después el banco y los desafíos.
// counts: cuántas hay en cada filtro (sin el destino ni la búsqueda)
export async function listQuestions(scope: string[] | null, me: string, filters: QuestionFilters) {
  const product = await courseIn(scope, filters.course);
  const replacements = {
    productId: product.id,
    me,
    dest: filters.dest,
    q: filters.q && `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`,
    limit: QUESTIONS_PAGE_SIZE + 1,
    offset: filters.offset,
  };
  const rows = await sequelize.query<ListRow>(
    `SELECT page.*,
            (SELECT count(*) FROM answers a WHERE a.question_id = page.id) AS answers,
            (SELECT r.comment FROM question_reviews r WHERE r.version_id = page.open_id AND r.decision = 'rejected'
               ORDER BY r.created_at DESC LIMIT 1) AS rejection,
            (SELECT u.name FROM question_reviews r JOIN users u ON u.id = r.reviewer_id
              WHERE r.version_id = page.open_id AND r.decision = 'rejected' ORDER BY r.created_at DESC LIMIT 1) AS rejected_by
       FROM (
         SELECT q.id, q.star_id, q.pool, q.status,
                pv.number AS pub_number, pv.type AS pub_type, pv.prompt AS pub_prompt, pv.topic AS pub_topic,
                pv.difficulty AS pub_difficulty, pv.content AS pub_content, ov.content AS open_content,
                ov.id AS open_id, ov.number AS open_number, ov.status AS open_status, ov.type AS open_type,
                ov.prompt AS open_prompt, ov.updated_at AS open_updated_at, ov.submitted_at AS open_submitted_at,
                au.name AS author_name
         ${LIST_FROM}
           LEFT JOIN users au ON au.id = ov.author_id
          WHERE q.product_id = :productId
            AND ${FILTER_WHERE[filters.filter]}
            AND (:dest::text IS NULL OR q.star_id::text = :dest OR q.pool::text = :dest)
            AND (:q::text IS NULL OR ov.prompt ILIKE :q OR pv.prompt ILIKE :q)
          ORDER BY (q.star_id IS NULL), s.position, q.pool, q.position, q.created_at, q.id
          LIMIT :limit OFFSET :offset
       ) page`,
    { replacements, type: QueryTypes.SELECT }
  );

  const [counts] = await sequelize.query<Record<ListFilter, string>>(
    `SELECT ${FILTERS.map((f) => `count(*) FILTER (WHERE ${FILTER_WHERE[f]}) AS "${f}"`).join(", ")}
       ${LIST_FROM}
      WHERE q.product_id = :productId`,
    { replacements: { productId: product.id, me }, type: QueryTypes.SELECT }
  );

  const hasMore = rows.length > QUESTIONS_PAGE_SIZE;
  return {
    questions: rows.slice(0, QUESTIONS_PAGE_SIZE).map((r) => ({
      id: r.id,
      starId: r.star_id,
      pool: r.pool,
      visible: r.status === "published",
      answers: Number(r.answers),
      published: r.pub_number
        ? {
            number: r.pub_number,
            type: r.pub_type,
            prompt: r.pub_prompt,
            snippet: snippetOf(r.pub_content),
            topic: r.pub_topic,
            difficulty: r.pub_difficulty,
          }
        : null,
      open: r.open_number
        ? {
            number: r.open_number,
            status: r.open_status,
            type: r.open_type,
            prompt: r.open_prompt,
            snippet: snippetOf(r.open_content),
            authorName: r.author_name,
            updatedAt: r.open_updated_at,
            submittedAt: r.open_submitted_at,
            rejection: r.rejection ? { comment: r.rejection, by: r.rejected_by } : null,
          }
        : null,
    })),
    counts: Object.fromEntries(FILTERS.map((f) => [f, Number(counts![f])])) as Record<ListFilter, number>,
    nextOffset: hasMore ? filters.offset + QUESTIONS_PAGE_SIZE : null,
  };
}

function fullVersion(v: QuestionVersion) {
  return {
    number: v.number,
    status: v.status,
    type: v.type,
    difficulty: v.difficulty,
    topic: v.topic,
    module: v.module,
    prompt: v.prompt,
    // Es para el staff: el panel muestra la respuesta para editarla y para revisarla
    content: v.content,
    answer: v.answer,
    explanation: v.explanation,
    author: v.Author ? { id: v.Author.id, name: v.Author.name } : null,
    submittedAt: v.submittedAt,
    updatedAt: v.updatedAt,
  };
}

async function findQuestion(scope: string[] | null, id: string, t?: Transaction, lock = false) {
  const question = await Question.findByPk(id, { transaction: t, ...(lock && t ? { lock: t.LOCK.UPDATE } : {}) });
  if (!question || !inScope(scope, question.productId)) throw new HttpError(404, "No existe esa pregunta.");
  return question;
}

// La pregunta entera: lo publicado, la versión abierta y la historia (versiones y revisiones)
export async function questionDetail(scope: string[] | null, id: string, t?: Transaction) {
  const question = await findQuestion(scope, id, t);
  const product = await Product.findByPk(question.productId, { transaction: t });
  const versions = await QuestionVersion.findAll({
    where: { questionId: id },
    include: [{ model: User, as: "Author", attributes: ["id", "name"] }],
    order: [["number", "ASC"]],
    transaction: t,
  });
  const reviews = await QuestionReview.findAll({
    where: { versionId: versions.map((v) => v.id) },
    include: [{ model: User, as: "Reviewer", attributes: ["id", "name"] }],
    order: [["createdAt", "ASC"]],
    transaction: t,
  });
  const answers = await sequelize.query<{ number: number; count: string }>(
    `SELECT question_version AS number, count(*) FROM answers WHERE question_id = :id GROUP BY 1`,
    { replacements: { id }, type: QueryTypes.SELECT, transaction: t }
  );

  const published = versions.find((v) => v.status === "published");
  const open = versions.find((v) => OPEN.includes(v.status));
  return {
    id: question.id,
    course: product!.key,
    starId: question.starId,
    pool: question.pool,
    visible: question.status === "published",
    answers: answers.reduce((sum, a) => sum + Number(a.count), 0),
    published: published ? fullVersion(published) : null,
    open: open ? fullVersion(open) : null,
    history: versions.map((v) => ({
      number: v.number,
      status: v.status,
      author: v.Author?.name ?? null,
      createdAt: v.createdAt,
      submittedAt: v.submittedAt,
      answers: Number(answers.find((a) => a.number === v.number)?.count ?? 0),
    })),
    reviews: reviews.map((r) => {
      const reviewer = (r as QuestionReview & { Reviewer?: User }).Reviewer;
      return {
        version: versions.find((v) => v.id === r.versionId)!.number,
        decision: r.decision,
        comment: r.comment,
        reviewer: reviewer ? reviewer.name : null,
        createdAt: r.createdAt,
      };
    }),
  };
}

// ---------- Escribir (content:edit) ----------

const EMPTY: Omit<VersionFields, "type"> = {
  difficulty: "easy",
  topic: "",
  module: null,
  prompt: "",
  content: {} as QuestionContent,
  answer: {} as QuestionAnswer,
  explanation: "",
};

// Crea una pregunta nueva, con su versión 1 en borrador. Nadie la ve hasta que se apruebe
export async function createQuestion(t: Transaction, scope: string[] | null, author: User, body: unknown) {
  const fields = parseFields(body, false) as Partial<VersionFields> & { type: QuestionType };
  const data = body as Record<string, unknown>;
  const product = await courseIn(scope, typeof data.course === "string" ? data.course : "", t);
  const dest = await parseDestination(data.dest, product.id, t);
  const version: VersionFields = { ...EMPTY, ...fields };

  const question = await Question.create(
    {
      productId: product.id,
      starId: dest.starId,
      pool: dest.pool,
      position: dest.starId ? await nextPosition(dest.starId, t) : null,
      status: "draft",
      authorId: author.id,
      ...version,
    },
    // Su versión 1 la creamos acá (en borrador), no el gancho que crea las publicadas
    { transaction: t, hooks: false }
  );
  await QuestionVersion.create({ questionId: question.id, number: 1, status: "draft", authorId: author.id, ...version }, { transaction: t });
  return questionDetail(scope, question.id, t);
}

// La versión abierta, bloqueada. Si no hay y está publicada, crea la siguiente a partir de lo publicado
async function openVersion(t: Transaction, question: Question, author: User) {
  const open = await QuestionVersion.findOne({
    where: { questionId: question.id, status: OPEN },
    lock: t.LOCK.UPDATE,
    transaction: t,
  });
  if (open) return open;
  const published = await QuestionVersion.findOne({ where: { questionId: question.id, status: "published" }, transaction: t });
  if (!published) throw new HttpError(409, "Esta pregunta no tiene una versión para editar.");
  const last = (await QuestionVersion.max("number", { where: { questionId: question.id }, transaction: t })) as number;
  return QuestionVersion.create(
    {
      questionId: question.id,
      number: last + 1,
      status: "draft",
      authorId: author.id,
      type: published.type,
      difficulty: published.difficulty,
      topic: published.topic,
      module: published.module,
      prompt: published.prompt,
      content: published.content,
      answer: published.answer,
      explanation: published.explanation,
    },
    { transaction: t }
  );
}

// Guarda cambios en la versión abierta. Una rechazada vuelve a borrador (el comentario queda en la historia).
// El destino solo cambia mientras nunca se publicó; el juego, tampoco en una publicada
export async function updateQuestion(t: Transaction, scope: string[] | null, author: User, id: string, body: unknown) {
  const question = await findQuestion(scope, id, t, true);
  const fields = parseFields(body, true);
  const version = await openVersion(t, question, author);
  if (version.status === "in_review") throw new HttpError(409, "Está en revisión: retirala para cambiarla.");
  if (fields.type && fields.type !== version.type && question.version !== null) {
    throw new HttpError(400, "El juego de una pregunta publicada no se cambia.");
  }

  const data = body as Record<string, unknown>;
  if (data.dest !== undefined) {
    if (question.version !== null) throw new HttpError(400, "Una pregunta publicada no cambia de lugar.");
    const dest = await parseDestination(data.dest, question.productId, t);
    if (dest.starId !== question.starId || dest.pool !== question.pool) {
      await question.update(
        { starId: dest.starId, pool: dest.pool, position: dest.starId ? await nextPosition(dest.starId, t) : null },
        { transaction: t }
      );
    }
  }

  await version.update({ ...fields, status: "draft" }, { transaction: t });
  // Mientras nunca se publicó, la fila de questions sigue al borrador (nadie la ve)
  if (question.version === null) await question.update(fields, { transaction: t });
  return questionDetail(scope, id, t);
}

// La manda a revisión, si está completa. 400 con `problems` si le falta algo
export async function submitQuestion(t: Transaction, scope: string[] | null, id: string) {
  const question = await findQuestion(scope, id, t, true);
  const version = await QuestionVersion.findOne({ where: { questionId: question.id, status: ["draft", "rejected"] }, transaction: t });
  if (!version) throw new HttpError(409, "No hay cambios para enviar.");
  const problems = problemsOf(version);
  if (problems.length > 0) throw new HttpError(400, "Le falta algo para poder enviarla.", { problems });
  await version.update({ status: "in_review", submittedAt: new Date() }, { transaction: t });
  return questionDetail(scope, id, t);
}

// La saca de revisión para seguir editándola
export async function withdrawQuestion(t: Transaction, scope: string[] | null, id: string) {
  const question = await findQuestion(scope, id, t, true);
  const version = await QuestionVersion.findOne({ where: { questionId: question.id, status: "in_review" }, transaction: t });
  if (!version) throw new HttpError(409, "No está en revisión.");
  await version.update({ status: "draft" }, { transaction: t });
  return questionDetail(scope, id, t);
}

// ---------- Revisar (content:approve) ----------

function bodyOf(v: QuestionVersion) {
  return {
    type: v.type,
    difficulty: v.difficulty,
    topic: v.topic,
    module: v.module,
    prompt: v.prompt,
    content: v.content,
    answer: v.answer,
    explanation: v.explanation,
  };
}

// La publica: pasa a ser lo que ven los alumnos (se copia en questions) y la anterior queda vieja.
// Quien estaba jugando la anterior la termina con esa (ver games/versions.ts)
export async function approveQuestion(t: Transaction, ctx: AuditContext, scope: string[] | null, id: string) {
  const question = await findQuestion(scope, id, t, true);
  const version = await QuestionVersion.findOne({ where: { questionId: id, status: "in_review" }, transaction: t });
  if (!version) throw new HttpError(409, "No hay nada esperando revisión en esta pregunta.");
  const problems = problemsOf(version);
  if (problems.length > 0) throw new HttpError(400, "Está incompleta: no se puede publicar.", { problems });

  const before = { status: question.status, version: question.version };
  await QuestionVersion.update({ status: "replaced" }, { where: { questionId: id, status: "published" }, transaction: t });
  await version.update({ status: "published" }, { transaction: t });
  await question.update({ ...bodyOf(version), version: version.number, status: "published" }, { transaction: t });
  await QuestionReview.create({ versionId: version.id, reviewerId: ctx.actorId, decision: "approved" }, { transaction: t });

  await writeAudit(t, {
    ...ctx,
    action: "content.approve",
    targetType: "question",
    targetId: id,
    before,
    after: { status: "published", version: version.number },
    reversible: true,
  });
  return questionDetail(scope, id, t);
}

// La devuelve a quien la escribió, con un comentario (obligatorio)
export async function rejectQuestion(t: Transaction, ctx: AuditContext, scope: string[] | null, id: string, comment: unknown) {
  if (typeof comment !== "string" || !comment.trim()) throw new HttpError(400, "Escribí qué tiene que cambiar.");
  if (comment.length > 2000) throw new HttpError(400, "El comentario es muy largo.");
  await findQuestion(scope, id, t, true);
  const version = await QuestionVersion.findOne({ where: { questionId: id, status: "in_review" }, transaction: t });
  if (!version) throw new HttpError(409, "No hay nada esperando revisión en esta pregunta.");

  await version.update({ status: "rejected" }, { transaction: t });
  await QuestionReview.create(
    { versionId: version.id, reviewerId: ctx.actorId, decision: "rejected", comment: comment.trim() },
    { transaction: t }
  );
  await writeAudit(t, {
    ...ctx,
    action: "content.reject",
    targetType: "question",
    targetId: id,
    before: { version: version.number, status: "in_review" },
    after: { version: version.number, status: "rejected", comment: comment.trim() },
    reversible: true,
  });
  return questionDetail(scope, id, t);
}

// Los alumnos dejan de verla. Lo ya respondido queda; quien ya encendió la estrella la sigue teniendo
export async function unpublishQuestion(t: Transaction, ctx: AuditContext, scope: string[] | null, id: string, options: ChangeOptions = {}) {
  const question = await findQuestion(scope, id, t, true);
  if (question.status !== "published") throw new HttpError(409, "No está publicada.");
  await question.update({ status: "draft" }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "content.unpublish",
    targetType: "question",
    targetId: id,
    before: { status: "published" },
    after: { status: "draft" },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return questionDetail(scope, id, t);
}

// Vuelve a mostrar la última versión aprobada
export async function republishQuestion(t: Transaction, ctx: AuditContext, scope: string[] | null, id: string, options: ChangeOptions = {}) {
  const question = await findQuestion(scope, id, t, true);
  if (question.status === "published") throw new HttpError(409, "Ya está publicada.");
  if (question.version === null) throw new HttpError(409, "Nunca se aprobó: enviala a revisión.");
  await question.update({ status: "published" }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "content.republish",
    targetType: "question",
    targetId: id,
    before: { status: "draft" },
    after: { status: "published" },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return questionDetail(scope, id, t);
}

// ¿Algún alumno jugó esa versión? (respondió, o le tocó en un examen, un desafío o un repaso)
async function versionPlayed(t: Transaction, questionId: string, number: number) {
  const [row] = await sequelize.query<{ played: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM answers WHERE question_id = :questionId AND question_version = :number)
         OR EXISTS (SELECT 1 FROM exam_attempt_questions WHERE question_id = :questionId AND question_version = :number)
         OR EXISTS (SELECT 1 FROM challenge_attempt_questions WHERE question_id = :questionId AND question_version = :number)
         OR EXISTS (SELECT 1 FROM daily_review_questions WHERE question_id = :questionId AND question_version = :number)
         AS played`,
    { replacements: { questionId, number }, type: QueryTypes.SELECT, transaction: t }
  );
  return row!.played;
}

// Solo para revertir una aprobación desde la bitácora: la versión vuelve a revisión y los alumnos
// vuelven a ver la anterior (o nada, si era la primera). No se puede si alguien ya la jugó: para eso
// está despublicar
export async function unapproveQuestion(
  t: Transaction,
  ctx: AuditContext,
  id: string,
  approved: { status: string; version: number },
  previous: { status: string; version: number | null },
  revertsId: number
) {
  const question = await findQuestion(null, id, t, true);
  if (await versionPlayed(t, id, approved.version)) {
    throw new HttpError(409, "Los alumnos ya jugaron esa versión: no se puede revertir. Si hace falta, despublicala.");
  }
  if (await QuestionVersion.findOne({ where: { questionId: id, status: OPEN }, transaction: t })) {
    throw new HttpError(409, "Esta pregunta tiene otra versión abierta: resolvela antes de revertir.");
  }

  await QuestionVersion.update({ status: "in_review" }, { where: { questionId: id, number: approved.version }, transaction: t });
  if (previous.version !== null) {
    const prev = await QuestionVersion.findOne({ where: { questionId: id, number: previous.version }, transaction: t });
    await prev!.update({ status: "published" }, { transaction: t });
    await question.update({ ...bodyOf(prev!), version: prev!.number, status: previous.status as "published" | "draft" }, { transaction: t });
  } else {
    await question.update({ version: null, status: "draft" }, { transaction: t });
  }

  await writeAudit(t, {
    ...ctx,
    action: "audit.revert",
    targetType: "question",
    targetId: id,
    before: approved,
    after: previous,
    reversible: false,
    revertsId,
  });
  return questionDetail(null, id, t);
}

// Solo para revertir un rechazo: la versión vuelve a esperar revisión
export async function unrejectQuestion(t: Transaction, ctx: AuditContext, id: string, number: number, revertsId: number) {
  await findQuestion(null, id, t, true);
  const version = await QuestionVersion.findOne({ where: { questionId: id, number }, transaction: t });
  if (!version || !OPEN.includes(version.status)) throw new HttpError(409, "Esa versión ya no está abierta.");
  const before = { version: number, status: version.status };
  await version.update({ status: "in_review" }, { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: "audit.revert",
    targetType: "question",
    targetId: id,
    before,
    after: { version: number, status: "in_review" },
    reversible: false,
    revertsId,
  });
  return questionDetail(null, id, t);
}

// Lo que tiene hoy una pregunta, para comparar al revertir
export async function currentQuestionState(t: Transaction, id: string) {
  const question = await findQuestion(null, id, t, true);
  return { status: question.status, version: question.version };
}

export async function currentVersionStatus(t: Transaction, id: string, number: number) {
  const version = await QuestionVersion.findOne({ where: { questionId: id, number }, transaction: t });
  return { version: number, status: version?.status ?? null };
}

// ---------- Los cursos de cada docente (roles:manage) ----------

export async function teacherCourses(userId: string, t?: Transaction): Promise<string[]> {
  const rows = await sequelize.query<{ key: string }>(
    `SELECT p.key FROM teacher_products tp JOIN products p ON p.id = tp.product_id WHERE tp.user_id = :userId ORDER BY p.key`,
    { replacements: { userId }, type: QueryTypes.SELECT, transaction: t }
  );
  return rows.map((r) => r.key);
}

export function parseCourseKeys(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) {
    throw new HttpError(400, "courses tiene que ser una lista de cursos.");
  }
  return [...new Set(value as string[])].sort();
}

// Reemplaza la lista de cursos de un docente. Un registro en la bitácora (reversible)
export async function setTeacherCourses(
  t: Transaction,
  ctx: AuditContext,
  userId: string,
  keys: string[],
  options: ChangeOptions = {}
) {
  const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
  if (!user) throw new HttpError(404, "No existe ese usuario.");
  if ((await roleKeyOf(user, t)) !== "teacher") throw new HttpError(409, "Solo los docentes tienen cursos asignados.");

  const products = await Product.findAll({ where: { key: keys }, transaction: t });
  if (products.length !== keys.length) throw new HttpError(400, "Alguno de esos cursos no existe.");

  const before = await teacherCourses(userId, t);
  const after = [...keys].sort();
  if (before.join() === after.join()) return after;

  await TeacherProduct.destroy({ where: { userId }, transaction: t });
  await TeacherProduct.bulkCreate(products.map((p) => ({ userId, productId: p.id })), { transaction: t });
  await writeAudit(t, {
    ...ctx,
    action: options.revertsId ? "audit.revert" : "teacher.courses_update",
    targetType: "user",
    targetId: userId,
    before: { courses: before },
    after: { courses: after },
    reversible: !options.revertsId,
    revertsId: options.revertsId,
  });
  return after;
}
