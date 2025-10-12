import express from "express";
import { parseUrl } from "../services/linkParser.js";
import { createSingleFlightCache } from "../middleware/singleFlightCache.js";

const router = express.Router();

// middleware с кешем на 10 последних результатов
const parseMiddleware = createSingleFlightCache(parseUrl, { cacheSize: 300 });

router.get("/parse", parseMiddleware);

export default router;
