// La racha: funciones puras, sin base de datos. Los días son textos "2026-11-10" en hora de Argentina.

export const FREEZES_PER_MONTH = 2;
const TIME_ZONE = "America/Argentina/Buenos_Aires";

// El día de Argentina en ese momento. El día corta a las 00:00 de Argentina
export function argentinaDay(now: Date = new Date()): string {
  // en-CA escribe las fechas como "2026-11-10"
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthOf(day: string) {
  return day.slice(0, 7); // "2026-11"
}

export type StreakState = {
  streak: number;
  lastActiveOn: string | null;
  streakFreezes: number; // los protectores que le quedan en el mes de lastActiveOn
  boughtFreezes: number; // los comprados en la tienda: no vencen
};

// Cubre con protectores los días que faltó entre lastActiveOn y `today` (sin contar `today`).
// Cada mes trae 2 protectores nuevos; primero se usan esos y después los comprados.
// Si un día no alcanza, la racha se corta y vuelve a 0, y los comprados no se gastan.
// Devuelve la racha, los protectores que le quedan en el mes de `today` y los comprados.
export function settle(state: StreakState, today: string) {
  if (!state.lastActiveOn) return { streak: 0, freezes: FREEZES_PER_MONTH, bought: state.boughtFreezes };

  let { streak, streakFreezes: freezes, boughtFreezes: bought } = state;
  let month = monthOf(state.lastActiveOn);

  for (let day = addDays(state.lastActiveOn, 1); day < today && streak > 0; day = addDays(day, 1)) {
    if (monthOf(day) !== month) {
      month = monthOf(day);
      freezes = FREEZES_PER_MONTH;
    }
    if (freezes > 0) freezes--;
    else if (bought > 0) bought--;
    else streak = 0;
  }

  // Si igual se cortó, no tiene sentido cobrarle los comprados
  if (streak === 0) bought = state.boughtFreezes;
  if (monthOf(today) !== month) freezes = FREEZES_PER_MONTH;
  return { streak, freezes, bought };
}

// La primera actividad del día: la racha suma uno (o arranca en 1 si se había cortado)
export function registerDay(state: StreakState, today: string): StreakState {
  if (state.lastActiveOn === today) return state;
  const { streak, freezes, bought } = settle(state, today);
  return { streak: streak + 1, lastActiveOn: today, streakFreezes: freezes, boughtFreezes: bought };
}

// Lo que se muestra, sin escribir nada. Si todavía no jugó hoy, la racha sigue viva hasta las 00:00
export function currentStreak(state: StreakState, today: string) {
  const { streak, freezes, bought } = settle(state, today);
  return { streak, freezes, boughtFreezes: bought, activeToday: state.lastActiveOn === today };
}
