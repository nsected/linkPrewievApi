import { debug } from "../utils/debugHandler.js";
import { truncate } from "../utils/helpers.js";
import { fetchYoutubeMetadata } from "../utils/fetchYoutubeMetadata.js";

/**
 * Проверяет, является ли URL ссылкой на YouTube-видео.
 *
 * Поддерживает форматы:
 * - https://www.youtube.com/watch?v=...
 * - https://youtu.be/...
 * - https://youtube.com/shorts/...
 *
 * @param {string} url
 * @returns {boolean}
 */
export function isYoutubeLink(url) {
    return /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
}

/**
 * Получает предпросмотр YouTube-видео через YouTube Data API v3.
 *
 * @param {string} url
 * @returns {Promise<object|null>} объект предпросмотра или null при ошибке
 */
export async function fetchYoutubePreview(url) {
    debug(`🎬 [YouTube] Fetching metadata via YouTube API for: ${url}`);

    try {
        const ytMeta = await fetchYoutubeMetadata(url);

        if (!ytMeta) {
            debug("⚠️ [YouTube] API returned no data");
            return null;
        }

        const preview = {
            url,
            title: truncate(ytMeta.title, 100),
            description: truncate(ytMeta.description, 200),
            image: ytMeta.image,
            channel: ytMeta.channelTitle,
            duration: ytMeta.duration,
            views: ytMeta.viewCount,
        };

        debug("🏁 [YouTube] Metadata successfully fetched:", preview);
        return preview;

    } catch (err) {
        debug(`❌ [YouTube] Failed to fetch metadata: ${err.message}`);
        return null;
    }
}
