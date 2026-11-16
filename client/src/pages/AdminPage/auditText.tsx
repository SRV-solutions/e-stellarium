import type { ReactNode } from "react";
import { PERMISSION_NAMES, ROLE_NAMES } from "../../lib/permissions";
import { formatItemField, formatSetting, ITEM_FIELD_NAMES, SETTING_NAMES } from "../../lib/economy";
import type { AuditEntry, Permission, RoleKey } from "../../types";

// Cómo se cuenta cada registro de la bitácora en español. La API manda la acción y el antes y el
// después tal cual; acá se arma la frase ("le cambió el rol a ...") y el cambio (lo de antes tachado).

export const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "user.role_update", label: "Cambios de rol" },
  { value: "role.update", label: "Cambios de permisos" },
  { value: "user.delete", label: "Bajas" },
  { value: "user.restore", label: "Restauraciones" },
  { value: "economy.update", label: "Cambios en la economía" },
  { value: "shop.update", label: "Cambios en la tienda" },
  { value: "shop.create", label: "Agregados a la tienda" },
  { value: "content.approve", label: "Contenido aprobado" },
  { value: "content.reject", label: "Contenido rechazado" },
  { value: "content.unpublish", label: "Contenido despublicado" },
  { value: "content.republish", label: "Contenido publicado de nuevo" },
  { value: "teacher.courses_update", label: "Cursos de docentes" },
  { value: "user.create", label: "Altas manuales" },
  { value: "enrollment.grant", label: "Cursos dados" },
  { value: "enrollment.revoke", label: "Cursos sacados" },
  { value: "user.link_resent", label: "Links reenviados" },
  { value: "audit.revert", label: "Reversiones" },
  { value: "auth.login", label: "Inicios de sesión" },
  { value: "integrity.fail", label: "Fallas de integridad" },
];

type Values = Record<string, unknown> | null;

// Las preguntas: { status, version } (aprobar, despublicar...) y los cursos de un docente
const STATUS_NAMES: Record<string, string> = {
  published: "Publicada",
  draft: "Sin publicar",
  in_review: "En revisión",
  rejected: "Rechazada",
};
const isQuestionState = (v: Values) => !!v && typeof v.status === "string";
const coursesOf = (v: Values) => (Array.isArray(v?.courses) ? (v!.courses as string[]) : null);
function questionState(v: Values) {
  const name = STATUS_NAMES[v!.status as string] ?? String(v!.status);
  return typeof v!.version === "number" ? `${name} (v${v!.version})` : name;
}

const roleOf = (v: Values) => (v?.role as RoleKey | undefined) ?? null;
const permissionsOf = (v: Values) => (v?.permissions as Permission[] | undefined) ?? null;

// Quién: la persona, o la app si no tiene (un script como set-role, o la verificación diaria)
export function actorName(entry: AuditEntry) {
  if (entry.actor) return entry.actor.name;
  return entry.action === "integrity.fail" ? "La verificación diaria" : "Un script";
}

// "Agustín Fernández" -> "AF", para el avatar
export function initials(name: string) {
  const words = name.trim().split(/\s+/);
  return (words[0][0] + (words[1]?.[0] ?? words[0][1] ?? "")).toUpperCase();
}

// El nombre del elemento, o el comienzo de su id si ya no existe. Los valores de la economía no tienen id
export function targetName(entry: AuditEntry) {
  const target = entry.target!;
  if (target.type === "settings") return "la economía";
  return target.name ?? target.id.slice(0, 8);
}

// Los valores de la economía ("xp.star_completed") y los campos de un ítem de la tienda ("price")
const isSettings = (v: Values) => !!v && Object.keys(v).length > 0 && Object.keys(v).every((k) => k in SETTING_NAMES);
const isItemFields = (v: Values) =>
  !!v && Object.keys(v).length > 0 && Object.keys(v).every((k) => k in ITEM_FIELD_NAMES || k === "kind");

// La frase, con el nombre del elemento como botón (lo arma la pantalla, que sabe filtrar)
export function sentence(entry: AuditEntry, target: ReactNode): ReactNode {
  switch (entry.action) {
    case "auth.login":
      return "inició sesión";
    case "user.role_update":
      return <>le cambió el rol a {target}</>;
    case "role.update":
      return <>cambió los permisos del rol {target}</>;
    case "user.delete":
      return <>dio de baja a {target}</>;
    case "user.restore":
      return <>restauró a {target}</>;
    case "economy.update":
      return "cambió la economía";
    case "shop.update":
      return <>cambió {target} en la tienda</>;
    case "shop.create":
      return <>agregó {target} a la tienda</>;
    case "content.approve":
      return <>publicó la v{String(entry.after?.version)} de {target}</>;
    case "content.reject":
      return <>rechazó la v{String(entry.after?.version)} de {target}</>;
    case "content.unpublish":
      return <>despublicó {target}</>;
    case "content.republish":
      return <>volvió a publicar {target}</>;
    case "teacher.courses_update":
      return <>cambió los cursos que da {target}</>;
    case "user.create":
      return <>dio de alta a {target}</>;
    case "enrollment.grant":
      return <>le dio cursos a {target}</>;
    case "enrollment.revoke":
      return <>le sacó un curso a {target}</>;
    case "user.link_resent":
      return entry.after?.link === "reset_password" ? (
        <>le mandó a {target} un link para cambiar la contraseña</>
      ) : (
        <>le reenvió a {target} el link para crear la contraseña</>
      );
    case "audit.revert":
      return (
        <>
          revirtió el registro <b>#{entry.revertsId}</b>: {target} {revertResult(entry)}
        </>
      );
    case "integrity.fail": {
      const count = Number(entry.after?.problemCount ?? 0);
      return `encontró ${count} ${count === 1 ? "problema" : "problemas"} de integridad`;
    }
    default:
      return entry.action;
  }
}

// Cómo quedó lo revertido: la reversión guarda en "after" el valor al que volvió
function revertResult(entry: AuditEntry) {
  if (coursesOf(entry.after)) return "vuelve a sus cursos anteriores";
  if (isQuestionState(entry.after)) {
    const after = entry.after!;
    if (after.status === "in_review") return "vuelve a revisión";
    // Revertir una aprobación guarda cómo quedó la pregunta (con su versión, que puede ser ninguna)
    if ("version" in after) {
      return typeof after.version === "number"
        ? `vuelve a revisión, y los alumnos ven la v${after.version}`
        : "vuelve a revisión, y los alumnos dejan de verla";
    }
    return after.status === "published" ? "se ve de nuevo" : "deja de verse";
  }
  if (isSettings(entry.after)) return "vuelve a como estaba";
  if (isItemFields(entry.after)) {
    const keys = Object.keys(entry.after!);
    return keys.length === 1 && entry.after!.active === false ? "se retira de la tienda" : "vuelve a como estaba";
  }
  const role = roleOf(entry.after);
  if (role) return `vuelve a ser ${ROLE_NAMES[role]}`;
  if (permissionsOf(entry.after)) return "vuelve a sus permisos anteriores";
  return entry.after?.deletedAt === null ? "vuelve a estar activo" : "vuelve a quedar dado de baja";
}

// El cambio: de rol (antes -> ahora) o de permisos (+ agregados, − sacados)
export type Change =
  | { kind: "role"; was: string; now: string }
  | { kind: "permissions"; added: string[]; removed: string[] }
  | { kind: "values"; rows: { label: string; was: string | null; now: string }[] } // economía y tienda
  | null;

export function changeOf(entry: AuditEntry): Change {
  // Los cursos de un docente: + sumados, − sacados
  const coursesWas = coursesOf(entry.before);
  const coursesNow = coursesOf(entry.after);
  if (coursesWas && coursesNow) {
    return {
      kind: "permissions",
      added: coursesNow.filter((c) => !coursesWas.includes(c)),
      removed: coursesWas.filter((c) => !coursesNow.includes(c)),
    };
  }
  // Una pregunta: el estado (y la versión) de antes y de ahora; el rechazo, con su comentario
  if (isQuestionState(entry.after) && isQuestionState(entry.before)) {
    const rows: { label: string; was: string | null; now: string }[] = [
      { label: "Estado", was: questionState(entry.before), now: questionState(entry.after) },
    ];
    if (typeof entry.after!.comment === "string") rows.push({ label: "Comentario", was: null, now: entry.after!.comment });
    return { kind: "values", rows };
  }
  // Lo nuevo en la tienda: su precio (y el porcentaje o el color)
  if (entry.action === "shop.create" && entry.after) {
    const shown = ["price", "percent", "hex"].filter((f) => entry.after![f] !== null && entry.after![f] !== undefined);
    return {
      kind: "values",
      rows: shown.map((f) => ({ label: ITEM_FIELD_NAMES[f], was: null, now: formatItemField(f, entry.after![f]) })),
    };
  }
  if (isSettings(entry.after)) {
    return {
      kind: "values",
      rows: Object.keys(entry.after!).map((key) => ({
        label: SETTING_NAMES[key].name,
        was: entry.before?.[key] === undefined ? null : formatSetting(key, entry.before[key]),
        now: formatSetting(key, entry.after![key]),
      })),
    };
  }
  if (isItemFields(entry.after)) {
    return {
      kind: "values",
      rows: Object.keys(entry.after!).map((field) => ({
        label: ITEM_FIELD_NAMES[field],
        was: entry.before?.[field] === undefined ? null : formatItemField(field, entry.before[field]),
        now: formatItemField(field, entry.after![field]),
      })),
    };
  }

  const before = roleOf(entry.before);
  const after = roleOf(entry.after);
  if (before && after) return { kind: "role", was: ROLE_NAMES[before], now: ROLE_NAMES[after] };

  const was = permissionsOf(entry.before);
  const now = permissionsOf(entry.after);
  if (was && now) {
    return {
      kind: "permissions",
      added: now.filter((p) => !was.includes(p)).map((p) => PERMISSION_NAMES[p] ?? p),
      removed: was.filter((p) => !now.includes(p)).map((p) => PERMISSION_NAMES[p] ?? p),
    };
  }
  return null;
}

// Cada valor de un registro en palabras, para el diálogo de revertir: "Admin", "3 permisos", "Activo"
export function describeValue(value: Values): string {
  const courses = coursesOf(value);
  if (courses) return courses.length ? courses.join(", ") : "Ningún curso";
  if (isQuestionState(value)) return questionState(value);
  if (isSettings(value)) {
    return Object.entries(value!)
      .map(([key, v]) => `${SETTING_NAMES[key].name}: ${formatSetting(key, v)}`)
      .join(" · ");
  }
  if (isItemFields(value)) {
    return Object.entries(value!)
      .filter(([field]) => field !== "kind")
      .map(([field, v]) => `${ITEM_FIELD_NAMES[field]}: ${formatItemField(field, v)}`)
      .join(" · ");
  }
  const role = roleOf(value);
  if (role) return ROLE_NAMES[role];
  const permissions = permissionsOf(value);
  if (permissions) return `${permissions.length} ${permissions.length === 1 ? "permiso" : "permisos"}`;
  if (value && "deletedAt" in value) return value.deletedAt ? "Dado de baja" : "Activo";
  return "—";
}

// Qué pasa si se revierte, en una frase: el elemento vuelve a su "antes"
export function revertOutcome(entry: AuditEntry): string {
  const name = targetName(entry);
  if (entry.action === "economy.update") return `Los valores vuelven a como estaban: ${describeValue(entry.before)}.`;
  if (entry.action === "shop.create") return `${name} se retira de la tienda (quien lo compró lo sigue teniendo).`;
  if (entry.action === "shop.update") return `${name} vuelve a como estaba: ${describeValue(entry.before)}.`;
  if (entry.action === "teacher.courses_update") return `${name} vuelve a dar: ${describeValue(entry.before)}.`;
  if (entry.action === "enrollment.grant" || entry.action === "enrollment.revoke") {
    return `${name} vuelve a tener: ${describeValue(entry.before)}. Su avance no se borra, y no le mandamos ningún mail.`;
  }
  if (entry.action === "content.approve") {
    const back = typeof entry.before?.version === "number" ? `los alumnos vuelven a ver la v${entry.before.version}` : "los alumnos dejan de verla";
    return `La v${String(entry.after?.version)} vuelve a revisión y ${back}. No se puede si alguien ya la jugó.`;
  }
  if (entry.action === "content.reject") return `La v${String(entry.after?.version)} vuelve a esperar revisión.`;
  if (entry.action === "content.unpublish") return "La pregunta se vuelve a ver.";
  if (entry.action === "content.republish") return "La pregunta deja de verse.";
  const role = roleOf(entry.before);
  if (role) return `${name} vuelve a ser ${ROLE_NAMES[role]}.`;
  if (permissionsOf(entry.before)) return `El rol ${name} vuelve a los permisos que tenía.`;
  return entry.action === "user.delete" ? `${name} vuelve a estar activo.` : `${name} vuelve a quedar dado de baja.`;
}
