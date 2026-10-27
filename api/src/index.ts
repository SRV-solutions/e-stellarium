import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { sequelize } from "./db.js";
import { authRouter } from "./routes/auth.js";
import { provisionRouter } from "./routes/provision.js";
import { errorHandler } from "./middlewares/errorHandler.js";

const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(cookieParser());
app.use(authRouter);
app.use(provisionRouter);

app.get("/health", async (_req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: "ok", db: "ok" });
    } catch {
        res.status(503).json({ status: "error", db: "sin conexión" });
    }
});

app.use(errorHandler);

app.listen(port, () => {
    console.log(`API E-Stellarium escuchando en http://localhost:${port}`);
});

