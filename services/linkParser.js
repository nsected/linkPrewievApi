import got from "got";
import { StringDecoder } from "node:string_decoder";
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
        candidates.unshift(faviconUrl);
    }

    candidates = [...new Set(candidates)];

    const qualityOrder = [".svg", ".png", ".jpg", ".jpeg", ".ico"];
    candidates.sort((a, b) => {
        const extA = qualityOrder.findIndex((ext) => a.toLowerCase().includes(ext));
        const extB = qualityOrder.findIndex((ext) => b.toLowerCase().includes(ext));
        return (extA === -1 ? 999 : extA) - (extB === -1 ? 999 : extB);
    });

    debug(`🎯 Logo candidates (${candidates.length}):`, candidates);
    const bestLogo = candidates[candidates.length-1];

    debug(`✅ Selected best logo: ${bestLogo || "none"}`);
    debug(`🖼️ [getImage] Done for ${url}`);
    return isAllowed ? metadata.image || bestLogo : bestLogo;
}


/**
 * Основная функция парсинга URL с потоковой обработкой
 */
export async function parseUrl(url) {
    debug(`🔄 [parseUrl] --- Start parsing pipeline for URL: ${url} ---`);

    try {
        if (isFileUrl(url)) {
            debug(`📁 Detected file URL: ${url}`);
            return { url };
        }

        // 🆕 Новый режим — потоковая загрузка через got.stream()
        debug("🌐 Fetching HTML stream via got() (head-only optimization)...");

        return new Promise((resolve, reject) => {
            const decoder = new StringDecoder("utf8"); // 🆕 для аккуратной сборки чанков
            let buffer = "";
            let headClosed = false;

            const stream = got.stream(url, {
                headers: {
                    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                    "accept-encoding": "gzip, deflate, br",
                    "accept-language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
                    "cache-control": "no-cache",
                    "referer": "https://www.google.com/",
                    "upgrade-insecure-requests": "1",
                    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
                },
                timeout: { request: 10000 },
                retry: { limit: 2 },
                followRedirect: true,
                maxRedirects: 20,
            });

            stream.on("data", async (chunk) => {
                if (headClosed) return; // 🆕 если head уже найден — игнорируем остальные чанки

                buffer += decoder.write(chunk);
                const idx = buffer.indexOf("</head>");

                if (idx !== -1) {
                    headClosed = true;
                    const headHtml = buffer.slice(0, idx + 7); // 🆕 извлекаем только head часть
                    stream.destroy(); // 🆕 останавливаем загрузку страницы

                    debug("🧠 </head> detected — starting metascraper immediately...");

// === 💬 BEGIN DEBUG HTML STRUCTURE LOGGING ===
                    try {
                        const $ = cheerio.load(headHtml);

                        // 1️⃣ Проверяем наличие og-тегов
                        const ogTags = {};
                        $("meta[property^='og:']").each((_, el) => {
                            const prop = $(el).attr("property");
                            const content = $(el).attr("content");
                            ogTags[prop] = content;
                        });
                        debug("🔎 Found OpenGraph tags:", ogTags);

                        // 2️⃣ JSON-LD (структурированные данные)
                        const jsonLdBlocks = [];
                        $("script[type='application/ld+json']").each((_, el) => {
                            jsonLdBlocks.push($(el).html()?.trim().slice(0, 300)); // ограничим 300 символами
                        });
                        debug(`🧩 Found ${jsonLdBlocks.length} JSON-LD blocks. Sample:`, jsonLdBlocks.slice(0, 1));

                        // 3️⃣ Title и description
                        const titleTag = $("title").text();
                        const metaDesc = $("meta[name='description']").attr("content");
                        debug("📘 <title>:", truncate(titleTag, 200));
                        debug("📄 <meta name='description'>:", truncate(metaDesc, 200));

                        // 4️⃣ Проверим, не пустой ли вообще HTML
                        debug("📊 HTML length:", headHtml.length);
                        debug("📄 HTML start preview:\n", headHtml.slice(0, 2000));
                        if (headHtml.length < 10000) debug("⚠️ HTML suspiciously short – likely partial or placeholder page.");
                    } catch (e) {
                        debug("⚠️ HTML debug parsing failed:", e.message);
                    }
// === 💬 END DEBUG HTML STRUCTURE LOGGING ===
                    try {
                        const metadata = await scraper({ html: headHtml, url });
                        debug("✅ Metadata extracted early:", metadata);

                        const image = await getImage(headHtml, url, metadata);
                        const previewObject = {
                            url,
                            title: metadata.title ? truncate(metadata.title, 100) : "",
                            description: metadata.description ? truncate(metadata.description, 200) : "",
                            image: image || "",
                        };

                        debug("🏁 [parseUrl] Final preview object (stream mode):", previewObject);
                        resolve(previewObject);
                    } catch (err) {
                        reject(err);
                    }
                }
            });

            stream.on("error", (err) => {
                debug(`❌ Stream error for ${url}:`, err.message);
                reject({ url, error: "Stream error" });
            });

            stream.on("end", () => {
                if (!headClosed) {
                    debug("⚠️ Stream ended before </head> — fallback to minimal parsing.");
                    resolve({ url, error: "No <head> found" });
                }
            });
        });
    } catch (err) {
        debug(`❌ [parseUrl] Error for ${url}:`, err.message);
        return { url, error: "Failed to parse page" };
    }
}