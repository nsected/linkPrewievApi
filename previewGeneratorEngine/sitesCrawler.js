import got from "got";
import { StringDecoder } from "node:string_decoder";
import { debug, info, warn, verbose } from "../utils/debugHandler.js";
import { isFileUrl } from "../utils/helpers.js";

const DEBUG_LEVEL = process.env.DEBUG_LEVEL || "debug";

/**
 * Кравлер HTML страниц с тремя режимами:
 *  - fastmode: true → потоковый head-only fetch
 *  - fastmode: false → частичная загрузка до первых тегов <h1> / <p>
 *  - fastmode: false + DEBUG_LEVEL=verbose → полная загрузка
 */
export async function fetchHtml(url, { fastmode = true } = {}) {
    info(`🌐 [fetchHtml] Fetching HTML for: ${url} (fastmode=${fastmode}, debugLevel=${DEBUG_LEVEL})`);

    if (isFileUrl(url)) {
        debug(`📁 File URL detected — skipping HTML fetch.`);
        return { type: "file", url };
    }

    // =============================
    // ⚡ FASTMODE → <head> only
    // =============================
    if (fastmode) {
        return streamUntil(url, /<\/head>/i, "⚡ Fastmode: extracted <head>");
    }

    // =============================
    // 🐢 EXTENDED MODE → <h1> or <p>
    // =============================
    // ⚙️ ENHANCED: only load partial body (up to ~100 KB or first text paragraph)
    if (DEBUG_LEVEL !== "verbose") {
        debug("🐢 Extended fetch mode: up to <h1>/<p> with text...");

        const htmlResult = await streamUntil(
            url,
            /<h1[\s>]|<p[\s>]/i,
            "📄 Extended: got header or first paragraph"
        );

        if (htmlResult.html.length < 300_000) {
            return { type: "html", url, ...htmlResult, fastmode: false };
        } else {
            warn("⚠️ Extended mode limit reached (~100 KB). Stopping stream.");
            return { type: "partial", url, ...htmlResult, fastmode: false };
        }
    }

    // =============================
    // 🧠 VERBOSE DEBUG → FULL FETCH
    // =============================
    // ⚙️ ENHANCED: full fetch only in verbose mode
    verbose("🧠 Full fetch mode (verbose debug): downloading entire page...");
    try {
        const html = await got(url, {
            headers: getHeaders(),
            timeout: { request: 15000 },
            retry: { limit: 2 },
            followRedirect: true,
            maxRedirects: 10,
        }).text();

        verbose(`✅ Full HTML fetched (${html.length} chars)`);
        return { type: "html", html, url, fastmode: false };
    } catch (err) {
        error(`❌ Full fetch error: ${err.message}`);
        return { type: "error", url, error: err.message };
    }
}

/**
 * ⚙️ ENHANCED: вспомогательная функция потокового чтения до первого совпадения
 */
function streamUntil(url, pattern, label) {
    return new Promise((resolve, reject) => {
        const decoder = new StringDecoder("utf8");
        let buffer = "";
        let found = false;

        const stream = got.stream(url, {
            headers: getHeaders(),
            timeout: { request: 10000 },
            retry: { limit: 2 },
            followRedirect: true,
            maxRedirects: 10,
        });

        stream.on("data", chunk => {
            if (found) return;

            buffer += decoder.write(chunk);

            // если нашли паттерн (например </head> или <p>)
            if (pattern.test(buffer)) {
                found = true;
                stream.destroy();
                debug(`${label} (${buffer.length} chars)`);
                resolve({ type: "html", html: buffer });
            }

            // ограничение по размеру
            if (buffer.length > 300_000 && !found) {
                found = true;
                stream.destroy();
                warn(`⚠️ Stopping early at ~100 KB before finding ${pattern}`);
                resolve({ type: "partial", html: buffer });
            }
        });

        stream.on("error", err => {
            reject({ type: "error", url, error: err.message });
        });

        stream.on("end", () => {
            if (!found) {
                warn(`⚠️ Stream ended before finding ${pattern}. Returning partial content.`);
                resolve({ type: "partial", html: buffer });
            }
        });
    });
}

/**
 * Общие HTTP-заголовки для имитации браузера
 */
function getHeaders() {
    return {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "referer": "https://www.google.com/",
        "upgrade-insecure-requests": "1",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
    };
}
