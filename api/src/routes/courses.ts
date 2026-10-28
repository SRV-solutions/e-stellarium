import { Router } from "express";
import { Enrollment, Product } from "../models/index.js";
import { requireAuth } from "../middlewares/requireAuth.js";

export const coursesRouter = Router();

coursesRouter.get("/courses", requireAuth, async (req, res) => {
  const enrollments = await Enrollment.findAll({
    where: { userId: req.user!.id, status: "active" },
    include: [{ model: Product, where: { active: true } }],
    order: [["purchasedAt", "ASC"]],
  });

  const courses = enrollments.map((e) => ({
    key: e.Product!.key,
    name: e.Product!.name,
    driveUrl: e.Product!.driveUrl,
    purchasedAt: e.purchasedAt,
  }));

  res.json({ courses });
});