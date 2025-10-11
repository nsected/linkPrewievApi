import got from "got";
import metascraper from "metascraper";
import metascraperTitle from "metascraper-title";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo";
import metascraperUrl from "metascraper-url";
import metascraperAuthor from "metascraper-author";
import metascraperPublisher from "metascraper-publisher";
import metascraperDate from "metascraper-date";
import * as cheerio from 'cheerio';
import { isDomainAllowed, getAllowedDomains } from '../utils/isDomainInAllowed.js';
// todo: добавить кэширование 10 ссылок (middleware на req)
// создаём экземпляр metascraper с нужными правилами
const scraper = metascraper([
    metascraperTitle(),
    metascraperDescription(),
    metascraperImage(),
    metascraperLogo(),
    metascraperUrl(),
    metascraperAuthor(),
    metascraperPublisher(),
    metascraperDate(),
]);

// список расширений, которые считаем "файловыми" и игнорируем
const fileExtensions = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".mp4", ".avi", ".mov", ".mkv",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".mp3", ".wav", ".ogg",
];

// проверка на прямую ссылку к файлу
function isFileUrl(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    return fileExtensions.some(ext => pathname.endsWith(ext));
}

// обрезка строки
function truncate(str, length = 150) {
    if (!str) return "";
    return str.length > length ? str.slice(0, length) + "..." : str;
}

function extractDomain(url) {
    try {
        return new URL(url.includes('://') ? url : 'http://' + url).hostname;
    } catch {
        return null;
    }
};

/**
 * Универсальная функция: получает изображение для предпросмотра
 * - если домен в белом списке → постер (metadata.image) или логотип
 * - если домен не в белом списке → только логотип
 * @param {string} html - HTML страницы
 * @param {string} url - URL страницы
 * @param {object} metadata - объект от metascraper
 * @returns {string} URL изображения
 */
async function getImage(html, url, metadata = {}) {
    // 5️⃣ Проверка белого списка
    const isAllowed = isDomainAllowed(extractDomain(url));
    console.log(url);
    console.log(isAllowed);
    console.log(getAllowedDomains());
    if (isAllowed && metadata.image) {
        return metadata.image;
    }

    const $ = cheerio.load(html);
    const hostname = new URL(url).hostname;

    /**
     * Проверяет, существует ли favicon.ico
     * @param {string} faviconUrl
     * @returns {Promise<boolean>}
     */
    async function faviconExists(faviconUrl) {
        try {
            const response = await got.head(faviconUrl, { timeout: { request: 3000 } });
            const type = response.headers["content-type"] || "";
            return response.statusCode === 200 && type.startsWith("image/");
        } catch {
            return false;
        }
    }


    // 1️⃣ Собираем кандидатов на логотип
    let candidates = [];

    if (metadata.logo) candidates.push(metadata.logo);

    $('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel="mask-icon"]').each((_, el) => {
        const href = $(el).attr("href");
        if (href) candidates.push(new URL(href, url).toString());
    });

    $('meta[property="og:logo"]').each((_, el) => {
        const content = $(el).attr("content");
        if (content) candidates.push(new URL(content, url).toString());
    });

    $('script[type="application/ld+json"]').each((_, el) => {
        try {
            const data = JSON.parse($(el).contents().text());
            if (Array.isArray(data)) {
                data.forEach(item => { if (item.logo) candidates.push(item.logo); });
            } else if (data && data.logo) {
                candidates.push(data.logo);
            }
        } catch {}
    });

    // --- Проверяем favicon.ico ---
    const faviconUrl = `https://${hostname}/favicon.ico`;
    if (await faviconExists(faviconUrl)) {
        candidates.push(faviconUrl);
    }

    // 3️⃣ Убираем дубликаты
    candidates = [...new Set(candidates)];

    // 4️⃣ Сортируем по качеству (svg > png > jpg > ico)
    const qualityOrder = [".svg", ".png", ".jpg", ".jpeg", ".ico"];
    candidates.sort((a, b) => {
        const extA = qualityOrder.findIndex(ext => a.toLowerCase().includes(ext));
        const extB = qualityOrder.findIndex(ext => b.toLowerCase().includes(ext));
        return (extA === -1 ? 999 : extA) - (extB === -1 ? 999 : extB);
    });

    const bestLogo = candidates[0];
console.log(candidates);


    // 6️⃣ Возвращаем изображение
    return isAllowed ? (metadata.image || bestLogo) : bestLogo;
}

export async function parseUrl(url) {
    try {
        if (isFileUrl(url)) {
            return { url };
        }

        // загружаем html
        const { body: html, headers } = await got(url, {
            headers: {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                "cache-control": "max-age=0",
                "priority": "u=0, i",
                "referer": "https://www.ozon.ru/product/plate-teks-plyus-1884157099/",
                "sec-ch-ua": `"Not?A_Brand";v="99", "Chromium";v="130"`,
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": `"Windows"`,
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "sec-fetch-user": "?1",
                "sec-gpc": "1",
                "service-worker-navigation-preload": "true",
                "upgrade-insecure-requests": "1",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
            },
            timeout: { request: 10000 },
            retry: { limit: 2 },
            followRedirect: true,
            maxRedirects: 20,
        });

        const contentType = headers["content-type"] || "";
        if (!contentType.includes("text/html")) {
            return { url };
        }

        // парсим метаданные
        let metadata = await scraper({ html, url });

        let image = await getImage(html, url, metadata )

        // финальный объект
        let prewviewObject = {
            url,
            title: metadata.title ? truncate(metadata.title, 100) : "",
            description: metadata.description ? truncate(metadata.description, 200) : "",
            image: image ? image : ''
        };

        console.log(metadata.description);
        console.log(prewviewObject);

        return prewviewObject;

    } catch (err) {
        console.error("Parser error:", err.message);
        return { url, error: "Failed to parse page" };
    }
}
