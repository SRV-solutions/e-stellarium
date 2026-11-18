import type { Permission, RoleKey, User } from "../types";

// Los permisos los decide la API (GET /me trae los del rol). Acá solo se usan para mostrar u ocultar:
// cada endpoint de staff vuelve a preguntar con requirePermission.
export const can = (user: User | null, permission: Permission) => !!user?.permissions.includes(permission);

// Las secciones del panel y qué permiso abre cada una. Se suman a medida que existan.
export const ADMIN_SECTIONS: { to: string; label: string; permissions: Permission[] }[] = [
  { to: "/admin/audit", label: "Bitácora", permissions: ["audit:view", "integrity:view"] },
  { to: "/admin/people", label: "Personas", permissions: ["roles:manage"] },
  { to: "/admin/roles", label: "Roles", permissions: ["roles:manage"] },
  { to: "/admin/content", label: "Contenido", permissions: ["content:edit", "content:approve"] },
  { to: "/admin/economy", label: "Economía", permissions: ["economy:edit"] },
  { to: "/admin/students", label: "Alumnos", permissions: ["students:view"] },
  { to: "/admin/coupons", label: "Cupones", permissions: ["coupons:manage"] },
  { to: "/admin/challenges", label: "Desafíos", permissions: ["challenges:manage"] },
  { to: "/admin/ranking", label: "Ranking", permissions: ["ranking:view"] },
];

export const adminSectionsFor = (user: User | null) =>
  ADMIN_SECTIONS.filter((section) => section.permissions.some((p) => can(user, p)));

export const ROLE_NAMES: Record<RoleKey, string> = {
  student: "Alumno",
  teacher: "Docente",
  admin: "Admin",
  super_admin: "Super admin",
};

// Los permisos agrupados, con una línea de qué permite cada uno (la tabla de Roles)
export const PERMISSION_GROUPS: { name: string; items: { key: Permission; detail: string }[] }[] = [
  {
    name: "Contenido",
    items: [
      { key: "content:edit", detail: "Juegos y preguntas; quedan en revisión" },
      { key: "content:approve", detail: "Aprobar, rechazar o despublicar" },
    ],
  },
  {
    name: "Alumnos",
    items: [
      { key: "students:view", detail: "Su progreso en las constelaciones" },
      { key: "users:manage", detail: "Altas manuales, asignar y sacar cursos" },
      { key: "coupons:manage", detail: "Emitir y anular cupones a mano" },
    ],
  },
  {
    name: "Economía y desafíos",
    items: [
      { key: "economy:edit", detail: "XP, destellos, precios y lo que se vende" },
      { key: "challenges:manage", detail: "La receta, los días y la hora" },
    ],
  },
  {
    name: "Ranking",
    items: [
      { key: "ranking:view", detail: "Ver las tablas con nombres y emails" },
      { key: "ranking:award", detail: "Premiar con destellos o cupones" },
      { key: "ranking:reset", detail: "Cerrar la temporada" },
    ],
  },
  {
    name: "Control",
    items: [
      { key: "audit:view", detail: "Todo lo que cambió el staff" },
      { key: "audit:revert", detail: "Deshacer cambios desde la bitácora" },
      { key: "integrity:view", detail: "Ver y correr la verificación" },
      { key: "roles:manage", detail: "Roles, permisos y bajas" },
    ],
  },
];

export const PERMISSION_NAMES: Record<Permission, string> = {
  "content:edit": "Crear y editar contenido",
  "content:approve": "Aprobar contenido",
  "students:view": "Ver alumnos",
  "challenges:manage": "Desafíos",
  "economy:edit": "Economía y tienda",
  "users:manage": "Altas y cursos",
  "coupons:manage": "Cupones",
  "audit:view": "Ver la bitácora",
  "audit:revert": "Revertir",
  "integrity:view": "Integridad",
  "roles:manage": "Roles y bajas",
  "ranking:view": "Ver el ranking",
  "ranking:award": "Premiar en el ranking",
  "ranking:reset": "Cerrar temporada",
};
