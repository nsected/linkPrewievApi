import {debug} from "../utils/debugHandler.js";
import {truncate} from "../utils/helpers.js";
import {fetchHtml} from "./sitesCrawler.js";
import {parseMetadata} from "./parseMetadata.js";
import {getImage} from "./getImage.js";
import parsingRulesList from "../parsingRules.json" with {type: "json"};
import blockedDomains from "../blockedDomains.json" with {type: "json"};
import {getParsingRules} from "./parsingRulesManager.js";
import {fetchYoutubePreview, isYoutubeLink} from "../utils/youtubePreviewHandler.js";
import {fetchKinopoiskPreview, isKinopoiskLink} from "../utils/kinopoiskPreviewHandler.js";
import {appLog} from "../utils/logger.js";

/**
 *  конвейер предпросмотра ссылок
 *  URL → HTML → Metadata → Image → Preview Object
 */
export async function parseUrl(url) {
    //const log = appLog.child({ namespace: "parseUrl" });
    await appLog.info({taskUrl: url, message: "🚀 Starting pipeline"})
    const blacklistMode = String(process.env.BLACKLISTMODE).toLowerCase() === "true";
    const whitelistMode = String(process.env.WHITELISTMODE).toLowerCase() === "true";
    const isPostersOnByDefault = String(process.env.IS_POSTERS_ON_BY_DEFAULT).toLowerCase() === "true";
    const rules = getParsingRules(url, parsingRulesList, blockedDomains, whitelistMode, isPostersOnByDefault);
    //console.log(blacklistMode, JSON.stringify(rules))
    await appLog.info({taskUrl: url, message: `whitelistMode: ${whitelistMode} Parsing rules:`, extra: rules}  )
    if (rules.skipParsing) {
        return {
            message: 'Skip parsing because of rules',
            rules: rules,
            whitelistMode: whitelistMode,
            blacklistMode: blacklistMode
        }
    }

    // 0️⃣ Если это YouTube — пробуем API
    if (isYoutubeLink(url)) {
        return await fetchYoutubePreview(url);
    }

    if (isKinopoiskLink(url)) {
        return await fetchKinopoiskPreview(url);
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
        const onlyPoster = rules.onlyPoster
        // 4️⃣ Собираем финальный объект
        const preview = {
            url,
            title: onlyPoster ? "" : truncate(metadata.title, 100),
            description: onlyPoster ? "" : truncate(metadata.description, 200),
            image,
        };

        debug("🏁 Pipeline complete:", preview);
        return preview;
    } catch (err) {
        console.error(`❌ [parseUrl] Pipeline failed for ${url}`);
        console.error(err.stack || err);
        return 'test'
    }
}
