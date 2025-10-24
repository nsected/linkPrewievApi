// sitesCrawler.js
import got from "got";
import { StringDecoder } from "node:string_decoder"; // deprecated: kept for compatibility comment only
import { isFileUrl } from "../utils/helpers.js";
import { appLog } from "../utils/logger.js"; // подключаем новый модуль логирования
import iconv from "iconv-lite";
import chardet from "chardet";

const MAX_BUFFER = 10000000;
const P_TEXT_THRESHOLD = 50;
const H1_THRESHOLD = 20;
const TIMEOUT = 20000;

function getHeaders() {
    return {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "no-cache",
        "upgrade-insecure-requests": "1",
        "user-agent":
            "Mozilla/5.0 (compatible; LinkPreviewBot/1.0; +https://linkprewievapi.onrender.com/)",
    };
}

async function decodeBufferSmart(buffer, headers = {}) {
    // buffer: Buffer
    // headers: response headers if available

    // 1) try Content-Type header
    const ctHeader = (headers["content-type"] || headers["Content-Type"] || "").toString();
    let charset;
    const ctMatch = ctHeader.match(/charset=([^;,\s]+)/i);
    if (ctMatch && ctMatch[1]) {
        charset = ctMatch[1].trim().toLowerCase();
    }

    // 2) try <meta charset=...> or <meta http-equiv="Content-Type" content="...; charset=...">
    if (!charset) {
        try {
            // only look at the first chunk of bytes to avoid heavy decoding
            const headSlice = buffer.slice(0, 4096);
            // ascii safe for meta search
            const headAscii = headSlice.toString("ascii");
            const metaCharsetMatch = headAscii.match(/<meta[^>]*charset=["']?\s*([^"'>\s;]+)/i);
            if (metaCharsetMatch && metaCharsetMatch[1]) {
                charset = metaCharsetMatch[1].trim().toLowerCase();
            } else {
                const metaEquivMatch = headAscii.match(/<meta[^>]*content=["'][^"']*charset=([^"'>\s;]+)[^"']*["']/i);
                if (metaEquivMatch && metaEquivMatch[1]) {
                    charset = metaEquivMatch[1].trim().toLowerCase();
                }
            }
        } catch (_) {
            // ignore
        }
    }

    // 3) fallback to chardet (gives e.g. 'UTF-8', 'windows-1251', 'ISO-8859-5', 'KOI8-R' etc.)
    if (!charset) {
        try {
            const detected = chardet.detect(buffer);
            if (detected) charset = detected.toString().toLowerCase();
        } catch (_) {
            // ignore
        }
    }

    // default
    charset = (charset || "utf-8").toString().toLowerCase();

    // normalize common aliases
    const aliasMap = {
        "cp1251": "windows-1251",
        "win1251": "windows-1251",
        "windows1251": "windows-1251",
        "utf8": "utf-8",
        "latin1": "iso-8859-1",
        "iso8859-1": "iso-8859-1",
        "iso8859-5": "iso-8859-5",
    };
    if (aliasMap[charset]) charset = aliasMap[charset];

    // final fallback: if iconv doesn't know the encoding, treat as utf-8
    if (!iconv.encodingExists(charset)) {
        charset = "utf-8";
    }

    try {
        // decode using iconv-lite
        return iconv.decode(buffer, charset);
    } catch (e) {
        // if decode failed, fallback to utf8 with replacement to avoid throwing
        try {
            return buffer.toString("utf8");
        } catch (_) {
            // ultimate fallback: return empty string
            await appLog.error({
                namespace: "crawler",
                taskUrl: url,
                message: "HTMP page decode failed",
                level: "error",
                payload: buffer,
            });
            return "";
        }
    }
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
            const response = await got(url, {
                headers: getHeaders(),
                timeout: { request: TIMEOUT},
                retry: { limit: 2 },
                followRedirect: true,
                maxRedirects: 10,
                responseType: "buffer",
            });
            const html = await decodeBufferSmart(response.rawBody, response.headers);


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
        // deprecated: StringDecoder kept only as comment; do NOT use to decode non-utf8 pages
        const decoder = new StringDecoder("utf8"); // deprecated: not used for decoding now
        let chunks = []; // collect Buffers only
        let found = false;
        let streamClosed = false;
        let chunkCount = 0;

        const stream = got.stream(url, {
            headers: getHeaders(),
            timeout: { request: TIMEOUT },
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

        function extractJsonLdSnippet(decodedStr) {
            const idxOpen = decodedStr.lastIndexOf("<script");
            if (idxOpen === -1) return null;
            const part = decodedStr.slice(idxOpen);
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
            // deprecated: using StringDecoder directly
            // buffer += decoder.write(chunk);
            chunks.push(chunk);
            chunkCount++;

            // Build a small prefix for fast ASCII checks (avoid full concat often)
            const prefixLen = Math.min(8192, chunks.reduce((s, b) => s + b.length, 0));
            // For performance we can concat only when needed; but here we will create fullBuffer when checks require it.
            // Quick ASCII scan for </head> using slice of accumulated bytes:
            const accumulatedBuffer = Buffer.concat(chunks);
            const asciiPrefix = accumulatedBuffer.slice(0, 4096).toString("ascii");

            if (debugMode && chunkCount % 10 === 0) {
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: `📦 Received ${chunkCount} chunks (${accumulatedBuffer.length} bytes so far)`,
                    payload: asciiPrefix.slice(0, 1000),
                });
            }

            // Fastmode: stop at </head> (ASCII scan is safe for tag detection)
            if (fastmode && reHeadClose.test(asciiPrefix)) {
                found = true;
                stream.destroy();
                try {
                    const fullBuffer = accumulatedBuffer; // already Buffer.concat result
                    const decoded = await decodeBufferSmart(fullBuffer, stream.response?.headers || {});
                    await appLog.debug({
                        namespace: "crawler",
                        taskUrl: url,
                        message: "⚡ Fastmode stop: </head> found",
                        payload: decoded.slice(0, 1000),
                    });
                    return resolve({
                        type: "html",
                        html: decoded,
                        url,
                        fastmode,
                        fetchModeUsed: "fast",
                        stopReason: "</head>",
                    });
                } catch (e) {
                    await appLog.warn({
                        namespace: "crawler",
                        taskUrl: url,
                        message: `⚠️ Fastmode decode failed: ${e.message}`,
                        extra: { stack: e.stack },
                    });
                    // fallback: return asciiPrefix as best-effort
                    return resolve({
                        type: "html",
                        html: asciiPrefix,
                        url,
                        fastmode,
                        fetchModeUsed: "fast",
                        stopReason: "</head>",
                    });
                }
            }

            // For optimized checks we need a decoded string to search meta/JSON-LD/p/h1 reliably.
            // Decode current accumulated buffer (costly but necessary for correctness)
            let decodedStr;
            try {
                const fullBuffer = accumulatedBuffer;
                decodedStr = await decodeBufferSmart(fullBuffer, stream.response?.headers || {});
            } catch (e) {
                decodedStr = null;
            }

            if (decodedStr) {
                // meta-description
                const metaMatch = decodedStr.match(reMetaDesc);
                if (metaMatch) {
                    found = true;
                    stream.destroy();
                    await appLog.debug({
                        namespace: "crawler",
                        taskUrl: url,
                        message: "🧩 Optimized stop: meta description found",
                        payload: decodedStr,
                        extra: { description: metaMatch[1] },
                    });
                    return resolve({
                        type: "html",
                        html: decodedStr,
                        url,
                        fastmode,
                        fetchModeUsed: "optimized",
                        stopReason: "meta-description",
                        metaDescription: metaMatch[1],
                    });
                }

                // JSON-LD
                const jsonLd = extractJsonLdSnippet(decodedStr);
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
                                    message: "🧩 Optimized stop: JSON-LD with description/headline found",
                                    payload: decodedStr,
                                    extra: { jsonLd: item },
                                });
                                return resolve({
                                    type: "html",
                                    html: decodedStr,
                                    url,
                                    fastmode,
                                    fetchModeUsed: "optimized",
                                    stopReason: "json-ld",
                                });
                            }
                        }
                    } catch (_) { /* ignore JSON-LD parse issues */ }
                }

                // meaningful <p> or <h1>
                if (rePMeaningful.test(decodedStr) || reH1Meaningful.test(decodedStr)) {
                    found = true;
                    stream.destroy();
                    await appLog.debug({
                        namespace: "crawler",
                        taskUrl: url,
                        message: "🧩 Optimized stop: meaningful <p> or <h1> found",
                        payload: decodedStr,
                    });
                    return resolve({
                        type: "html",
                        html: decodedStr,
                        url,
                        fastmode,
                        fetchModeUsed: "optimized",
                        stopReason: "meaningful-text",
                    });
                }
            }

            // size limit (we can test by accumulatedBuffer length)
            const accumulatedLength = accumulatedBuffer.length;
            if (accumulatedLength > MAX_BUFFER) {
                found = true;
                stream.destroy();
                try {
                    const fullBuffer = accumulatedBuffer;
                    const decoded = await decodeBufferSmart(fullBuffer, stream.response?.headers || {});
                    await appLog.warn({
                        namespace: "crawler",
                        taskUrl: url,
                        message: `⚠️ Optimized fetch limit reached (${fullBuffer.length} bytes)`,
                        payload: decoded.slice(0, 1000),
                    });
                    return resolve({
                        type: "partial",
                        html: decoded,
                        url,
                        fastmode,
                        fetchModeUsed: "optimized",
                        stopReason: "size-limit",
                    });
                } catch (e) {
                    await appLog.warn({
                        namespace: "crawler",
                        taskUrl: url,
                        message: `⚠️ Size-limit decode failed: ${e.message}`,
                        extra: { stack: e.stack },
                    });
                    return resolve({
                        type: "partial",
                        html: accumulatedBuffer.toString("utf8"),
                        url,
                        fastmode,
                        fetchModeUsed: "optimized",
                        stopReason: "size-limit",
                    });
                }
            }
        });

        stream.on("error", async (err) => {
            if (streamClosed) return;
            streamClosed = true;
            await appLog.error({
                namespace: "crawler",
                taskUrl: url,
                message: `❌ Stream error: ${err.message}, raw binary: `,
                payload: err,
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
            const fullBuffer = Buffer.concat(chunks);
            try {
                const decoded = await decodeBufferSmart(fullBuffer, stream.response?.headers || {});
                await appLog.debug({
                    namespace: "crawler",
                    taskUrl: url,
                    message: `🔚 Stream ended, returning accumulated HTML (${decoded.length} chars, ${chunkCount} chunks)`,
                    payload: decoded,
                });
                resolve({
                    type: "html",
                    html: decoded,
                    url,
                    fastmode,
                    fetchModeUsed: "optimized",
                    stopReason: "stream-end",
                });
            } catch (e) {
                await appLog.warn({
                    namespace: "crawler",
                    taskUrl: url,
                    message: `⚠️ Final decode failed: ${e.message}, returning raw utf8 string fallback`,
                    extra: { stack: e.stack },
                });
                resolve({
                    type: "html",
                    html: fullBuffer.toString("utf8"),
                    url,
                    fastmode,
                    fetchModeUsed: "optimized",
                    stopReason: "stream-end",
                });
            }
        });
    });
}
