import { debug } from "../utils/debugHandler.js";
import { truncate } from "../utils/helpers.js";
import { fetchHtml } from "./sitesCrawler.js";
import { parseMetadata } from "./parseMetadata.js";
import { getImage } from "./getImage.js";
import parsingRulesList from "../parsingRules.json" with { type: "json" };
import { getParsingRules } from "./parsingRulesManager.js";
import { isYoutubeLink, fetchYoutubePreview } from "../utils/youtubePreviewHandler.js";
import { isKinopoiskLink, fetchKinopoiskPreview } from "../utils/kinopoiskPreviewHandler.js";

/**
 *  конвейер предпросмотра ссылок
 *  URL → HTML → Metadata → Image → Preview Object
 */
export async function parseUrl(url) {
    debug(`🚀 [parseUrl] Starting pipeline for: ${url}`);

    // 0️⃣ Если это YouTube — пробуем API
    if (isYoutubeLink(url)) {
        const youtubePreview = await fetchYoutubePreview(url);
        if (youtubePreview) return youtubePreview;
    }

    if (isKinopoiskLink(url)) {
        const kinopoiskPreview = await fetchKinopoiskPreview(url);
        if (kinopoiskPreview) return kinopoiskPreview;
    }


    const rules = getParsingRules(url, parsingRulesList);

    if (rules.skipParsing) {
        return { url, note: "Skipped because file link", rules };
    }

    try {
        // 1️⃣ Получаем HTML
        const htmlResult = await fetchHtml(url, { fastmode: rules.fastmode });
        if (htmlResult.type === "file") return { url, note: "Skipped because file link" };

        const html = htmlResult.html;
        debug(`🟡 [DEBUG] HTML snippet (first 500 chars):\n${html?.slice(0, 500)}`);
        debug(`🟡 [DEBUG] HTML length: ${html?.length}, fastmode=${rules.fastmode}`);

        // 2️⃣ Извлекаем метаданные
        const metadata = await parseMetadata(html, url);
        debug(`🟡 [DEBUG] Metadata keys found: ${Object.keys(metadata).join(", ")}`);
        debug(`🟡 [DEBUG] Metadata.description (raw):`, metadata?.description);

        // 3️⃣ Подбираем изображение
        const image = await getImage(html, url, metadata, rules);

        // 4️⃣ Собираем финальный объект
        const preview = {
            url,
            title: truncate(metadata.title, 100),
            description: truncate(metadata.description, 200),
            image,
        };

        debug("🏁 Pipeline complete:", preview);
        return preview;
    } catch (err) {
        debug(`❌ [parseUrl] Pipeline failed: ${err.message}`);
        return { url, error: err.message };
    }
}
