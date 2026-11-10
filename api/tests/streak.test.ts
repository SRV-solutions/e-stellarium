import { describe, expect, it } from "vitest";
import { addDays, argentinaDay, currentStreak, registerDay } from "../src/games/streak.js";

describe("el día de Argentina", () => {
  it("corta a las 00:00 de Argentina, no a las 00:00 UTC", () => {
    // 02:59 UTC del 10 es 23:59 del 9 en Argentina
    expect(argentinaDay(new Date("2026-11-10T02:59:00Z"))).toBe("2026-11-09");
    expect(argentinaDay(new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-10");
  });

  it("suma días cruzando meses y años", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("la racha", () => {
  const state = (streak: number, lastActiveOn: string | null, streakFreezes = 2) => ({
    streak,
    lastActiveOn,
    streakFreezes,
  });

  it("arranca en 1 el primer día", () => {
    expect(registerDay(state(0, null), "2026-11-10")).toEqual(state(1, "2026-11-10", 2));
  });

  it("suma uno si jugó ayer, y no cambia si ya jugó hoy", () => {
    expect(registerDay(state(4, "2026-11-09"), "2026-11-10")).toEqual(state(5, "2026-11-10", 2));
    expect(registerDay(state(5, "2026-11-10", 1), "2026-11-10")).toEqual(state(5, "2026-11-10", 1));
  });

  it("gasta un protector por cada día que faltó", () => {
    expect(registerDay(state(4, "2026-11-08"), "2026-11-10")).toEqual(state(5, "2026-11-10", 1));
    expect(registerDay(state(4, "2026-11-07"), "2026-11-10")).toEqual(state(5, "2026-11-10", 0));
  });

  it("vuelve a 1 si los protectores no alcanzan", () => {
    expect(registerDay(state(4, "2026-11-06"), "2026-11-10")).toEqual(state(1, "2026-11-10", 0));
    expect(registerDay(state(4, "2026-11-08", 0), "2026-11-10")).toEqual(state(1, "2026-11-10", 0));
  });

  it("cada mes trae 2 protectores nuevos", () => {
    // Le quedaba 0 en octubre: el 31 no tiene protector y la racha se corta
    expect(registerDay(state(4, "2026-10-30", 0), "2026-11-02")).toEqual(state(1, "2026-11-02", 2));
    // Le quedaba 1 en octubre: cubre el 31 con el de octubre y el 1 con uno de noviembre
    expect(registerDay(state(4, "2026-10-30", 1), "2026-11-02")).toEqual(state(5, "2026-11-02", 1));
    // Volver en un mes nuevo, sin haber faltado, también recarga
    expect(registerDay(state(4, "2026-10-31", 0), "2026-11-01")).toEqual(state(5, "2026-11-01", 2));
  });

  it("al leer, muestra 0 si se cortó y la racha viva si todavía no jugó hoy", () => {
    expect(currentStreak(state(4, "2026-11-09"), "2026-11-10")).toEqual({ streak: 4, freezes: 2, activeToday: false });
    expect(currentStreak(state(4, "2026-11-10"), "2026-11-10")).toEqual({ streak: 4, freezes: 2, activeToday: true });
    expect(currentStreak(state(4, "2026-11-08"), "2026-11-10")).toEqual({ streak: 4, freezes: 1, activeToday: false });
    expect(currentStreak(state(4, "2026-11-01"), "2026-11-10")).toEqual({ streak: 0, freezes: 0, activeToday: false });
  });
});
