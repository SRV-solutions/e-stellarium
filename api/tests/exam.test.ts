import { describe, expect, it } from "vitest";
import type { QuestionType } from "../src/models/Question.js";
import { deadlineFor, drawExamQuestions, EXAM_SIZE, isLate } from "../src/games/exam.js";

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
