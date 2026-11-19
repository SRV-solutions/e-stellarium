import type { ThemeId } from "../types";

// Los temas de la app: cada uno es un bloque de variables en index.css ([data-theme="bordo"]...). Acá, lo que
// necesita el cliente para dibujar su muestra (los tres colores del fondo, las líneas y el brillo)
export const DEFAULT_THEME: ThemeId = "marino";

export const THEME_SWATCH: Record<ThemeId, { night: string; surface: string; line: string }> = {
  marino: { night: "#0a1735", surface: "#11214a", line: "#24376b" },
  bordo: { night: "#26091a", surface: "#3a1226", line: "#6e2b4b" },
  bosque: { night: "#0a2018", surface: "#113227", line: "#256049" },
  ciruela: { night: "#1a1038", surface: "#271a50", line: "#4c3a8c" },
  grafito: { night: "#16181d", surface: "#222530", line: "#434859" },
  cafe: { night: "#241710", surface: "#38241a", line: "#6b4a36" },
};

const KEY = "estellarium-theme";

// El tema que lleva puesto, en la raíz de la página. Se acuerda del último en este navegador para que, al abrir
// la app, no se vea un instante el Marino mientras carga la sesión
export function applyTheme(id: string | null) {
  const root = document.documentElement;
  if (id && id !== DEFAULT_THEME) root.dataset.theme = id;
  else delete root.dataset.theme;
  try {
    if (id && id !== DEFAULT_THEME) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // sin almacenamiento (ventana privada): no se acuerda, y listo
  }
}

export function restoreTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved in THEME_SWATCH) document.documentElement.dataset.theme = saved;
  } catch {
    // ídem
  }
}
