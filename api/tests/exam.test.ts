import { describe, expect, it } from "vitest";
import type { QuestionType } from "../src/models/Question.js";
import { computeExamState } from "../src/games/examState.js";
import {
  couponExpiresAt,
  couponPercent,
  deadlineFor,
  drawExamQuestions,
  EXAM_SIZE,
  generateCouponCode,
  hasPassed,
  isLate,
  retryOpensAt,
} from "../src/games/exam.js";

// Un banco de prueba: muchas de "¿Qué imprime?" y una sola de cada uno de los otros juegos
function makeBank(): { id: string; type: QuestionType }[] {
  const bank: { id: string; type: QuestionType }[] = [];
  for (let i = 0; i < 20; i++) bank.push({ id: `out${i}`, type: "output" });
  bank.push({ id: "fill", type: "fill_blank" }, { id: "order", type: "order_lines" }, { id: "mc", type: "multiple_choice" });
  return bank;
}

describe("sorteo del examen", () => {
  it("saca 10 preguntas distintas con al menos una de cada juego", () => {
    const bank = makeBank();
    for (const seed of ["a", "b", "c", "d", "e"]) {
      const ids = drawExamQuestions(bank, seed);
      expect(ids).toHaveLength(EXAM_SIZE);
      expect(new Set(ids).size).toBe(EXAM_SIZE);
      expect(ids).toEqual(expect.arrayContaining(["fill", "order", "mc"]));
    }
  });

  it("con la misma semilla sale el mismo sorteo, y con otra, otro", () => {
    const bank = makeBank();
    expect(drawExamQuestions(bank, "intento-1")).toEqual(drawExamQuestions(bank, "intento-1"));
    expect(drawExamQuestions(bank, "intento-1")).not.toEqual(drawExamQuestions(bank, "intento-2"));
  });

  it("falla si el banco no alcanza o le falta un juego", () => {
    expect(() => drawExamQuestions(makeBank().slice(0, 9), "a")).toThrow();
    const withoutMc = makeBank().filter((q) => q.type !== "multiple_choice");
    expect(() => drawExamQuestions(withoutMc, "a")).toThrow(/multiple_choice/);
  });
});

describe("reloj del examen", () => {
  const shownAt = new Date("2026-11-09T10:00:00Z");

  it("cada juego tiene su tiempo", () => {
    expect(deadlineFor("output", shownAt)).toEqual(new Date("2026-11-09T10:00:30Z"));
    expect(deadlineFor("multiple_choice", shownAt)).toEqual(new Date("2026-11-09T10:00:30Z"));
    expect(deadlineFor("fill_blank", shownAt)).toEqual(new Date("2026-11-09T10:00:40Z"));
    expect(deadlineFor("order_lines", shownAt)).toEqual(new Date("2026-11-09T10:00:45Z"));
  });

  it("acepta la respuesta hasta 2 segundos después del límite, por la demora de la red", () => {
    const deadline = deadlineFor("output", shownAt);
    expect(isLate(deadline, new Date("2026-11-09T10:00:29Z"))).toBe(false);
    expect(isLate(deadline, new Date("2026-11-09T10:00:32Z"))).toBe(false);
    expect(isLate(deadline, new Date("2026-11-09T10:00:32.001Z"))).toBe(true);
  });
});

describe("resultado del examen", () => {
  it("aprueba con 7 de 10", () => {
    expect(hasPassed(6)).toBe(false);
    expect(hasPassed(7)).toBe(true);
    expect(hasPassed(10)).toBe(true);
  });

  it("si no aprueba, puede reintentar 2 días después", () => {
    expect(retryOpensAt(new Date("2026-11-09T10:00:00Z"))).toEqual(new Date("2026-11-11T10:00:00Z"));
  });
});

describe("cupón del examen", () => {
  it("60 % el primero y 40 % los siguientes", () => {
    expect(couponPercent(0)).toBe(60);
    expect(couponPercent(1)).toBe(40);
    expect(couponPercent(3)).toBe(40);
  });

  it("vence a los 60 días", () => {
    expect(couponExpiresAt(new Date("2026-11-09T10:00:00Z"))).toEqual(new Date("2027-01-08T10:00:00Z"));
  });

  it("el código lleva el curso y caracteres que no se confunden", () => {
    expect(generateCouponCode("python")).toMatch(/^ESTL-PY-[2-9A-HJKMNP-TW-Z]{6}$/);
    expect(generateCouponCode("fundamentos-backend")).toMatch(/^ESTL-FB-/);
    const codes = new Set(Array.from({ length: 200 }, () => generateCouponCode("python")));
    expect(codes.size).toBe(200);
  });
});

describe("estado del examen", () => {
  const at = (iso: string) => new Date(`2026-11-${iso}Z`);
  const opensAt = at("10T10:00:00");
  const failed = { id: "a1", finishedAt: at("12T10:00:00"), correctCount: 5, passed: false };

  it("cerrado si faltan lecciones, y esperando si faltan los 3 días", () => {
    expect(computeExamState(null, [], at("20T10:00:00"))).toEqual({ status: "locked" });
    expect(computeExamState(opensAt, [], at("09T10:00:00"))).toEqual({ status: "waiting", opensAt });
  });

  it("abierto cuando se cumplen los 3 días", () => {
    expect(computeExamState(opensAt, [], opensAt)).toEqual({ status: "open", attempts: 0 });
  });

  it("en curso si tiene un intento sin terminar", () => {
    const running = { id: "a2", finishedAt: null, correctCount: null, passed: null };
    expect(computeExamState(opensAt, [failed, running], at("20T10:00:00"))).toEqual({
      status: "in_progress",
      attemptId: "a2",
    });
  });

  it("si no aprobó, espera 2 días para reintentar", () => {
    expect(computeExamState(opensAt, [failed], at("13T10:00:00"))).toEqual({
      status: "retry_wait",
      opensAt: at("14T10:00:00"),
      lastCorrect: 5,
      attemptId: "a1",
    });
    expect(computeExamState(opensAt, [failed], at("14T10:00:00"))).toEqual({ status: "open", attempts: 1 });
  });

  it("aprobado queda aprobado", () => {
    const passed = { id: "a2", finishedAt: at("15T10:00:00"), correctCount: 8, passed: true };
    expect(computeExamState(opensAt, [failed, passed], at("20T10:00:00"))).toEqual({
      status: "passed",
      correctCount: 8,
      attemptId: "a2",
    });
  });
});
