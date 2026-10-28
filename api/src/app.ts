import express from "express";
import cookieParser from "cookie-parser";
import { sequelize } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { provisionRouter } from "./routes/provision.js";
import { passwordRouter } from "./routes/password.js";
import { coursesRouter } from "./routes/courses.js";
import { errorHandler } from "./middlewares/errorHandler.js";

export const app = express();
app.disable("x-powered-by");

app.use(express.json());
app.use(cookieParser());

app.use(authRouter);
app.use(provisionRouter);
app.use(passwordRouter);
app.use(coursesRouter);

app.get("/health", async (_req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: "ok" });
  } catch {
    res.status(503).json({ status: "error", db: "sin conexión" });
  }
});

app.use(errorHandler);