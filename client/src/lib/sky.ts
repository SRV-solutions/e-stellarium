const ORDINALS = [
  "Primera", "Segunda", "Tercera", "Cuarta", "Quinta", "Sexta", "Séptima", "Octava",
  "Novena", "Décima", "Undécima", "Duodécima",
];

// "Segunda estrella" para la posición 1 (desde 0). Después de la 12.ª, "Estrella 13"
export function ordinal(index: number) {
  return ORDINALS[index] ? `${ORDINALS[index]} estrella` : `Estrella ${index + 1}`;
}