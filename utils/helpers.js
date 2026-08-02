export const fileExtensions = [
    ".jpg", ".jpeg", ".png", ".gif", ".webp",
    ".mp4", ".avi", ".mov", ".mkv",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".mp3", ".wav", ".ogg",
];

export function isFileUrl(url) {
    const pathname = new URL(url).pathname.toLowerCase();
    return fileExtensions.some(ext => pathname.endsWith(ext));
}

export function truncate(str, length = 150) {
    if (!str) return "";
    return str.length > length ? str.slice(0, length) + "..." : str;
}

export function extractDomain(url) {
    try {
        return new URL(url.includes("://") ? url : "http://" + url).hostname;
    } catch {
        return null;
    }
}

/**
 * Проверяет, разрешён ли постер для домена или поддомена
 * @param {string} domain — домен из URL (например, "m.yandex.ru")
 * @param {Array} parsingRulesList — массив правил из parsingRules.json
 * @param {boolean} isPostersOnByDefault — разрешены ли постеры по умолчанию в переменной окружения
 * @returns {boolean} true, если домен или его поддомен есть в списке правил или isPostersOnByDefault в переменной окружения задан true
 * Если найдено правило с posterAllowed === false, возвращает false
 */
export function isPosterAllowed(domain, parsingRulesList = [], isPostersOnByDefault) {
    if (!domain || !Array.isArray(parsingRulesList)) return false;

    const normalized = domain.trim().toLowerCase().replace(/^www\./, "");

    // Поиск соответствующего правила
    const matchedRule = parsingRulesList.find(rule => {
        const base = rule.domain.trim().toLowerCase().replace(/^www\./, "");
        // Прямое совпадение или поддомен
        return normalized === base || normalized.endsWith(`.${base}`);
    });

    // Если найдено правило и явно запрещено — вернуть false
    if (matchedRule && matchedRule.posterAllowed === false) {
        return false;
    }

    // Если правило найдено, но запрета нет — постер разрешён
    if (matchedRule) {
        return true;
    }

    // Нет правил — по умолчанию выдаем как указано в переменной окружения isPostersOnByDefault
    return isPostersOnByDefault;
}