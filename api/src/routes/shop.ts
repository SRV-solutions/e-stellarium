import { Router } from "express";
import { requireAuth } from "../middlewares/requireAuth.js";
import { HttpError } from "../lib/errors.js";
import { buy, isShopItem, shopView } from "../games/shop.js";

export const shopRouter = Router();

// La tienda: el saldo de destellos y, para cada cosa, el precio y si se puede comprar
shopRouter.get("/shop", requireAuth, async (req, res) => {
  res.json(await shopView(req.user!));
});

// Compra algo. El navegador solo dice qué: el precio y los límites los pone la API
shopRouter.post("/shop/purchases", requireAuth, async (req, res) => {
  const item = req.body?.item;
  if (!isShopItem(item)) throw new HttpError(400, "No existe eso en la tienda.");
  res.status(201).json(await buy(req.user!.id, item));
});
