import type { Request, Response, NextFunction } from "express";
import { can, type Permission } from "../lib/permissions.js";

// Con uno cualquiera alcanza (por ejemplo, ver el contenido: quien lo edita o quien lo aprueba)
export function requireAnyPermission(...permissions: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    for (const permission of permissions) {
      if (req.user && (await can(req.user, permission))) return next();
    }
    return res.status(403).json({ error: "No tenés permiso para hacer esto." });
  };
}

// Va después de requireAuth: router.get("/admin/...", requireAuth, requirePermission("audit:view"), ...)
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !(await can(req.user, permission))) {
      return res.status(403).json({ error: "No tenés permiso para hacer esto." });
    }
    next();
  };
}
