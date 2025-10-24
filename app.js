import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";                 // ✅ импорт cors

import webRouter from "./routes/web.js";
import apiRouter from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3002;

const corsOptions = {
  origin: "https://tv.2ch.su",
  methods: ["GET", "OPTIONS", "POST"],
  allowedHeaders: ["Content-Type"],
};

// ✅ Разрешаем запросы только с нужного домена
app.use(cors(corsOptions));

// ✅ Обработка preflight-запросов (OPTIONS)
app.options("*", cors(corsOptions));

// статические файлы (css, js, изображения)
app.use(express.static(path.join(__dirname, "public")));

// статические файлы (index.html)
app.use(express.static(path.join(__dirname, "views")));

// роуты
app.use("/", webRouter);
app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

export default app;
