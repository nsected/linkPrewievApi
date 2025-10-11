import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import webRouter from "./routes/web.js";
import apiRouter from "./routes/api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// статические файлы (css, js, изображения)
app.use(express.static(path.join(__dirname, "public")));
// статические файлы (index.html)
app.use(express.static(path.join(__dirname, "views")));

// роуты
app.use("/", webRouter);
app.use("/api", apiRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

export default app;
