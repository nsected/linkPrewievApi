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

        allowedDomains = parsed;
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

// Экспорт для других модулей
export function isDomainAllowed(domain) {
    console.log('!!!')
    console.log(domain)
    console.log(allowedDomains)
    return allowedDomains.includes(domain);
        //return true
}

export function getAllowedDomains() {
    return [...allowedDomains];
}
