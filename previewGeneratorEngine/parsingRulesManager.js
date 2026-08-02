import { extractDomain, isFileUrl, isPosterAllowed } from "../utils/helpers.js";

/**
 * Возвращает объект правил парсинга для заданного URL
 * @param {string} url — ссылка на страницу
 * @param {Array} parsingRulesList — список правил из parsingRules.json
 * @param {Array} [blockedDomains=[]] — список доменов, запрещённых к парсингу
 * @param {boolean} [whitelistMode=false] — если true, парсит только домены из parsingRulesList
 * @returns {{
 *   domain: string|null,
 *   fastmode: boolean,
 *   classification: string,
 *   posterAllowed: boolean,
 *   skipParsing: boolean
 * }}
 */
export function getParsingRules(
    url,
    parsingRulesList = [],
    blockedDomains = [],        // new: список доменов для блокировки
    whitelistMode = false,       // new: режим белого списка
    isPostersOnByDefault = false
) {
    const domain = extractDomain(url);
    const skipParsing = isFileUrl(url);

    // если домен не пришел от клиента - скипаем
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
    const posterAllowed = isPosterAllowed(domain, parsingRulesList, isPostersOnByDefault);

    // new: whitelist / blacklist логика
    let finalSkipParsing = skipParsing;
    let domainFoundInRules = false;
    if (whitelistMode) {
        // whitelist mode → парсим только домены, которые есть в parsingRulesList
        if (rule) {
            domainFoundInRules = true
        } else {
            finalSkipParsing = true;
        }
    }
        // blacklist mode → блокируем домены из blockedDomains
        const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
        const isBlocked = blockedDomains.some(bd => {
            const base = bd.trim().toLowerCase().replace(/^www\./, "");
            return normalizedDomain === base || normalizedDomain.endsWith(`.${base}`);
        });
        if (isBlocked) {
            finalSkipParsing = true;
        }


    return {
        domain,
        fastmode,
        classification,
        posterAllowed,
        domainFoundInRules,
        skipParsing: finalSkipParsing
    };
}
