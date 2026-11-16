import { randomBytes } from "node:crypto";
import type { Difficulty, QuestionAnswer, QuestionContent, QuestionType } from "../models/Question.js";

// La demo para invitados: una estrella de prueba con 5 juegos fáciles de Python.
// Las preguntas viven acá y no en la base: no son contenido del curso (no pasan por el panel ni por
// revisión), no hay forma de mezclarlas con el banco del examen y la demo anda aunque la base esté vacía.
// La respuesta correcta se queda en el servidor: el navegador recibe lo mismo que en una estrella (`present`)
// y manda posiciones de su pantalla.
// Cada respuesta se verificó ejecutando el código de verdad (en "Completá el hueco" y "Ordená las líneas",
// también que ninguna otra combinación dé la misma salida).

export type DemoQuestion = {
  id: string;
  type: QuestionType;
  difficulty: Difficulty;
  prompt: string;
  content: QuestionContent;
  answer: QuestionAnswer;
  explanation: string;
};

export const DEMO_QUESTIONS: DemoQuestion[] = [
  {
    id: "demo-hola",
    type: "output",
    difficulty: "easy",
    prompt: "¿Qué imprime este código?",
    content: {
      code: 'nombre = "Ana"\nprint("Hola, " + nombre)',
      options: ["Hola, Ana", "Hola, nombre", "Hola,Ana", "Error"],
    },
    answer: { correct: 0 },
    explanation: 'Con + se pegan los textos. nombre guarda "Ana", así que sale "Hola, " seguido de Ana.',
  },
  {
    id: "demo-tipo",
    type: "multiple_choice",
    difficulty: "easy",
    prompt: "¿Qué tipo de dato es el valor 3.14 en Python?",
    content: {
      options: ["float: un número con decimales", "int: un número entero", "str: un texto", "bool: verdadero o falso"],
    },
    answer: { correct: 0 },
    explanation: "Los números con punto decimal son float. Los enteros (3, 42) son int.",
  },
  {
    id: "demo-edad",
    type: "fill_blank",
    difficulty: "easy",
    prompt: 'Completá el código para que imprima "Mayor de edad".',
    content: {
      code: 'edad = 18\nif edad ___ 18:\n    print("Mayor de edad")\nelse:\n    print("Menor de edad")',
      blanks: [[">=", ">", "<", "!="]],
    },
    answer: { correct: [0], output: "Mayor de edad" },
    explanation: ">= significa \"mayor o igual\": con 18 se cumple. Con > no (18 no es mayor que 18) y el programa iría por el else.",
  },
  {
    id: "demo-suma",
    type: "order_lines",
    difficulty: "easy",
    prompt: "Ordená las líneas para que el programa imprima 6.",
    content: {
      lines: ["total = 0", "for n in [1, 2, 3]:", "    total = total + n", "print(total)"],
    },
    answer: { order: [0, 1, 2, 3], output: "6" },
    explanation: "Primero se crea total, después el for le va sumando cada número, y recién al final se imprime la suma.",
  },
  {
    id: "demo-lista",
    type: "output",
    difficulty: "easy",
    prompt: "¿Qué imprime este código?",
    content: {
      code: 'frutas = ["manzana", "pera", "uva"]\nprint(frutas[1])',
      options: ["pera", "manzana", "uva", "Error"],
    },
    answer: { correct: 0 },
    explanation: "Las posiciones de una lista empiezan en 0: frutas[0] es manzana y frutas[1], pera.",
  },
];

// Igual que en la práctica: un id al azar por partida hace de semilla de la mezcla (no se guarda nada)
export function newDemoId() {
  return randomBytes(8).toString("hex");
}

export function isDemoId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/.test(value);
}

export function demoSeed(demoId: string, questionId: string) {
  return `demo:${demoId}:${questionId}`;
}

// El cupón: cuánto descuenta, cuánto dura y cuántos puede pedir una misma IP por día.
// Son fijos (no están en settings): los de la demo no se editan desde el panel
export const DEMO_COUPON_PERCENT = 25;
export const DEMO_COUPON_HOURS = 24;
export const DEMO_IP_DAILY_LIMIT = 3;
