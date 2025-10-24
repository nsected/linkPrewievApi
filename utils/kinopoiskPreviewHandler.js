// preview/handlers/kinopoiskPreviewHandler.js
import got from "got";
import { appLog } from "./logger.js";

/**
 * Проверяет, является ли ссылка ссылкой на фильм или сериал Кинопоиска.
 * Поддерживает форматы:
 * - https://www.kinopoisk.ru/film/775273/
 * - https://kinopoisk.ru/series/1392738/
 * - https://m.kinopoisk.ru/film/1234567/
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isKinopoiskLink(url) {
    try {
        const { hostname, pathname } = new URL(url);
        return (
            hostname.includes("kinopoisk.ru") &&
            /^\/(film|series)\/\d+/.test(pathname)
        );
    } catch {
        return false;
    }
}

/**
 * Извлекает предпросмотр фильма/сериала Кинопоиска по ID.
 *
 * @param {string} url - ссылка вида https://kinopoisk.ru/film/775273/
 * @param {object} [options]
 * @param {string} [options.apiKey] - ключ API Кинопоиска (можно хранить в process.env.KINOPOISK_API_KEY)
 * @returns {Promise<{url: string, title: string, description: string, image: string | null}>}
 */
export async function fetchKinopoiskPreview(url, options = {}) {
    const apiKey = options.apiKey || process.env.KINOPOISK_API_KEY;
    if (!apiKey) {
        appLog.error("❌ Не задан KINOPOISK_API_KEY — невозможно получить предпросмотр.");
        return null;
    }

    const idMatch = url.match(/\/(film|series)\/(\d+)/);
    if (!idMatch) {
        appLog.warn(`⚠️ Не удалось извлечь ID из ссылки: ${url}`);
        return null;
    }

    const filmId = idMatch[2];
    const apiUrl = `https://kinopoiskapiunofficial.tech/api/v2.2/films/${filmId}`;

    try {
        const res = await got(apiUrl, {
            headers: {
                "X-API-KEY": apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            timeout: { request: 5000 },
            responseType: "json",
        });

        const data = res.body;
        if (!data || typeof data !== "object") {
            appLog.warn(`⚠️ Пустой ответ от Kinopoisk API для ${filmId}`);
            return null;
        }

        const preview = {
            url,
            title: data.nameRu || data.nameOriginal || "Фильм Кинопоиска",
            description: data.shortDescription || data.description || "",
            image: data.posterUrlPreview || data.posterUrl || null,
        };

        appLog.debug(`🎬 Kinopoisk preview готов: ${preview.title}`);
        return preview;
    } catch (err) {
        appLog.error(`💥 Ошибка при обращении к Kinopoisk API (${apiUrl}): ${err.message}`);
        return null;
    }
}
