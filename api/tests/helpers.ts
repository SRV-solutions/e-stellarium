import request from "supertest";
import { vi } from "vitest";
import { app } from "../src/app.js";
import { User } from "../src/models/index.js";
import { hashPassword } from "../src/lib/password.js";
import { sendMail } from "../src/lib/mailer.js";
import { Constellation, Product, Question, Star } from "../src/models/index.js";
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