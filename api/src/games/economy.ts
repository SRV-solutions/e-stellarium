import type { Transaction } from "sequelize";
import { Setting } from "../models/index.js";

// Los números de la economía: cuánta XP y cuántos destellos da cada cosa, los cupones del examen y los
// protectores. Viven en la tabla settings (los edita el staff desde el panel, sin deploy); acá está qué
// claves existen y entre qué números puede ir cada una. Una clave nueva = sumarla acá y en una migración.
export const SETTINGS = {
  "xp.question_correct": { min: 0, max: 500 },
  "xp.star_completed": { min: 0, max: 500 },
  "xp.exam_passed": { min: 0, max: 1000 },
  "xp.review_correct": { min: 0, max: 500 },
  "xp.review_completed": { min: 0, max: 500 },
  "xp.challenge_correct": { min: 0, max: 500 },
  "xp.challenge_completed": { min: 0, max: 500 },
  "glints.review_completed": { min: 0, max: 1000 },
  "glints.challenge_correct": { min: 0, max: 1000 },
  "glints.challenge_completed": { min: 0, max: 1000 },
  "glints.badge_7": { min: 0, max: 5000 },
  "glints.badge_30": { min: 0, max: 5000 },
  "glints.badge_100": { min: 0, max: 5000 },
  "streak.free_freezes": { min: 0, max: 10 },
  "shop.freezes_per_month": { min: 0, max: 10 },
  "coupon.first_percent": { min: 1, max: 60 }, // ningún cupón pasa del 60 %
  "coupon.later_percent": { min: 1, max: 60 },
  "coupon.valid_days": { min: 1, max: 365 },
} as const;

export type SettingKey = keyof typeof SETTINGS;
export type Settings = Record<SettingKey, number>;
export const SETTING_KEYS = Object.keys(SETTINGS) as SettingKey[];

export function isSettingKey(key: unknown): key is SettingKey {
  return typeof key === "string" && Object.hasOwn(SETTINGS, key);
}

// Los días de racha de cada insignia: fijos, porque cada una tiene su nombre y su dibujo
export const BADGE_DAYS = [7, 30, 100] as const;

// Lee todos los valores. Son pocas filas: se leen en cada pedido, sin caché (con varias instancias
// de la API, un caché podría quedar viejo después de un cambio)
export async function loadSettings(t?: Transaction): Promise<Settings> {
  const rows = await Setting.findAll({ transaction: t });
  const values = Object.fromEntries(rows.map((r) => [r.id, r.value]));
  const missing = SETTING_KEYS.filter((k) => typeof values[k] !== "number");
  if (missing.length) throw new Error(`Faltan valores en settings: ${missing.join(", ")}`);
  return values as Settings;
}

// Los valores con la forma que usa el resto del código (y que recibe el cliente en GET /economy)
export function economyOf(s: Settings) {
  return {
    xp: {
      questionCorrect: s["xp.question_correct"],
      starCompleted: s["xp.star_completed"],
      examPassed: s["xp.exam_passed"],
      reviewCorrect: s["xp.review_correct"],
      reviewCompleted: s["xp.review_completed"],
      challengeCorrect: s["xp.challenge_correct"],
      challengeCompleted: s["xp.challenge_completed"],
    },
    glints: {
      reviewCompleted: s["glints.review_completed"],
      challengeCorrect: s["glints.challenge_correct"],
      challengeCompleted: s["glints.challenge_completed"],
    },
    badges: [
      { days: 7, glints: s["glints.badge_7"] },
      { days: 30, glints: s["glints.badge_30"] },
      { days: 100, glints: s["glints.badge_100"] },
    ],
    coupons: {
      firstPercent: s["coupon.first_percent"],
      laterPercent: s["coupon.later_percent"],
      validDays: s["coupon.valid_days"],
    },
    freezes: {
      freePerMonth: s["streak.free_freezes"],
      boughtPerMonth: s["shop.freezes_per_month"],
    },
  };
}

export type Economy = ReturnType<typeof economyOf>;

export async function loadEconomy(t?: Transaction): Promise<Economy> {
  return economyOf(await loadSettings(t));
}
