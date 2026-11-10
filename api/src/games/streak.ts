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
};

// Cubre con protectores los días que faltó entre lastActiveOn y `today` (sin contar `today`).
// Cada mes trae 2 protectores nuevos. Si un día no alcanza, la racha se corta y vuelve a 0.
// Devuelve la racha y los protectores que le quedan en el mes de `today`.
export function settle(state: StreakState, today: string) {
  if (!state.lastActiveOn) return { streak: 0, freezes: FREEZES_PER_MONTH };

  let { streak, streakFreezes: freezes } = state;
  let month = monthOf(state.lastActiveOn);

  for (let day = addDays(state.lastActiveOn, 1); day < today && streak > 0; day = addDays(day, 1)) {
    if (monthOf(day) !== month) {
      month = monthOf(day);
      freezes = FREEZES_PER_MONTH;
    }
    if (freezes > 0) freezes--;
    else streak = 0;
  }

  if (monthOf(today) !== month) freezes = FREEZES_PER_MONTH;
  return { streak, freezes };
}

// La primera actividad del día: la racha suma uno (o arranca en 1 si se había cortado)
export function registerDay(state: StreakState, today: string): StreakState {
  if (state.lastActiveOn === today) return state;
  const { streak, freezes } = settle(state, today);
  return { streak: streak + 1, lastActiveOn: today, streakFreezes: freezes };
}

// Lo que se muestra, sin escribir nada. Si todavía no jugó hoy, la racha sigue viva hasta las 00:00
export function currentStreak(state: StreakState, today: string) {
  const { streak, freezes } = settle(state, today);
  return { streak, freezes, activeToday: state.lastActiveOn === today };
}
