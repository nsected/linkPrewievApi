// middleware/singleFlightCache.js

/**
 * @module singleFlightCache
 * @description
 * Middleware с защитой от шторма и LRU-кешем.
 *
 * 🔹 Гарантирует, что для одного и того же URL одновременно выполняется только один асинхронный запрос.
 * 🔹 Повторные запросы ожидают результат первого (`single flight` паттерн).
 * 🔹 Сохраняет успешные результаты в LRU-кеше, ограниченном по размеру.
 *
 * @param {Function} handler - async (url) => Promise<any>
 * @param {Object} [options]
 * @param {number} [options.cacheSize=300] — Количество элементов, сохраняемых в LRU-кеше.
 * @returns {Function} — Express middleware, совместимое с `(req, res, next)`.
 */

import { appLog } from "../utils/logger.js";

export function createSingleFlightCache(handler, { cacheSize = 300 } = {}) {
    const pending = new Map();
    const cache = new Map();

    // создаем namespace-логгер
    const log = appLog.child({ namespace: "singleFlightCache" });

    async function printState() {
        const cacheKeys = Array.from(cache.keys());
        const pendingKeys = Array.from(pending.keys());

        await log.debug({
            message: `📦 Cache keys (${cacheKeys.length}/${cacheSize})`,
            extra: { keys: cacheKeys.length ? cacheKeys : "— empty —" },
        });
        await log.debug({
            message: `⏳ Pending keys (${pendingKeys.length})`,
            extra: { keys: pendingKeys.length ? pendingKeys : "— none —" },
        });
    }

    async function setCache(url, data) {
        await log.info({ taskUrl: url, message: `🟩 Set cache entry` });

        if (cache.has(url)) {
            await log.verbose({ taskUrl: url, message: `↪️ Updating existing cache entry` });
            cache.delete(url); // перемещаем в конец
        }
        cache.set(url, data);
        if (cache.size > cacheSize) {
            const firstKey = cache.keys().next().value;
            await log.warn({
                message: `🗑️ Cache limit exceeded (${cacheSize}), deleting oldest entry`,
                extra: { removed: firstKey },
            });
            cache.delete(firstKey);
        }

        await printState();
    }

    return async function singleFlightCacheMiddleware(req, res, next) {
        const { url } = req.query;

        if (!url) {
            await log.error({ message: "❌ No URL provided in request" });
            return res.status(400).json({ error: "No URL provided" });
        }

        await log.info({ taskUrl: url, message: "➡️ Incoming request" });
        await printState();

        // 1️⃣ Проверка кеша
        if (cache.has(url)) {
            await log.debug({ taskUrl: url, message: "✅ Cache hit" });
            await printState();
            return res.json({ ...cache.get(url), _fromCache: true });
        } else {
            await log.verbose({ taskUrl: url, message: "🔍 Cache miss" });
        }

        // 2️⃣ Проверка активного промиса
        if (pending.has(url)) {
            await log.info({ taskUrl: url, message: "🕒 Request already pending — waiting for result" });
            await printState();

            try {
                const data = await pending.get(url);
                await log.debug({ taskUrl: url, message: "✅ Shared result resolved" });
                await printState();
                return res.json({ ...data, _shared: true });
            } catch (err) {
                await log.error({
                    taskUrl: url,
                    message: "❌ Shared promise failed",
                    extra: { error: err.message },
                });
                await printState();
                return res.status(500).json({ error: "Parser error (shared)" });
            }
        }

        // 3️⃣ Запуск нового промиса
        await log.info({ taskUrl: url, message: "🚀 Starting new handler execution" });

        const promise = (async () => {
            try {
                const data = await handler(url);
                await log.info({ taskUrl: url, message: "✅ Handler completed" });
                await setCache(url, data);
                return data;
            } catch (err) {
                await log.error({
                    taskUrl: url,
                    message: "❌ Handler failed",
                    extra: { error: err.message },
                });
                throw err;
            } finally {
                pending.delete(url);
                await log.verbose({ taskUrl: url, message: "🧹 Removed pending entry" });
                await printState();
            }
        })();

        pending.set(url, promise);
        await log.debug({ taskUrl: url, message: "🕓 Added to pending" });
        await printState();

        try {
            const data = await promise;
            await log.debug({ taskUrl: url, message: "📤 Sending response" });
            await printState();
            res.json(data);
        } catch (err) {
            await log.error({
                taskUrl: url,
                message: "❌ Sending error response",
                extra: { error: err.message },
            });
            await printState();
            res.status(500).json({ error: "Parser error" });
        }
    };
}
