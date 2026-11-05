import type { StudentQuestion } from "../../types";

// El nombre de cada juego, como lo ve el alumno
export const KIND: Record<StudentQuestion["type"], string> = {
  output: "¿Qué imprime?",
  fill_blank: "Completá el hueco",
  order_lines: "Ordená las líneas",
  multiple_choice: "Opción múltiple",
};
