// Devuelve una función que genera numeros "aleatorios" entre 0 y 1,
// pero siempre la misma secuencia para la misma semilla
export function seededRandom(seed: number) {
    let s = seed;
    return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}