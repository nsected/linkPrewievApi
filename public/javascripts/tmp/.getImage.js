import got from "got";
import * as cheerio from "cheerio";
import { debug } from "../../../utils/debugHandler.js";
import { extractDomain } from "../../../utils/helpers.js";
import { isDomainAllowed, getAllowedDomains } from ".isDomainInAllowed.js";
/**
 * Получаем изображение для предпросмотра:
 * постер сайта, либо логотип, либо fallback в виде иконки сайта favicon.ico
 */
export async function getImage(html, url, metadata = {}) {
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
        candidates.unshift(metadata.logo);
    }

    $("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon'], link[rel='mask-icon']").each((_, el) => {
        const href = $(el).attr("href");
        if (href) candidates.unshift(new URL(href, url).toString());
    });

    $("meta[property='og:logo']").each((_, el) => {
        const content = $(el).attr("content");
        if (content) candidates.unshift(new URL(content, url).toString());
    });

    $("script[type='application/ld+json']").each((_, el) => {
        try {
            const data = JSON.parse($(el).contents().text());
            if (Array.isArray(data)) {
                data.forEach((item) => {
                    if (item.logo) candidates.unshift(item.logo);
                });
            } else if (data && data.logo) {
                candidates.unshift(data.logo);
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
        const extA = qualityOrder.findIndex(ext => a.toLowerCase().includes(ext));
        const extB = qualityOrder.findIndex(ext => b.toLowerCase().includes(ext));
        return (extA === -1 ? 999 : extA) - (extB === -1 ? 999 : extB);
    });

    debug(`🎯 Logo candidates (${candidates.length}):`, candidates);
    const bestLogo = candidates[0];

    debug(`✅ Selected best logo: ${bestLogo || "none"}`);
    debug(`🖼️ [getImage] Done for ${url}`);
    return isAllowed ? metadata.image || bestLogo : bestLogo;
}
