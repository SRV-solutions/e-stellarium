import { describe, expect, it } from "vitest";
import { starLetters } from "../src/games/starLetter.js";

const lesson = (id: string, position: number, module: number | null) => ({ id, position, module, kind: "lesson" as const });

describe("la letra de cada estrella", () => {
  it("da una letra por módulo, con número si el módulo tiene varias, y Ω al examen", () => {
    const letters = starLetters([
      lesson("a", 1, 1),
      lesson("b", 2, 2),
      lesson("c", 3, 2),
      lesson("d", 4, 2),
      lesson("e", 5, 3),
      { id: "x", position: 6, module: null, kind: "exam" },
    ]);

    expect([...letters.values()]).toEqual(["α", "β¹", "β²", "β³", "γ", "Ω"]);
  });

  it("numera por posición aunque lleguen desordenadas", () => {
    const letters = starLetters([lesson("b", 2, 1), lesson("a", 1, 1)]);

    expect(letters.get("a")).toBe("α¹");
    expect(letters.get("b")).toBe("α²");
  });

  it("a una lección sin módulo le da la letra de su posición", () => {
    expect(starLetters([lesson("a", 3, null)]).get("a")).toBe("γ");
  });
});
