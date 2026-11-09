import request from "supertest";
import { vi } from "vitest";
import { app } from "../src/app.js";
import { User } from "../src/models/index.js";
import { hashPassword } from "../src/lib/password.js";
import { sendMail } from "../src/lib/mailer.js";
import { Constellation, ExamAttemptQuestion, Product, Question, Star, StarCompletion } from "../src/models/index.js";
import { examSeed } from "../src/games/exam.js";
import { grade } from "../src/games/grade.js";
import type { QuestionStatus } from "../src/models/Question.js";

export const PASSWORD = "Prueba1234";

export function http() {
  return request(app);
}

export function provision(body: object) {
  return request(app).post("/provision").set("x-api-key", process.env.INTERNAL_API_KEY!).send(body);
}

export async function createUser(email = "alumno@test.com", password: string | null = PASSWORD) {
  return User.create({
    email,
    name: "Alumno Test",
    alias: `test-${Math.random().toString(36).slice(2, 8)}`,
    passwordHash: password ? await hashPassword(password) : null,
  });
}

// Un "agente" guarda las cookies entre peticiones, como un navegador
export async function loginAs(email: string, password = PASSWORD) {
  const agent = request.agent(app);
  await agent.post("/auth/login").send({ email, password }).expect(200);
  return agent;
}

export function sentMails() {
  return vi.mocked(sendMail).mock.calls.map(([mail]) => mail);
}

export function tokenFromLastMail() {
  const mails = sentMails();
  const html = mails.at(-1)?.html ?? "";
  const match = html.match(/token=([\w-]+)/);
  if (!match) throw new Error("El último mail no tiene un link con token");
  return match[1];
}

// Una constelación de Python con una estrella
export async function createPythonStar({ published = true } = {}) {
  const product = await Product.findOne({ where: { key: "python" } });
  const constellation = await Constellation.create({
    productId: product!.id,
    name: "Constelación Python",
    published,
  });
  const star = await Star.create({ constellationId: constellation.id, position: 1, title: "Variables" });
  return { product: product!, constellation, star };
}

// Una pregunta de "¿Qué imprime?". Los campos que se pasan reemplazan a los de ejemplo
export function createQuestion(fields: {
  productId: string;
  starId?: string;
  position?: number;
  status?: QuestionStatus;
}) {
  return Question.create({
    type: "output",
    difficulty: "easy",
    topic: "variables",
    prompt: "¿Qué imprime este código?",
    content: { code: "print(2 + 2)", options: ["4", "22", "2 + 2", "Error"] },
    answer: { correct: 0 },
    explanation: "2 + 2 es 4.",
    status: "published",
    ...fields,
  });
}

// Un alumno con sesión iniciada e inscripto en los cursos indicados
export async function enrolledStudent(courses = ["python"], email = "alumno@test.com") {
  await createUser(email);
  await provision({ email, name: "Alumno", paymentId: "3001", courses });
  return loginAs(email);
}
// El banco del examen de un curso: 10 preguntas sin estrella, al menos una de cada juego
export async function createExamBank(productId: string) {
  const common = { productId, difficulty: "easy" as const, topic: "examen", explanation: "Así.", status: "published" as const };
  for (let i = 0; i < 7; i++) {
    await createQuestion({ productId, status: "published" });
  }
  await Question.create({
    ...common,
    type: "fill_blank",
    prompt: "Completá el hueco",
    content: { code: "print(___)", blanks: [["1", "x"]] },
    answer: { correct: [0], output: "1" },
  });
  await Question.create({
    ...common,
    type: "order_lines",
    prompt: "Ordená las líneas",
    content: { lines: ["a = 1", "print(a)"] },
    answer: { order: [0, 1], output: "1" },
  });
  await Question.create({
    ...common,
    type: "multiple_choice",
    prompt: "¿Cuál es un número?",
    content: { options: ["1", "uno"] },
    answer: { correct: 0 },
  });
}

// Una constelación de Python con una lección encendida hace `daysAgo` días, un examen y su banco
export async function createExamReady(userId: string, daysAgo = 4) {
  const { product, constellation, star } = await createPythonStar();
  const exam = await Star.create({ constellationId: constellation.id, position: 2, title: "Examen", kind: "exam" });
  const completion = await StarCompletion.create({ userId, starId: star.id });
  // La fecha de creación solo se puede cambiar con el update del modelo, no el de la fila
  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  await StarCompletion.update({ createdAt }, { where: { id: completion.id } });
  await createExamBank(product.id);
  return { product, constellation, lesson: star, exam };
}

// Una respuesta con la forma correcta para cada juego (no necesariamente acertada)
function anyResponse(q: Question) {
  if (q.type === "fill_blank") return { choices: (q.content as { blanks: string[][] }).blanks.map(() => 0) };
  if (q.type === "order_lines") return { order: (q.content as { lines: string[] }).lines.map((_, i) => i) };
  return { choice: 0 };
}

// La respuesta correcta, en las posiciones de la pantalla del alumno (lo que devuelve grade como solución)
export async function rightResponse(attemptId: string, position: number) {
  const row = await ExamAttemptQuestion.findOne({ where: { attemptId, position } });
  const q = await Question.scope("withAnswer").findByPk(row!.questionId);
  return grade(q!, examSeed(attemptId, q!.id), anyResponse(q!)).solution;
}

export async function wrongResponse(attemptId: string, position: number) {
  const right = await rightResponse(attemptId, position);
  if ("choice" in right) return { choice: right.choice === 0 ? 1 : 0 };
  if ("choices" in right) return { choices: right.choices.map((c) => (c === 0 ? 1 : 0)) };
  return { order: [...right.order].reverse() };
}
