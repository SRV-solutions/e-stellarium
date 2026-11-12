// Los colores del trazo de las constelaciones que se compran en la tienda. Son los mismos `hex` de
// COSMETICS en api/src/games/cosmetics.ts: si cambian allá, se cambian acá
const TRAIL_COLORS: Record<string, string> = {
  blue: "#4fa3ff", // el de siempre, gratis
  aurora: "#3fe0a2",
  nebula: "#b9a6ff",
  corona: "#ffc94a",
};

// El color que lleva puesto (vacío = el azul). Se guarda en la variable --trail de toda la página,
// (el final del degradé de la línea encendida en StarMap) y en --trail-line (los tramos de CourseLine)
export function applyTrail(wornColor: string | null) {
  const id = wornColor && TRAIL_COLORS[wornColor] ? wornColor : "blue";
  const root = document.documentElement.style;
  root.setProperty("--trail", TRAIL_COLORS[id]!);
  // Las líneas finas del inicio: con el azul quedan casi blancas, como siempre; con otro, en su color
  root.setProperty("--trail-line", id === "blue" ? "rgba(220, 232, 255, 0.8)" : TRAIL_COLORS[id]!);
}
