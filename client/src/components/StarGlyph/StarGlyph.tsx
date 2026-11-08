import styles from "./StarGlyph.module.css";

// apagada: todavía no la encendió. encendida: ya la encendió. apuntada: la próxima que le toca
export type GlyphState = "off" | "lit" | "aim";

type Props = {
  x: number;
  y: number;
  state: GlyphState;
  scale?: number; // más chica cuando hay muchas estrellas juntas
  pop?: boolean; // un rebote al encenderse
};

// Una estrella dibujada: halo, destellos en cruz, núcleo y un aro. Según el estado se ven unas partes u otras.
// Va adentro de un <svg>, que tiene que incluir una vez <StarGlyphDefs />
export function StarGlyph({ x, y, state, scale = 1, pop = false }: Props) {
  const aim = state === "aim";
  const cls = [styles.star, state === "lit" ? styles.lit : "", aim ? styles.aim : "", pop ? styles.pop : ""].join(" ");

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className={cls}>
        <circle className={styles.halo} r={aim ? 28 : 24} fill={`url(#${aim ? HALO_BLUE : HALO_WHITE})`} />
        <path className={styles.flare} d="M0 -20 L2 -2 L20 0 L2 2 L0 20 L-2 2 L-20 0 L-2 -2 Z" />
        <path className={styles.flareSmall} d="M0 -12 L1.5 -1.5 L12 0 L1.5 1.5 L0 12 L-1.5 1.5 L-12 0 L-1.5 -1.5 Z" />
        <circle className={styles.ring} r={aim ? 12 : 9} />
        <circle className={styles.core} r={aim ? 6 : 4.5} />
      </g>
    </g>
  );
}

const HALO_WHITE = "star-glyph-halo";
const HALO_BLUE = "star-glyph-halo-aim";

// Los degradés de los halos. Si hay varios dibujos en la misma página, se repiten con el mismo id:
// son idénticos, así que da igual cuál use el navegador
export function StarGlyphDefs() {
  return (
    <defs>
      <radialGradient id={HALO_WHITE}>
        <stop offset="0" stopColor="#e6f0ff" stopOpacity="0.55" />
        <stop offset="0.35" stopColor="#7fb6ff" stopOpacity="0.18" />
        <stop offset="1" stopColor="#7fb6ff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id={HALO_BLUE}>
        <stop offset="0" stopColor="#2b92ff" stopOpacity="0.6" />
        <stop offset="0.45" stopColor="#007bff" stopOpacity="0.18" />
        <stop offset="1" stopColor="#007bff" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}
