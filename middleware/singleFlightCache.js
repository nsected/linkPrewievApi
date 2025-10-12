// middleware/singleFlightCache.js

/**
 * middleware с защитой от шторма и LRU-кешем.
 * Добавлены подробные отладочные сообщения и вывод состояния кеша и pending-запросов.
 * @param {Function} handler - async (url) => Promise<any>
 * @param {Object} [options]
 * @param {number} [options.cacheSize=10] - количество элементов в LRU-кеше
 */
export function createSingleFlightCache(handler, { cacheSize = 10 } = {}) {
    const pending = new Map();
    const cache = new Map();

    function debug(...args) {
        console.debug("[singleFlightCache]", ...args);
    }

    function printState() {
        const cacheKeys = Array.from(cache.keys());
        const pendingKeys = Array.from(pending.keys());
        debug(`📦 Cache keys (${cacheKeys.length}/${cacheSize}):`, cacheKeys.length ? cacheKeys : "— empty —");
        debug(`⏳ Pending keys (${pendingKeys.length}):`, pendingKeys.length ? pendingKeys : "— none —");
    }

    function setCache(url, data) {
        debug(`🟩 Set cache for URL: ${url}`);
        if (cache.has(url)) {
            debug(`↪️ Updating existing cache entry for: ${url}`);
            cache.delete(url); // перемещаем в конец
        }
        cache.set(url, data);
        if (cache.size > cacheSize) {
            const firstKey = cache.keys().next().value;
            debug(`🗑️ Cache limit exceeded (${cacheSize}), deleting oldest entry: ${firstKey}`);
            cache.delete(firstKey);
        }
        printState();
    }

    return async function singleFlightCacheMiddleware(req, res, next) {
        const { url } = req.query;

        if (!url) {
            debug("❌ No URL provided in request");
            return res.status(400).json({ error: "No URL provided" });
        }

        debug(`➡️ Incoming request for URL: ${url}`);
        printState();

        // 1️⃣ Проверка кеша
        if (cache.has(url)) {
            debug(`✅ Cache hit for: ${url}`);
            printState();
            return res.json({ ...cache.get(url), _fromCache: true });
        } else {
            debug(`🔍 Cache miss for: ${url}`);
        }

        // 2️⃣ Проверка активного промиса
        if (pending.has(url)) {
            debug(`🕒 Request already pending for: ${url} — waiting for result`);
            printState();
            try {
                const data = await pending.get(url);
                debug(`✅ Shared result resolved for: ${url}`);
                printState();
                return res.json({ ...data, _shared: true });
            } catch (err) {
                debug(`❌ Shared promise failed for: ${url}`, err);
                printState();
                return res.status(500).json({ error: "Parser error (shared)" });
            }
        }

        // 3️⃣ Запуск нового промиса
        debug(`🚀 Starting new handler execution for: ${url}`);

        const promise = (async () => {
            try {
                const data = await handler(url);
                debug(`✅ Handler completed for: ${url}`);
                setCache(url, data);
                return data;
            } catch (err) {
                debug(`❌ Handler failed for: ${url}`, err);
                throw err;
            } finally {
                pending.delete(url);
                debug(`🧹 Removed pending entry for: ${url}`);
                printState();
            }
        })();

        pending.set(url, promise);
        debug(`🕓 Added to pending: ${url}`);
        printState();

        try {
            const data = await promise;
            debug(`📤 Sending response for: ${url}`);
            printState();
            res.json(data);
        } catch (err) {
            debug(`❌ Sending error response for: ${url}`, err);
            printState();
            res.status(500).json({ error: "Parser error" });
        }
    };
}
