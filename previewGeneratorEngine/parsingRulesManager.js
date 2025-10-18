import { extractDomain, isFileUrl, isPosterAllowed } from "../utils/helpers.js";

/**
 * Возвращает объект правил парсинга для заданного URL
 * @param {string} url — ссылка на страницу
 * @param {Array} parsingRulesList — список правил из parsingRules.json
 * @returns {{
 *   domain: string|null,
 *   fastmode: boolean,
 *   classification: string,
 *   posterAllowed: boolean,
 *   skipParsing: boolean
 * }}
 */
export function getParsingRules(url, parsingRulesList = []) {
    const domain = extractDomain(url);
    const skipParsing = isFileUrl(url);

    if (!domain) {
        return {
            domain: null,
            fastmode: true,
            classification: "unknown",
            posterAllowed: false,
            skipParsing
        };
    }

    // Ищем правило для текущего домена
    const rule = parsingRulesList.find(r => {
        const base = r.domain.trim().toLowerCase().replace(/^www\./, "");
        const normalized = domain.toLowerCase().replace(/^www\./, "");
        return normalized === base || normalized.endsWith(`.${base}`);
    });

    const fastmode = rule?.fastmode ?? true;
    const classification = rule?.classification ?? "unknown";
    const posterAllowed = isPosterAllowed(domain, parsingRulesList);

    return {
        domain,
        fastmode,
        classification,
        posterAllowed,
        skipParsing
    };
}
