import express from "express";

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json());

app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
});

app.listen(port, () => {
    console.log(`API E-Stellarium escuchando en http://localhost:${port}`);
});