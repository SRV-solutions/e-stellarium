import "dotenv/config";
import express from "express";
import cookieParser from "cookie-parser";
import { sequelize } from "./db.js";
import { authRouter } from "./routes/auth.js";

const app = express();
app.disable("x-powered-by");
const port = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(cookieParser());
app.use(authRouter);

app.get("/health", async (_req, res) => {
    try {
        await sequelize.authenticate();
        res.json({ status: "ok", db: "ok" });
    } catch {
        res.status(503).json({ status: "error", db: "sin conexión" });
    }
});

app.listen(port, () => {
    console.log(`API E-Stellarium escuchando en http://localhost:${port}`);
});

