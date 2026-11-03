function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTextList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string" && v.length > 0);
}

function isIndex(value: unknown, length: number): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < length;
}

function hasRepeats(list: string[]) {
  return new Set(list).size !== list.length;
}

// Revisa que una pregunta esté bien armada. Devuelve la lista de problemas (vacía si está bien)
export function validateQuestion(type: string, content: unknown, answer: unknown): string[] {
  if (!isObject(content)) return ["El contenido tiene que ser un objeto."];
  if (!isObject(answer)) return ["La respuesta tiene que ser un objeto."];
  const errors: string[] = [];

  switch (type) {
    case "output":
    case "multiple_choice": {
      if (type === "output" && typeof content.code !== "string") errors.push("Falta el código.");
      const { options } = content;
      if (!isTextList(options) || options.length < 2) {
        errors.push("Tiene que tener al menos 2 opciones, sin opciones vacías.");
      } else if (hasRepeats(options)) {
        errors.push("Hay opciones repetidas.");
      } else if (!isIndex(answer.correct, options.length)) {
        errors.push("La respuesta correcta no es ninguna de las opciones.");
      }
      break;
    }

    case "fill_blank": {
      const { code, blanks } = content;
      if (typeof code !== "string") {
        errors.push("Falta el código.");
        break;
      }
      if (!Array.isArray(blanks) || !blanks.every((b) => isTextList(b) && b.length >= 2 && !hasRepeats(b))) {
        errors.push("Cada hueco tiene que tener al menos 2 opciones distintas.");
        break;
      }
      const holes = code.split("___").length - 1;
      if (holes !== blanks.length) {
        errors.push(`El código tiene ${holes} huecos, pero hay opciones para ${blanks.length}.`);
      }
      const { correct } = answer;
      if (
        !Array.isArray(correct) ||
        correct.length !== blanks.length ||
        !correct.every((c, i) => isIndex(c, blanks[i]!.length))
      ) {
        errors.push("Falta la respuesta correcta de algún hueco, o no es una de sus opciones.");
      }
      break;
    }

    case "order_lines": {
      const { lines } = content;
      if (!isTextList(lines) || lines.length < 2) {
        errors.push("Tiene que tener al menos 2 líneas, sin líneas vacías.");
        break;
      }
      const { order } = answer;
      const isPermutation =
        Array.isArray(order) &&
        order.length === lines.length &&
        new Set(order).size === lines.length &&
        order.every((i) => isIndex(i, lines.length));
      if (!isPermutation) {
        errors.push("El orden correcto tiene que incluir cada línea una sola vez.");
      }
      break;
    }

    default:
      errors.push(`Tipo de juego desconocido: ${type}.`);
  }

  if (answer.output !== undefined) {
    if (type !== "fill_blank" && type !== "order_lines") {
      errors.push("Solo Completá el hueco y Ordená las líneas llevan la salida (output).");
    } else if (typeof answer.output !== "string" || answer.output.length === 0) {
      errors.push("La salida (output) tiene que ser un texto.");
    }
  }

  return errors;
}