// sitesCrawler.js
import got from "got";
import { StringDecoder } from "node:string_decoder";
import { isFileUrl } from "../utils/helpers.js";
import { appLog } from "../utils/logger.js"; // подключаем новый модуль логирования

const MAX_BUFFER = 10000000;
const P_TEXT_THRESHOLD = 50;
const H1_THRESHOLD = 20;

function getHeaders() {
    return {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "referer": "https://www.google.com/",
        "upgrade-insecure-requests": "1",
        "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    };
}

/**
 * fetchHtml(url, { fastmode = true })
 */
export async function fetchHtml(url, { fastmode = true } = {}) {
    const DEBUG_LEVEL = process.env.DEBUG_LEVEL || "info";
    const verboseMode = DEBUG_LEVEL === "verbose";
    const debugMode = DEBUG_LEVEL === "debug" || verboseMode;

    await appLog.info({
        namespace: "crawler1234",
        message: `🌐 [fetchHtml] ${url} (fastmode=${fastmode}, verbose=${verboseMode})`,
        taskUrl: url,
        taskParams: { fastmode, DEBUG_LEVEL },
    });

    if (isFileUrl(url)) {
        await appLog.debug({
            namespace: "crawler",
            taskUrl: url,
            message: "📁 File URL detected — skipping HTML fetch",
            level: "debug",
        });
        return { type: "file", url, fetchModeUsed: "file", stopReason: "file" };
    }

    // --- FULL FETCH: only in verbose mode ---
    if (verboseMode) {
        await appLog.debug({
            namespace: "crawler",
            taskUrl: url,
            message: "🧠 Verbose mode: performing full page fetch (no early stop)",
        });

        try {
            const html = await got(url, {
                headers: getHeaders(),
                timeout: { request: 20000 },
                retry: { limit: 2 },
                followRedirect: true,
                maxRedirects: 10,
            }).text();

            await appLog.debug({
                namespace: "crawler",
                taskUrl: url,
                message: `✅ Full HTML fetched (${html.length} chars)`,
                payload: html,
            });

            return {
                type: "html",
                html,
                url,
                fastmode,
                fetchModeUsed: "full",
                stopReason: "full",
            };
        } catch (err) {
            await appLog.error({
                namespace: "crawler",
                taskUrl: url,
                message: `❌ Full fetch failed: ${err.message}`,
                extra: { stack: err.stack },
            });
            return {
                type: "error",
                url,
                error: err.message,
                fetchModeUsed: "full",
                stopReason: "error",
            };
        }
    }

    // --- STREAMED FETCH ---
    return new Promise((resolve, reject) => {
        const decoder = new StringDecoder("utf8");
        let buffer = "";
        let found = false;
        let streamClosed = false;
        let chunkCount = 0;

        const stream = got.stream(url, {
            headers: getHeaders(),
            timeout: { request: 10000 },
            retry: { limit: 2 },
            followRedirect: true,
            maxRedirects: 10,
        });

        const reHeadClose = /<\/head>/i;
        const reMetaDesc =
            /<meta\s+(?:name|property)=["'](?:description|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/i;
        const rePMeaningful = new RegExp(
            `<p[^>]*>[^<]{${P_TEXT_THRESHOLD},}<\/p>`,
            "i"
        );
        const reH1Meaningful = new RegExp(
            `<h1[^>]*>[^<]{${H1_THRESHOLD},}<\/h1>`,
            "i"
        );

        function extractJsonLdSnippet(buf) {
            const idxOpen = buf.lastIndexOf("<script");
            if (idxOpen === -1) return null;
            const part = buf.slice(idxOpen);
            const m = part.match(
                /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
            );
            if (m && m[1]) {
                try {
                    return JSON.parse(m[1]);
                } catch {
                    return null;
                }
            }
            return null;
        }

        stream.on("data", async (chunk) => {
            if (found) return;
            buffer += decoder.write(chunk);
            chunkCount++;

            if (debugMode && chunkCount % 10 === 0) {
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: `📦 Received ${chunkCount} chunks (${buffer.length} chars so far)`,
                    payload: buffer,
                });
            }

            // Fastmode: stop at </head>
            if (fastmode && reHeadClose.test(buffer)) {
                found = true;
                stream.destroy();
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: "⚡ Fastmode stop: </head> found",
                    payload: buffer,
                });
                return resolve({
                    type: "html",
                    html: buffer,
                    url,
                    fastmode,
                    fetchModeUsed: "fast",
                    stopReason: "</head>",
                });
            }

            // Optimized mode (fastmode = false)
            const metaMatch = buffer.match(reMetaDesc);
            if (metaMatch) {
                found = true;
                stream.destroy();
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: "🧩 Optimized stop: meta description found",
                    payload: buffer,
                    extra: { description: metaMatch[1] },
                });
                return resolve({
                    type: "html",
                    html: buffer,
                    url,
                    fastmode,
                    fetchModeUsed: "optimized",
                    stopReason: "meta-description",
                    metaDescription: metaMatch[1],
                });
            }

            const jsonLd = extractJsonLdSnippet(buffer);
            if (jsonLd) {
                try {
                    const arr = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
                    for (const item of arr) {
                        if (item?.description || item?.headline) {
                            found = true;
                            stream.destroy();
                            await appLog.debug({
                                namespace: "crawler",
                                taskUrl: url,
                                message:
                                    "🧩 Optimized stop: JSON-LD with description/headline found",
                                payload: buffer,
                                extra: { jsonLd: item },
                            });
                            return resolve({
                                type: "html",
                                html: buffer,
                                url,
                                fastmode,
                                fetchModeUsed: "optimized",
                                stopReason: "json-ld",
                            });
                        }
                    }
                } catch (_) {}
            }

            if (rePMeaningful.test(buffer) || reH1Meaningful.test(buffer)) {
                found = true;
                stream.destroy();
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: "🧩 Optimized stop: meaningful <p> or <h1> found",
                    payload: buffer,
                });
                return resolve({
                    type: "html",
                    html: buffer,
                    url,
                    fastmode,
                    fetchModeUsed: "optimized",
                    stopReason: "meaningful-text",
                });
            }

            if (buffer.length > MAX_BUFFER) {
                found = true;
                stream.destroy();
                await appLog.warn({
                    namespace: "crawler",
                    taskUrl: url,
                    message: `⚠️ Optimized fetch limit reached (${buffer.length} chars)`,
                    payload: buffer,
                });
                return resolve({
                    type: "partial",
                    html: buffer,
                    url,
                    fastmode,
                    fetchModeUsed: "optimized",
                    stopReason: "size-limit",
                });
            }
        });

        stream.on("error", async (err) => {
            if (streamClosed) return;
            streamClosed = true;
            await appLog.error({
                namespace: "crawler",
                taskUrl: url,
                message: `❌ Stream error: ${err.message}`,
                payload: buffer,
                extra: { stack: err.stack },
            });
            reject({
                type: "error",
                url,
                error: err.message,
                fetchModeUsed: fastmode ? "fast" : "optimized",
                stopReason: "stream-error",
            });
        });

        stream.on("end", async () => {
            if (streamClosed) return;
            streamClosed = true;
            await appLog.debug({
                namespace: "crawler",
                taskUrl: url,
                message: `🔚 Stream ended, returning accumulated HTML (${buffer.length} chars, ${chunkCount} chunks)`,
                payload: buffer,
            });
            resolve({
                type: "html",
                html: buffer,
                url,
                fastmode,
                fetchModeUsed: "optimized",
                stopReason: "stream-end",
            });
        });
    });
}
