import { describe, expect, it } from "vitest";
import { permutation } from "../src/games/shuffle.js";
import { displayOrders, present } from "../src/games/present.js";

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