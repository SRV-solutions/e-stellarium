// Los niveles salen de la experiencia total. Pasar del nivel n al siguiente cuesta 100 × n XP,
// así que llegar al nivel n pide 50 × n × (n − 1): 0, 100, 300, 600, 1000...
// El primer nivel llega con la primera estrella; después cada uno pide un poco más. No hay techo.

const STEP = 100;

// El nombre de cada nivel. Desde el último, todos se llaman igual
const NAMES = [
  "Polvo estelar",
  "Primera luz",
  "Luna nueva",
  "Cuarto creciente",
  "Luna llena",
  "Órbita",
  "Cometa",
  "Nebulosa",
  "Constelación",
  "Galaxia",
  "Supernova",
  "Universo",
];

export type Level = {
  level: number; // desde 1
  name: string;
  xpIntoLevel: number; // lo que lleva dentro de este nivel
  xpForNext: number; // lo que cuesta este nivel entero
  xpToNext: number; // lo que le falta para el siguiente
  progress: number; // de 0 a 1, para la barra y el medidor
};

// La experiencia total que hace falta para llegar a un nivel
export function xpToReach(level: number) {
  return (STEP / 2) * level * (level - 1);
}

export function levelFor(totalXp: number): Level {
  const xp = Math.max(0, totalXp);
  // Es la inversa de xpToReach: la solución de 50·n·(n − 1) = xp, redondeada para abajo
  let level = Math.floor((1 + Math.sqrt(1 + (8 * xp) / STEP)) / 2);
  // Por si el redondeo de la raíz se pasa o se queda corto en el borde exacto de un nivel
  if (xpToReach(level + 1) <= xp) level += 1;
  if (xpToReach(level) > xp) level -= 1;

  const xpIntoLevel = xp - xpToReach(level);
  const xpForNext = STEP * level;
  return {
    level,
    name: NAMES[Math.min(level, NAMES.length) - 1]!,
    xpIntoLevel,
    xpForNext,
    xpToNext: xpForNext - xpIntoLevel,
    progress: xpIntoLevel / xpForNext,
  };
}
