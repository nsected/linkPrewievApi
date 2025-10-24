import got from "got";
import { appLog } from "../utils/logger.js";

/**
 * @module fetchYoutubeMetadata
 * @description
 * Получает метаданные видео с YouTube через YouTube Data API v3.
 *
 * 🚀 Цель: извлечь подробную информацию о видео (заголовок, описание, превью, статистику и т.д.)
 * для формирования карточки предпросмотра.
 *
 * ⚙️ Алгоритм работы:
 * 1️⃣ Проверяет наличие `process.env.YOUTUBE_API_KEY`.
 * 2️⃣ Извлекает `videoId` из URL.
 * 3️⃣ Делает запрос к `https://www.googleapis.com/youtube/v3/videos` с параметрами:
 *    - `part=snippet,contentDetails,statistics`
 *    - `id=<videoId>`
 *    - `key=<API_KEY>`
 * 4️⃣ Формирует итоговый объект метаданных.
 * 5️⃣ При ошибке возвращает `null` и пишет детальную информацию в лог.
 *
 * @param {string} videoUrl — ссылка на видео (например, `https://www.youtube.com/watch?v=dQw4w9WgXcQ`)
 * @returns {Promise<Object|null>} — объект метаданных:
 * {
 *   id: string,
 *   title: string,
 *   description: string,
 *   image: string|null,
 *   channelTitle: string,
 *   publishedAt: string,
 *   duration: string,        // ISO 8601 (PT4M13S)
 *   viewCount: string,
 *   likeCount: string,
 *   tags: string[]
 * }
 * или `null`, если не удалось получить данные.
 *
 * @example
 * const meta = await fetchYoutubeMetadata("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
 * console.log(meta.title); // "Rick Astley - Never Gonna Give You Up"
 */
export async function fetchYoutubeMetadata(videoUrl) {
    const namespace = "youtube:metadata";
    await appLog.debug({ namespace, msg: `📥 Начало запроса метаданных для: ${videoUrl}` });

    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            await appLog.error({
                namespace,
                msg: "❌ Переменная окружения YOUTUBE_API_KEY отсутствует. API-запрос невозможен.",
            });
            return null;
        }

        // Извлечение ID видео
        const match = videoUrl.match(/[?&]v=([^&#]+)/);
        const videoId = match?.[1];
        if (!videoId) {
            await appLog.error({
                namespace,
                msg: `❌ Не удалось извлечь videoId из URL: ${videoUrl}`,
            });
            return null;
        }

        const apiUrl = "https://www.googleapis.com/youtube/v3/videos";
        await appLog.verbose({
            namespace,
            msg: `🌐 Отправка запроса к YouTube API: ${apiUrl}`,
            extra: {
                id: videoId,
                part: "snippet,contentDetails,statistics",
            },
        });

        const response = await got(apiUrl, {
            searchParams: {
                id: videoId,
                part: "snippet,contentDetails,statistics",
                key: apiKey,
            },
            responseType: "json",
            timeout: { request: 8000 },
            retry: { limit: 2 },
        });

        await appLog.debug({
            namespace,
            msg: "✅ Ответ YouTube API получен",
            payload: response.body,
            extra: { statusCode: response.statusCode, itemCount: response.body.items?.length || 0 },
        });

        const item = response.body.items?.[0];
        if (!item) {
            await appLog.warn({
                namespace,
                msg: `⚠️ Видео с ID ${videoId} не найдено или данные отсутствуют.`,
                extra: { responseBody: response.body },
            });
            return null;
        }

        const { snippet, statistics, contentDetails } = item;
        const image =
            snippet.thumbnails?.maxres?.url ||
            snippet.thumbnails?.high?.url ||
            snippet.thumbnails?.default?.url ||
            null;

        const metadata = {
            id: videoId,
            title: snippet.title,
            description: snippet.description,
            image,
            channelTitle: snippet.channelTitle,
            publishedAt: snippet.publishedAt,
            duration: contentDetails.duration,
            viewCount: statistics.viewCount,
            likeCount: statistics.likeCount,
            tags: snippet.tags || [],
        };

        await appLog.info({
            namespace,
            msg: `🎬 Метаданные успешно извлечены для видео: ${metadata.title}`,
            extra: {
                videoId,
                channelTitle: metadata.channelTitle,
                duration: metadata.duration,
                image,
            },
        });

        return metadata;
     } catch (err) {
    const errorInfo = {
        message: err.message,
        name: err.name,
        code: err.code,
        stack: err.stack,
        cause: err.cause,
    };

    // Если есть ответ от сервера — логируем и тело, и заголовки
    if (err.response) {
        errorInfo.statusCode = err.response.statusCode;
        errorInfo.headers = err.response.headers;
        errorInfo.body = err.response.body;

        // Попробуем красиво распарсить JSON
        try {
            errorInfo.parsedBody = typeof err.response.body === "string"
                ? JSON.parse(err.response.body)
                : err.response.body;
        } catch {
            errorInfo.parsedBody = err.response.body;
        }
    }

    await appLog.error({
        namespace,
        msg: `💥 Ошибка при запросе YouTube API`,
        extra: errorInfo,
    });

    return null;
}

}
