import type { TrailEffect } from "../types";

// El azul de siempre: el trazo de quien no compró otro color (o mientras carga la sesión)
const DEFAULT_TRAIL = "#4fa3ff";

// El color del trazo que lleva puesto (wornColorHex: lo manda la API, sale de la tienda). Se guarda en la
// variable --trail de toda la página (el final del degradé de la línea encendida en StarMap) y en
// --trail-line (los tramos de CourseLine)
export function applyTrail(hex: string | null, effect: TrailEffect | null = null) {
  const color = hex ?? DEFAULT_TRAIL;
  const root = document.documentElement.style;
  root.setProperty("--trail", color);
  // Las líneas finas del inicio: con el azul quedan casi blancas, como siempre; con otro, en su color
  // El efecto va como atributo de la página: los estilos de StarMap y CourseLine lo leen (no hay estado que pasar)
  if (effect) document.documentElement.dataset.trailEffect = effect;
  else delete document.documentElement.dataset.trailEffect;
  root.setProperty("--trail-line", color === DEFAULT_TRAIL ? "rgba(220, 232, 255, 0.8)" : color);
}
