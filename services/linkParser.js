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
import * as cheerio from "cheerio";
import { isDomainAllowed, getAllowedDomains } from "../utils/isDomainInAllowed.js";

// deprecated: todo moved below to unified debug()
// console.log calls replaced with structured debug

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

const fileExtensions = [
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".webp",
    ".mp4",
    ".avi",
    ".mov",
    ".mkv",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".zip",
    ".rar",
    ".7z",
    ".tar",
    ".gz",
    ".mp3",
    ".wav",
    ".ogg",
];

function debug(...args) {
    console.debug("[parser]", ...args);
}

function isFileUrl(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    return fileExtensions.some((ext) => pathname.endsWith(ext));
}

function truncate(str, length = 150) {
    if (!str) return "";
    return str.length > length ? str.slice(0, length) + "..." : str;
}

function extractDomain(url) {
    try {
        return new URL(url.includes("://") ? url : "http://" + url).hostname;
    } catch {
        return null;
    }
}

/**
 * Универсальная функция: получает изображение для предпросмотра
 */
async function getImage(html, url, metadata = {}) {
    debug(`🖼️ [getImage] Start image extraction for ${url}`);
    const isAllowed = isDomainAllowed(extractDomain(url));
    debug(`🟢 Domain allowed: ${isAllowed}, Allowed list:`, getAllowedDomains());

    if (isAllowed && metadata.image) {
        debug(`✅ Using metadata.image for allowed domain: ${metadata.image}`);
        return metadata.image;
    }

    const $ = cheerio.load(html);
    const hostname = new URL(url).hostname;

    async function faviconExists(faviconUrl) {
        try {
            const response = await got.head(faviconUrl, { timeout: { request: 3000 } });
            const type = response.headers["content-type"] || "";
            return response.statusCode === 200 && type.startsWith("image/");
        } catch {
            return false;
        }
    }

    let candidates = [];

    if (metadata.logo) {
        debug(`Found metadata.logo: ${metadata.logo}`);
        candidates.push(metadata.logo);
    }

    $("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='mask-icon']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) candidates.push(new URL(href, url).toString());
    });

    $("meta[property='og:logo']").each((_, el) => {
        const content = $(el).attr("content");
        if (content) candidates.push(new URL(content, url).toString());
    });

    $("script[type='application/ld+json']").each((_, el) => {
        try {
            const data = JSON.parse($(el).contents().text());
            if (Array.isArray(data)) {
                data.forEach((item) => {
                    if (item.logo) candidates.push(item.logo);
                });
            } else if (data && data.logo) {
                candidates.push(data.logo);
            }
        } catch {}
    });

    const faviconUrl = `https://${hostname}/favicon.ico`;
    if (await faviconExists(faviconUrl)) {
        debug(`Found favicon.ico at ${faviconUrl}`);
        candidates.push(faviconUrl);
    }

    candidates = [...new Set(candidates)];

    const qualityOrder = [".svg", ".png", ".jpg", ".jpeg", ".ico"];
    candidates.sort((a, b) => {
        const extA = qualityOrder.findIndex((ext) => a.toLowerCase().includes(ext));
        const extB = qualityOrder.findIndex((ext) => b.toLowerCase().includes(ext));
        return (extA === -1 ? 999 : extA) - (extB === -1 ? 999 : extB);
    });

    debug(`🎯 Logo candidates (${candidates.length}):`, candidates);
    const bestLogo = candidates[0];

    debug(`✅ Selected best logo: ${bestLogo || "none"}`);
    debug(`🖼️ [getImage] Done for ${url}`);
    return isAllowed ? metadata.image || bestLogo : bestLogo;
}

export async function parseUrl(url) {
    debug(`🔄 [parseUrl] --- Start parsing pipeline for URL: ${url} ---`);
    try {
        if (isFileUrl(url)) {
            debug(`📁 Detected file URL: ${url}`);
            return { url };
        }

        debug("🌐 Fetching HTML via got()...");

        const { body: html, headers } = await got(url, {
            headers: {
                "accept":
                    "text/html,application/xhtml+xml,application/xml;q=0.9,image/jxl,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "accept-encoding": "gzip, deflate, br, zstd",
                "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                "cache-control": "max-age=0",
                "priority": "u=0, i",
                "referer": "https://www.google.com/",
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
                "user-agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            },
            timeout: { request: 10000 },
            retry: { limit: 2 },
            followRedirect: true,
            maxRedirects: 20,
        });

        const contentType = headers["content-type"] || "";
        debug(`📄 Content-Type: ${contentType}`);

        if (!contentType.includes("text/html")) {
            debug(`⚠️ Non-HTML content, skipping parse.`);
            return { url };
        }

        debug("🔍 Extracting metadata via metascraper...");
        const metadata = await scraper({ html, url });
        debug("✅ Metadata extracted:", metadata);

        debug("🖼️ Extracting image...");
        const image = await getImage(html, url, metadata);

        const previewObject = {
            url,
            title: metadata.title ? truncate(metadata.title, 100) : "",
            description: metadata.description ? truncate(metadata.description, 200) : "",
            image: image || "",
        };

        debug("🏁 [parseUrl] Final preview object:", previewObject);
        debug(`✅ [parseUrl] --- Completed successfully for ${url} ---`);
        return previewObject;
    } catch (err) {
        debug(`❌ [parseUrl] Error for ${url}:`, err.message);
        return { url, error: "Failed to parse page" };
    }
}
