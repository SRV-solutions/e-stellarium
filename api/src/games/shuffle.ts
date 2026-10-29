import { createHash } from "node:crypto";

// Genera números entre 0 y 1 que parecen al azar, pero son siempre los mismos para la misma semilla
function seededRandom(seed: string) {
  let state = createHash("sha256").update(seed).digest().readUInt32LE(0);
  return () => {
    // mulberry32: un generador chico y conocido
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Devuelve los índices 0..n-1 mezclados. order[i] = qué elemento original se muestra en el lugar i
export function permutation(seed: string, n: number): number[] {
  const random = seededRandom(seed);
  const order = Array.from({ length: n }, (_, i) => i);
  // Fisher-Yates: recorre de atrás para adelante e intercambia cada lugar con uno anterior al azar
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const tmp = order[i]!;
    order[i] = order[j]!;
    order[j] = tmp;
  }
  return order;
}