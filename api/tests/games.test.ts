import { describe, expect, it } from "vitest";
import { permutation } from "../src/games/shuffle.js";
import { displayOrders, present } from "../src/games/present.js";
import { grade, InvalidResponseError } from "../src/games/grade.js";
import { unlockedStarIds } from "../src/games/unlock.js";
import { validateQuestion } from "../src/games/validate.js";

const output = {
  id: "q1",
  type: "output" as const,
  difficulty: "easy" as const,
  prompt: "¿Qué imprime este código?",
  content: { code: "print(2 + 2)", options: ["4", "22", "2 + 2", "Error"] },
};

const orderLines = {
  id: "q2",
  type: "order_lines" as const,
  difficulty: "easy" as const,
  prompt: "Ordená las líneas",
  content: { lines: ["def saludar():", "    print('Hola')", "saludar()"] },
};

describe("mezcla", () => {
  it("con la misma semilla da siempre el mismo orden", () => {
    expect(permutation("alumno:pregunta", 6)).toEqual(permutation("alumno:pregunta", 6));
  });

  it("devuelve cada índice una sola vez", () => {
    const order = permutation("alumno:pregunta", 10);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("con semillas distintas da órdenes distintos", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) => permutation(`alumno-${i}:pregunta`, 6).join(","))
    );
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("vista del alumno", () => {
  it("muestra las mismas opciones, mezcladas, sin respuesta ni explicación", () => {
    const view = present({ ...output, answer: { correct: 0 }, explanation: "..." } as never, "a:q1");

    expect(view).not.toHaveProperty("answer");
    expect(view).not.toHaveProperty("explanation");
    expect([...(view.content as { options: string[] }).options].sort()).toEqual(
      [...output.content.options].sort()
    );
  });

  it("nunca muestra las líneas ya ordenadas", () => {
    for (let i = 0; i < 50; i++) {
      const [order] = displayOrders(orderLines, `alumno-${i}:q2`);
      expect(order).not.toEqual([0, 1, 2]);
    }
  });
});

describe("corrector", () => {
  const seed = "alumno:q1";

  it("¿Qué imprime?: acepta la correcta y devuelve dónde estaba", () => {
    const question = { ...output, answer: { correct: 0 } };
    const view = present(question, seed);
    const shown = (view.content as { options: string[] }).options;
    const right = shown.indexOf("4");
    const wrong = shown.indexOf("22");

    expect(grade(question, seed, { choice: right })).toEqual({ correct: true, solution: { choice: right } });
    expect(grade(question, seed, { choice: wrong })).toEqual({ correct: false, solution: { choice: right } });
  });

  it("Completá el hueco: corrige cada hueco con su propio orden", () => {
    const question = {
      id: "q3",
      type: "fill_blank" as const,
      difficulty: "easy" as const,
      prompt: "Completá el código",
      content: { code: "for i in ___(5):\n    ___(i)", blanks: [["range", "list", "len"], ["print", "echo", "show"]] },
      answer: { correct: [0, 0] },
    };
    const view = present(question, seed);
    const [first, second] = (view.content as { blanks: string[][] }).blanks;
    const right = [first!.indexOf("range"), second!.indexOf("print")];

    expect(grade(question, seed, { choices: right }).correct).toBe(true);
    expect(grade(question, seed, { choices: [first!.indexOf("len"), right[1]] }).correct).toBe(false);
  });

  it("Ordená las líneas: acepta el orden correcto aunque dos líneas iguales estén intercambiadas", () => {
    const question = {
      id: "q4",
      type: "order_lines" as const,
      difficulty: "easy" as const,
      prompt: "Ordená las líneas",
      content: { lines: ["x = 1", "print(x)", "print(x)"] },
      answer: { order: [0, 1, 2] },
    };
    const shown = (present(question, seed).content as { lines: string[] }).lines;
    const first = shown.indexOf("x = 1");
    const prints = shown.flatMap((line, i) => (line === "print(x)" ? [i] : []));

    expect(grade(question, seed, { order: [first, prints[0], prints[1]] }).correct).toBe(true);
    expect(grade(question, seed, { order: [first, prints[1], prints[0]] }).correct).toBe(true);
    expect(grade(question, seed, { order: [prints[0], first, prints[1]] }).correct).toBe(false);
  });

  it("rechaza respuestas con forma inválida", () => {
    const question = { ...output, answer: { correct: 0 } };
    const lines = { ...orderLines, answer: { order: [0, 1, 2] } };

    for (const bad of [null, "2", {}, { choice: "1" }, { choice: 9 }, { choice: -1 }, { choice: 1.5 }]) {
      expect(() => grade(question, seed, bad)).toThrow(InvalidResponseError);
    }
    expect(() => grade(lines, seed, { order: [0, 0, 0] })).toThrow(InvalidResponseError);
    expect(() => grade(lines, seed, { order: [0, 1] })).toThrow(InvalidResponseError);
  });
});

describe("desbloqueo de estrellas", () => {
  const stars = [
    { id: "s3", position: 3, kind: "lesson" as const },
    { id: "s1", position: 1, kind: "lesson" as const },
    { id: "s2", position: 2, kind: "lesson" as const },
    { id: "exam", position: 4, kind: "exam" as const },
  ];

  it("sin nada completado, solo se abre la primera", () => {
    expect(unlockedStarIds(stars, new Set())).toEqual(new Set(["s1"]));
  });

  it("al completar una, se abre la siguiente y la completada sigue abierta", () => {
    expect(unlockedStarIds(stars, new Set(["s1"]))).toEqual(new Set(["s1", "s2"]));
  });

  it("el examen se abre solo con todas las lecciones completas", () => {
    expect(unlockedStarIds(stars, new Set(["s1", "s2"])).has("exam")).toBe(false);
    expect(unlockedStarIds(stars, new Set(["s1", "s2", "s3"])).has("exam")).toBe(true);
  });
});

describe("validador de preguntas", () => {
  it("acepta preguntas bien armadas de los cuatro tipos", () => {
    expect(validateQuestion("output", { code: "print(1)", options: ["1", "2"] }, { correct: 0 })).toEqual([]);
    expect(validateQuestion("multiple_choice", { options: ["Sí", "No"] }, { correct: 1 })).toEqual([]);
    expect(
      validateQuestion("fill_blank", { code: "___(1)", blanks: [["print", "echo"]] }, { correct: [0] })
    ).toEqual([]);
    expect(validateQuestion("order_lines", { lines: ["a = 1", "print(a)"] }, { order: [0, 1] })).toEqual([]);
  });

  it("detecta los errores más comunes", () => {
    expect(validateQuestion("output", { code: "print(1)", options: ["1", "2"] }, { correct: 5 })).toEqual([
      "La respuesta correcta no es ninguna de las opciones.",
    ]);
    expect(validateQuestion("multiple_choice", { options: ["Sí", "Sí"] }, { correct: 0 })).toEqual([
      "Hay opciones repetidas.",
    ]);
    expect(
      validateQuestion("fill_blank", { code: "___(___)", blanks: [["print", "echo"]] }, { correct: [0] })
    ).toContain("El código tiene 2 huecos, pero hay opciones para 1.");
    expect(validateQuestion("order_lines", { lines: ["a", "b"] }, { order: [0, 0] })).toEqual([
      "El orden correcto tiene que incluir cada línea una sola vez.",
    ]);
    expect(validateQuestion("sudoku", {}, {})).toEqual(["Tipo de juego desconocido: sudoku."]);
  });
});