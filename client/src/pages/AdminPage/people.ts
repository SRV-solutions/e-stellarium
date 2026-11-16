import { PERMISSION_NAMES, ROLE_NAMES } from "../../lib/permissions";
import type { Person, RoleInfo, RoleKey } from "../../types";

// Textos de la lista de personas y de la ficha

const TIME_ZONE = "America/Argentina/Buenos_Aires";
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: TIME_ZONE });

// "Hoy", "Ayer", "Hace 9 días", "Nunca jugó" (lastActiveOn es un día de Argentina, "2026-11-10")
export function lastPlayed(day: string | null) {
  if (!day) return "Nunca jugó";
  const days = Math.round((Date.parse(today()) - Date.parse(day)) / 86_400_000);
  if (days <= 0) return "Hoy";
  if (days === 1) return "Ayer";
  return `Hace ${days} días`;
}

export const streakNote = (person: Person) => (person.streak > 0 ? `racha de ${person.streak}` : null);

// "3 de noviembre"
export const dayMonth = (iso: string) =>
  new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: TIME_ZONE });

// "Master en Python" → "Python": en la regla de cursos y en la ficha entra mejor
export const shortName = (name: string) => name.replace(/^(Master en|Curso de|Curso)\s+/i, "");

export const firstName = (name: string) => name.trim().split(/\s+/)[0];

// Qué puede hacer cada rol, en una línea que sale de sus permisos de hoy
export function roleSummary(key: RoleKey, roles: RoleInfo[]) {
  if (key === "student") return "Juega; no entra al panel";
  if (key === "super_admin") return "Todo, y no se puede editar";
  const permissions = roles.find((r) => r.key === key)?.permissions ?? [];
  if (permissions.length === 0) return "Entra al panel sin permisos";
  const names = permissions.map((p) => PERMISSION_NAMES[p].toLowerCase());
  const text = names.length > 3 ? `${names.slice(0, 2).join(", ")} y ${names.length - 2} más` : names.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}

export const ROLE_ORDER: RoleKey[] = ["student", "teacher", "admin", "super_admin"];
export { ROLE_NAMES };
