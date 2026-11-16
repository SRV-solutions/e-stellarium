import type { AdminShopItem } from "../types";

// Los nombres de los valores de la economía (las claves de settings en la API) y cómo se agrupan en la
// pantalla del panel. Los números no están acá: vienen de la API.

// Un número escrito (texto, para que se pueda borrar mientras se tipea): entero o null
export function parseInteger(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
}

export type SettingUnit = "xp" | "glints" | "percent" | "days" | "count" | "weekday" | "hour" | "questions";

export const SETTING_NAMES: Record<string, { name: string; unit: SettingUnit }> = {
  "xp.question_correct": { name: "Acertar una pregunta", unit: "xp" },
  "xp.star_completed": { name: "Encender una estrella", unit: "xp" },
  "xp.exam_passed": { name: "Aprobar el examen", unit: "xp" },
  "xp.review_correct": { name: "Acertar en el repaso", unit: "xp" },
  "xp.review_completed": { name: "Terminar el repaso", unit: "xp" },
  "glints.review_completed": { name: "Terminar el repaso", unit: "glints" },
  "xp.challenge_correct": { name: "Acertar en el desafío", unit: "xp" },
  "glints.challenge_correct": { name: "Acertar en el desafío", unit: "glints" },
  "xp.challenge_completed": { name: "Terminar el desafío", unit: "xp" },
  "glints.challenge_completed": { name: "Terminar el desafío", unit: "glints" },
  "glints.badge_7": { name: "Cometa fugaz", unit: "glints" },
  "glints.badge_30": { name: "Cometa periódico", unit: "glints" },
  "glints.badge_100": { name: "Gran cometa", unit: "glints" },
  "streak.free_freezes": { name: "Protectores gratis por mes", unit: "count" },
  "shop.freezes_per_month": { name: "Protectores comprados por mes", unit: "count" },
  "coupon.first_percent": { name: "El primer cupón", unit: "percent" },
  "coupon.later_percent": { name: "Los cupones siguientes", unit: "percent" },
  "coupon.valid_days": { name: "Los cupones vencen a los", unit: "days" },
  // Los desafíos (pantalla Desafíos)
  "challenge.day_mon": { name: "Sale los lunes", unit: "weekday" },
  "challenge.day_tue": { name: "Sale los martes", unit: "weekday" },
  "challenge.day_wed": { name: "Sale los miércoles", unit: "weekday" },
  "challenge.day_thu": { name: "Sale los jueves", unit: "weekday" },
  "challenge.day_fri": { name: "Sale los viernes", unit: "weekday" },
  "challenge.day_sat": { name: "Sale los sábados", unit: "weekday" },
  "challenge.day_sun": { name: "Sale los domingos", unit: "weekday" },
  "challenge.hour": { name: "Hora de salida", unit: "hour" },
  "challenge.own_easy": { name: "Sus cursos, fáciles", unit: "questions" },
  "challenge.own_medium": { name: "Sus cursos, medias", unit: "questions" },
  "challenge.own_hard": { name: "Sus cursos, difíciles", unit: "questions" },
  "challenge.own_review": { name: "De repaso", unit: "questions" },
  "challenge.explore_easy": { name: "Explorá, fáciles", unit: "questions" },
  "challenge.explore_medium": { name: "Explorá, medias", unit: "questions" },
  "challenge.explore_hard": { name: "Explorá, difíciles", unit: "questions" },
  "challenge.discover_easy": { name: "Descubrí, fáciles", unit: "questions" },
  "challenge.discover_medium": { name: "Descubrí, medias", unit: "questions" },
  "challenge.discover_hard": { name: "Descubrí, difíciles", unit: "questions" },
};

// La tabla "Lo que da cada cosa": cada actividad con su XP y sus destellos (null = no da),
// o un solo valor (one) para lo que no es ni XP ni destellos
export type LedgerRow = { name: string; detail?: string; xp?: string | null; glints?: string | null; one?: string };

export const LEDGER: { group: string; note?: string; rows: LedgerRow[] }[] = [
  {
    group: "Estrellas y examen",
    note: "No dan destellos: ya dan XP y el cupón",
    rows: [
      { name: "Acertar una pregunta", detail: "Solo la primera vez", xp: "xp.question_correct", glints: null },
      { name: "Encender una estrella", detail: "Cuando acertó todas sus preguntas", xp: "xp.star_completed", glints: null },
      { name: "Aprobar el examen", detail: "7 de 10; además le da el cupón", xp: "xp.exam_passed", glints: null },
    ],
  },
  {
    group: "Repaso del día",
    note: "Hasta 5 preguntas",
    rows: [
      { name: "Acertar una", xp: "xp.review_correct", glints: null },
      { name: "Terminarlo", xp: "xp.review_completed", glints: "glints.review_completed" },
    ],
  },
  {
    group: "Desafíos",
    note: "Lunes y sábados, 10 preguntas",
    rows: [
      { name: "Acertar una", xp: "xp.challenge_correct", glints: "glints.challenge_correct" },
      { name: "Terminarlo", xp: "xp.challenge_completed", glints: "glints.challenge_completed" },
    ],
  },
  {
    group: "Insignias de racha",
    note: "Una sola vez cada una",
    rows: [
      { name: "Cometa fugaz", detail: "7 días seguidos", xp: null, glints: "glints.badge_7" },
      { name: "Cometa periódico", detail: "30 días seguidos", xp: null, glints: "glints.badge_30" },
      { name: "Gran cometa", detail: "100 días seguidos", xp: null, glints: "glints.badge_100" },
    ],
  },
  {
    group: "Racha",
    rows: [
      {
        name: "Protectores gratis por mes",
        detail: "Cubren un día que no jugó; se recargan el 1°",
        one: "streak.free_freezes",
      },
    ],
  },
  {
    group: "Cupones del examen",
    note: "Ningún cupón pasa del 60 %",
    rows: [
      { name: "El primer cupón", detail: "El primer examen que aprueba", one: "coupon.first_percent" },
      { name: "Los siguientes", one: "coupon.later_percent" },
      { name: "Vencen a los", detail: "También los de la tienda", one: "coupon.valid_days" },
    ],
  },
];

// "50 XP", "20 destellos", "60 %", "60 días", "2"
export function formatSetting(key: string, value: unknown): string {
  const unit = SETTING_NAMES[key]?.unit;
  const n = typeof value === "number" ? value.toLocaleString("es-AR") : String(value);
  if (unit === "xp") return `${n} XP`;
  if (unit === "glints") return `${n} destellos`;
  if (unit === "percent") return `${n} %`;
  if (unit === "days") return `${n} días`;
  if (unit === "weekday") return value ? "Sí" : "No";
  if (unit === "hour") return `${String(value).padStart(2, "0")}:00`;
  if (unit === "questions") return value === 1 ? "1 pregunta" : `${n} preguntas`;
  return n;
}

// Los campos de un ítem de la tienda, como los guarda la bitácora
export const ITEM_FIELD_NAMES: Record<string, string> = {
  name: "Nombre",
  note: "Nota",
  price: "Precio",
  percent: "Porcentaje",
  hex: "Color",
  altName: "Otra forma",
  active: "Estado",
};

export function formatItemField(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "price") return `${Number(value).toLocaleString("es-AR")} destellos`;
  if (field === "percent") return `${value} %`;
  if (field === "active") return value ? "A la venta" : "Retirado";
  return String(value);
}

// Los grupos de la tienda en el panel
export const SHOP_GROUPS: {
  kind: AdminShopItem["kind"];
  title: string;
  note: string;
  add?: string;
  lock?: string;
}[] = [
  {
    kind: "coupon",
    title: "Cupones",
    note: "Uno por semana, del lunes al lunes. Vencen a los días que diga “Cupones del examen”.",
    add: "Agregar un cupón",
  },
  { kind: "streak_freeze", title: "Protectores de racha", note: "Se gastan después de los gratis del mes." },
  {
    kind: "frame",
    title: "Marcos del avatar",
    note: "Cada marco tiene su dibujo en la app.",
    lock: "Un marco nuevo necesita su dibujo: se suma desde el código. Acá se editan el nombre, la nota y el precio.",
  },
  {
    kind: "color",
    title: "Colores del trazo",
    note: "El color de la línea encendida de las constelaciones.",
    add: "Agregar un color",
  },
  { kind: "title", title: "Títulos", note: "Debajo del alias en el ranking. Pueden tener dos formas.", add: "Agregar un título" },
];
