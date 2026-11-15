// El azul de siempre: el trazo de quien no compró otro color (o mientras carga la sesión)
const DEFAULT_TRAIL = "#4fa3ff";

// El color del trazo que lleva puesto (wornColorHex: lo manda la API, sale de la tienda). Se guarda en la
// variable --trail de toda la página (el final del degradé de la línea encendida en StarMap) y en
// --trail-line (los tramos de CourseLine)
export function applyTrail(hex: string | null) {
  const color = hex ?? DEFAULT_TRAIL;
  const root = document.documentElement.style;
  root.setProperty("--trail", color);
  // Las líneas finas del inicio: con el azul quedan casi blancas, como siempre; con otro, en su color
  root.setProperty("--trail-line", color === DEFAULT_TRAIL ? "rgba(220, 232, 255, 0.8)" : color);
}
