import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Получаем абсолютный путь
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_DOMAINS_FILE = path.join(__dirname, '../posterAllowedDomains.json');

let allowedDomains = [];

// Функция загрузки с обработкой ошибок
function loadAllowedDomains() {
    try {
        const data = fs.readFileSync(ALLOWED_DOMAINS_FILE, 'utf-8');
        const parsed = JSON.parse(data);

        if (!Array.isArray(parsed)) {
            throw new Error('Invalid format: JSON must be an array');
        }

        allowedDomains = parsed.map(d => d.trim().toLowerCase());
        console.log(`[INFO] Allowed domains loaded (${allowedDomains.length} entries):`, allowedDomains);
    } catch (err) {
        console.error(`[ERROR] Failed to load allowed domains: ${err.message}`);
        allowedDomains = []; // fallback
    }
}

// Первичная загрузка
loadAllowedDomains();

// Автообновление при изменении файла
fs.watchFile(ALLOWED_DOMAINS_FILE, { interval: 2000 }, (curr, prev) => {
    if (curr.mtime !== prev.mtime) {
        console.log('[INFO] Reloading allowed domains...');
        loadAllowedDomains();
    }
});

// Проверка на вайтлист
export function isDomainAllowed(domain) {
    console.log('!!! [isDomainAllowed] --- Domain check start ---');
    console.log('Input domain:', domain);
    console.log('Allowed domains:', allowedDomains);

    if (!domain) {
        console.warn('[WARN] Empty or undefined domain received.');
        return false;
    }

    // 🔹 Нормализуем домен (без www. и в нижний регистр)
    const normalized = domain.trim().toLowerCase().replace(/^www\./, '');
    console.log('[DEBUG] Normalized domain:', normalized);

    // 🔹 Проверяем: прямое совпадение или поддомен разрешённого домена
    const allowed = allowedDomains.some(allowedDomain => {
        const base = allowedDomain.replace(/^www\./, '');
        return normalized === base || normalized.endsWith(`.${base}`);
    });

    console.log(`[RESULT] Domain "${domain}" allowed:`, allowed);
    console.log('!!! [isDomainAllowed] --- Domain check end ---\n');
    return allowed;
}

// Возврат списка
export function getAllowedDomains() {
    return [...allowedDomains];
}
