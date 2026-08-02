// getImage.js
import got from "got";
import * as cheerio from "cheerio";
import { debug } from "../utils/debugHandler.js";
import { extractDomain } from "../utils/helpers.js";
import { appLog } from "../utils/logger.js";
//import tls from "tls";

/**
 * @module getImage
 * @description
 * Возвращает изображение предпросмотра по следующей цепочке приоритетов:
 *
 * 1️⃣ Если `posterAllowed === true` и `metadata.image` есть — вернуть его (постер).
 * 2️⃣ Если `posterAllowed === true`, но `metadata.image` нет — искать лого.
 * 3️⃣ Если `posterAllowed === false` — пропустить постер и сразу искать лого.
 * 4️⃣ Если лого не найдено — fallback на favicon.ico.
 * 5️⃣ Если ничего не найдено — вернуть null.
 *
 * Таким образом, порядок выбора: POSTER → LOGO → FAVICON → null
 *
 * @param {string} html — HTML-код страницы (может быть head-only)
 * @param {string} url — оригинальный URL
 * @param {Object} [metadata={}] — объект metascraper (image, logo и т.д.)
 * @param {Object} [rules={}] — объект правил (ожидается posterAllowed: boolean)
 * @returns {Promise<string|null>} — URL изображения (абсолютный) или null
 */
export async function getImage(html, url, metadata = {}, rules = {}) {
    const domain = extractDomain(url);
    const posterAllowed = rules.posterAllowed ?? true;

    debug(`🖼️ [getImage] Start for ${url}`);
    debug(`🔧 posterAllowed=${posterAllowed}, domain=${domain}`);

    // 🧩 1. Попытка вернуть постер
    if (posterAllowed && metadata.image) {
        const imageUrl = metadata.image;
        debug(`✅ Using poster image (metadata.image): ${imageUrl}`);
        return imageUrl;
    }

    // 🧩 2. Переходим к поиску логотипов
    debug(
        posterAllowed
            ? "ℹ️ posterAllowed but metadata.image missing → trying logo fallback"
            : "🚫 poster not allowed → using logo search"
    );

    const $ = cheerio.load(html || "");
    let candidates = [];

    // a) metadata.logo
    if (metadata.logo) candidates.push(metadata.logo);

    // b) og:logo
    $("meta[property='og:logo'], meta[name='og:logo']").each((_, el) => {
        const content = $(el).attr("content");
        if (content) candidates.push(content);
    });

    // c) link rel icons
    $("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='mask-icon']").each(
        (_, el) => {
            const href = $(el).attr("href");
            if (href) candidates.push(href);
        }
    );

    // d) JSON-LD logos
    $("script[type='application/ld+json']").each((_, el) => {
        try {
            const data = JSON.parse($(el).contents().text());
            const addLogo = (logo) => {
                if (logo) candidates.push(logo);
            };
            if (Array.isArray(data)) {
                data.forEach((item) => addLogo(item.logo));
            } else if (data && typeof data === "object") {
                if (typeof data.logo === "string") addLogo(data.logo);
                else if (data.logo?.url) addLogo(data.logo.url);
            }
        } catch {
            /* ignore */
        }
    });

    // Преобразуем к абсолютным URL
    candidates = candidates
        .map((c) => safeResolve(c, url))
        .filter(Boolean);

    // Убираем дубликаты
    candidates = [...new Set(candidates)];

    if (candidates.length > 0) {
        const bestLogo = selectBestCandidate(candidates);
        debug(`🎯 Selected best logo: ${bestLogo}`);
        return bestLogo;
    }

    // 🧩 3. Fallback: favicon.ico
    const faviconUrl = `https://${new URL(url).hostname}/favicon.ico`;
    if (await faviconExists(faviconUrl)) {
        debug(`🪞 Using favicon fallback: ${faviconUrl}`);
        return faviconUrl;
    }

    debug(`⚠️ No suitable image found for ${url}`);
    return null;
}

/* --------------------- helpers --------------------- */

/** Преобразует относительный URL в абсолютный */
function safeResolve(candidate, base) {
    try {
        if (candidate.startsWith("//")) {
            const protocol = new URL(base).protocol || "https:";
            return protocol + candidate;
        }
        return new URL(candidate, base).toString();
    } catch {
        return null;
    }
}

/** Проверяет, существует ли favicon */
async function faviconExists(faviconUrl) {
    try {
        appLog.debug(`🟡 Проверка favicon: ${faviconUrl}`);

        const res = await got.head(faviconUrl, {
            timeout: { request: 3000 },
            followRedirect: true,
            throwHttpErrors: false
        });

        const type = (res.headers["content-type"] || "").toLowerCase();
        appLog.debug(`🧩 favicon HEAD → status=${res.statusCode}, type=${type || "—"}`);

        // Если HEAD не дал полезной информации — пробуем GET
        if (res.statusCode === 405 || !type) {
            appLog.warn(`⚠️ HEAD не дал информацию (status=${res.statusCode}), пробуем GET`);
            const resGet = await got.get(faviconUrl, {
                timeout: { request: 3000 },
                followRedirect: true,
                throwHttpErrors: false
            });
            const typeGet = (resGet.headers["content-type"] || "").toLowerCase();
            appLog.debug(`🧩 favicon GET → status=${resGet.statusCode}, type=${typeGet || "—"}`);
            return resGet.statusCode === 200 && typeGet.startsWith("image/");
        }

        return res.statusCode === 200 && type.startsWith("image/");
    } catch (err) {
        appLog.error(`❌ Ошибка при проверке favicon ${faviconUrl}: ${err.name} — ${err.message}`);

        // Если это проблема TLS/SSL (сервер старый/несовместимый) — попробуем HTTP fallback
        const isSslProtocolError =
            err.code === "EPROTO" ||
            /unsupported protocol|ssl_choose_client_version|SSL routines|tlsv1 alert protocol version/i.test(
                err.message || ""
            );

        if (isSslProtocolError && faviconUrl.startsWith("https:")) {
            const httpUrl = faviconUrl.replace(/^https:/, "http:");
            try {
                appLog.warn(`➡️ SSL protocol error, пытаемся HTTP fallback: ${httpUrl}`);
                const res2 = await got.head(httpUrl, {
                    timeout: { request: 3000 },
                    followRedirect: true,
                    throwHttpErrors: false
                });
                const type2 = (res2.headers["content-type"] || "").toLowerCase();
                appLog.debug(`🧩 favicon HTTP HEAD → status=${res2.statusCode}, type=${type2 || "—"}`);

                if (res2.statusCode === 405 || !type2) {
                    const resGet2 = await got.get(httpUrl, {
                        timeout: { request: 3000 },
                        followRedirect: true,
                        throwHttpErrors: false
                    });
                    const typeGet2 = (resGet2.headers["content-type"] || "").toLowerCase();
                    appLog.debug(`🧩 favicon HTTP GET → status=${resGet2.statusCode}, type=${typeGet2 || "—"}`);
                    return resGet2.statusCode === 200 && typeGet2.startsWith("image/");
                }

                return res2.statusCode === 200 && type2.startsWith("image/");
            } catch (err2) {
                appLog.error(`❌ HTTP fallback failed for ${httpUrl}: ${err2.name} — ${err2.message}`);
            }
        }

        return false;
    }
}



/** Выбирает лучший кандидат по расширению (svg > png > webp > jpg > jpeg > ico) */
function selectBestCandidate(candidates) {
    const qualityOrder = [".svg", ".png", ".webp", ".jpg", ".jpeg", ".ico"];
    return candidates.sort((a, b) => {
        const idxA = qualityOrder.findIndex((ext) => a.toLowerCase().includes(ext));
        const idxB = qualityOrder.findIndex((ext) => b.toLowerCase().includes(ext));
        return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
    })[0];
}
