import { Router } from "express";
import { sequelize } from "../db.js";
import { User } from "../models/index.js";
import { userIdFromUnsubscribeToken } from "../lib/unsubscribe.js";

export const unsubscribeRouter = Router();

// La página que se ve al tocar el link del mail: texto simple, sin scripts ni recursos de afuera
function page(status: number, title: string, text: string) {
  return {
    status,
    html: `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · E-Stellarium</title></head>
<body style="margin:0;background:#0b1020;color:#e8ecf7;font-family:Georgia,serif">
<main style="max-width:30rem;margin:12vh auto;padding:0 1.5rem">
<h1 style="font-size:1.5rem;font-weight:600">${title}</h1><p style="line-height:1.6">${text}</p></main></body></html>`,
  };
}

// Desactiva el mail de desafíos con un clic, sin iniciar sesión: el token firmado dice quién es.
// Es idempotente (tocarlo dos veces da lo mismo) y solo toca esa preferencia.
unsubscribeRouter.get("/unsubscribe", async (req, res) => {
  const userId = userIdFromUnsubscribeToken(req.query.token);
  const result = !userId
    ? page(400, "El link no sirve", "Está incompleto o cambió. Podés desactivar los mails desde tu perfil en E-Stellarium.")
    : await sequelize.transaction(async (t) => {
        const user = await User.findByPk(userId, { lock: t.LOCK.UPDATE, transaction: t });
        if (user && user.notifyEmail) await user.update({ notifyEmail: false }, { transaction: t });
        return page(
          200,
          "Listo, no te mandamos más estos mails",
          "Dejaste de recibir los mails de desafíos. Los avisos dentro de la app siguen igual, y si cambiás de idea podés volver a activarlos desde tu perfil."
        );
      });
  res.status(result.status).type("html").send(result.html);
});
