// middleware/singleFlightCache.js

/**
 * middleware с защитой от шторма и LRU-кешем.
 * @param {Function} handler - async (url) => Promise<any>
 * @param {Object} [options]
 * @param {number} [options.cacheSize=10] - количество элементов в LRU-кеше
 */
export function createSingleFlightCache(handler, { cacheSize = 10 } = {}) {
    const pending = new Map();
    const cache = new Map();


    function setCache(url, data) {
        if (cache.has(url)) cache.delete(url); // перемещаем в конец
        cache.set(url, data);
        if (cache.size > cacheSize) {
            const firstKey = cache.keys().next().value;
            cache.delete(firstKey);
        }
    }

    return async function singleFlightCacheMiddleware(req, res, next) {
        const { url } = req.query;

        if (!url) {
            return res.status(400).json({ error: "No URL provided" });
        }

        // 1️⃣ Проверка кеша
        if (cache.has(url)) {
            return res.json({ ...cache.get(url), _fromCache: true });
        }

        // 2️⃣ Проверка активного промиса
        if (pending.has(url)) {
            try {
                const data = await pending.get(url);
                return res.json({ ...data, _shared: true });
            } catch {
                return res.status(500).json({ error: "Parser error (shared)" });
            }
        }

        // 3️⃣ Запуск нового промиса
        const promise = (async () => {
            try {
                const data = await handler(url);
                setCache(url, data);
                return data;
            } finally {
                pending.delete(url);
            }
        })();

        pending.set(url, promise);

        try {
            const data = await promise;
            res.json(data);
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Parser error" });
        }
    };
}
