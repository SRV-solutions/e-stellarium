import type { Request, Response, NextFunction } from "express";
import { Enrollment, Product } from "../models/index.js";
import { permissionsOf } from "../lib/permissions.js";

// Va después de requireAuth, en lo que es de jugar (tienda, desafíos, repaso, constelaciones).
// El staff que no cursa nada no juega: recibe 403, igual que el cliente lo manda al panel.
// Un alumno pasa sin consultar nada más (sus cursos los filtra cada pantalla).
export async function requirePlayer(req: Request, res: Response, next: NextFunction) {
  const user = req.user!;
  if ((await permissionsOf(user)).length > 0) {
    const courses = await Enrollment.count({
      where: { userId: user.id, status: "active" },
      include: [{ model: Product, where: { active: true }, required: true }],
    });
    if (courses === 0) return res.status(403).json({ error: "Tu cuenta de staff no cursa nada: esto es para alumnos." });
  }
  next();
}
