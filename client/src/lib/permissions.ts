import type { Permission, RoleKey, User } from "../types";

// Los permisos los decide la API (GET /me trae los del rol). Acá solo se usan para mostrar u ocultar:
// cada endpoint de staff vuelve a preguntar con requirePermission.
export const can = (user: User | null, permission: Permission) => !!user?.permissions.includes(permission);

// Las secciones del panel y qué permiso abre cada una. Se suman a medida que existan.
export const ADMIN_SECTIONS: { to: string; label: string; permissions: Permission[] }[] = [
  { to: "/admin/audit", label: "Bitácora", permissions: ["audit:view", "integrity:view"] },
];

export const adminSectionsFor = (user: User | null) =>
  ADMIN_SECTIONS.filter((section) => section.permissions.some((p) => can(user, p)));

export const ROLE_NAMES: Record<RoleKey, string> = {
  student: "Alumno",
  teacher: "Docente",
  admin: "Admin",
  super_admin: "Super admin",
};

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
};
