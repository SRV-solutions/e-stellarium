import express from "express";
import cookieParser from "cookie-parser";
import { sequelize } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { provisionRouter } from "./routes/provision.js";
import { passwordRouter } from "./routes/password.js";
import { coursesRouter } from "./routes/courses.js";
import { starsRouter } from "./routes/stars.js";
import { questionsRouter } from "./routes/questions.js";
import { constellationsRouter } from "./routes/constellations.js";
import { examsRouter } from "./routes/exams.js";
import { couponsRouter } from "./routes/coupons.js";
import { reviewRouter } from "./routes/review.js";
import { meRouter } from "./routes/me.js";
import { challengesRouter } from "./routes/challenges.js";
import { shopRouter } from "./routes/shop.js";
import { adminRouter } from "./routes/admin.js";
import { runDailyCheckIfDue } from "./lib/integrity.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export const app = express();
app.disable("x-powered-by");
// Entre el navegador y la API hay tres saltos (Netlify y dos de Railway). Con 3, req.ip es la IP del
// navegador, para la bitácora. Con 2 daba la de Netlify (54.232.x.x, Amazon São Paulo)
app.set("trust proxy", 3);

app.use(express.json());
app.use(cookieParser());

// La verificación de integridad diaria arranca con el primer pedido del día (en segundo plano).
// En los tests no: correría en medio de otros tests
if (process.env.NODE_ENV !== "test") {
  app.use((_req, _res, next) => {
    runDailyCheckIfDue();
    next();
  });
}

app.use(authRouter);
app.use(provisionRouter);
app.use(passwordRouter);
app.use(coursesRouter);
app.use(starsRouter);
app.use(questionsRouter);
app.use(constellationsRouter);
app.use(examsRouter);
app.use(couponsRouter);
app.use(reviewRouter);
app.use(meRouter);
app.use(challengesRouter);
app.use(shopRouter);
app.use(adminRouter);

app.get("/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "sin conexión" });
  }
});

app.use(errorHandler);