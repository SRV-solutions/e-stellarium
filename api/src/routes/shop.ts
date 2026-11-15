import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { buy, isItemId, shopView } from "../games/shop.js";
import { loadEconomy } from "../games/economy.js";

export const shopRouter = Router();

// La tienda: el saldo de destellos y, para cada cosa, el precio y si se puede comprar
shopRouter.get("/shop", requireAuth, async (req, res) => {
  res.json(await shopView(req.user!));
});

// Compra algo. El navegador solo dice qué: el precio y los límites los pone la API
shopRouter.post("/shop/purchases", requireAuth, async (req, res) => {
  const item = req.body?.item;
  if (!isItemId(item)) throw new HttpError(400, "No existe eso en la tienda.");
  res.status(201).json(await buy(req.user!.id, item));
});

// Cuánta XP y cuántos destellos da cada cosa, para mostrarlo ("hasta 40 destellos"). Los números
// están en settings: el cliente no los repite
shopRouter.get("/economy", requireAuth, async (_req, res) => {
  const { xp, glints, badges, freezes } = await loadEconomy();
  res.json({ xp, glints, badges, freezes });
});
