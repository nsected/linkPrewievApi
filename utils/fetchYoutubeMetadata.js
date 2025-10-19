import got from 'got';

/**
 * Получает метаданные видео с YouTube по API.
 * Требует наличия process.env.YOUTUBE_API_KEY
 *
 * @param {string} videoUrl - ссылка на видео (например: https://www.youtube.com/watch?v=dQw4w9WgXcQ)
 * @returns {Promise<object|null>} - объект с метаданными (title, description, image и т.д.)
 */
export async function fetchYoutubeMetadata(videoUrl) {
    try {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            throw new Error('❌ Missing YOUTUBE_API_KEY in environment variables');
        }

        // Извлекаем ID видео
        const match = videoUrl.match(/[?&]v=([^&#]+)/);
        const videoId = match?.[1];
        if (!videoId) {
            throw new Error(`❌ Could not extract video ID from URL: ${videoUrl}`);
        }

        // Запрос к YouTube Data API v3
        const apiUrl = 'https://www.googleapis.com/youtube/v3/videos';
        const response = await got(apiUrl, {
            searchParams: {
                id: videoId,
                part: 'snippet,contentDetails,statistics',
                key: apiKey,
            },
            responseType: 'json',
            timeout: { request: 8000 },
            retry: { limit: 2 },
        });

        const item = response.body.items?.[0];
        if (!item) return null;

        const { snippet, statistics, contentDetails } = item;

        return {
            id: videoId,
            title: snippet.title,
            description: snippet.description,
            image: snippet.thumbnails?.maxres?.url ||
                snippet.thumbnails?.high?.url ||
                snippet.thumbnails?.default?.url,
            channelTitle: snippet.channelTitle,
            publishedAt: snippet.publishedAt,
            duration: contentDetails.duration, // в формате ISO 8601 (PT4M13S)
            viewCount: statistics.viewCount,
            likeCount: statistics.likeCount,
            tags: snippet.tags || [],
        };

    } catch (err) {
        console.error('💥 YouTube metadata fetch failed:', err.message);
        return null;
    }
}
