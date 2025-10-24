// logFileWriter.js
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const LOG_DIR = path.resolve('./logs/html');
await fs.mkdir(LOG_DIR, { recursive: true });

const queue = [];
let isFlushing = false;

/**
 * Добавляет содержимое в очередь на запись и возвращает имя файла.
 * @param {string} identifier - идентификатор (обычно URL или namespace)
 * @param {string} content - содержимое (HTML и т.п.)
 * @param {string} type - расширение файла
 */
export async function enqueuePayload(identifier, content, type = 'html') {
    const hash = crypto
        .createHash('md5')
        .update(identifier + Date.now())
        .digest('hex');
    const fileName = `${hash}.${type}`;
    const filePath = path.join(LOG_DIR, fileName);

    queue.push({ filePath, content });

    // Ждём flush, чтобы не потерять данные
    await flushQueue();

    return filePath;
}

async function flushQueue() {
    if (isFlushing) return;
    isFlushing = true;

    while (queue.length > 0) {
        const { filePath, content } = queue.shift();
        try {
            await fs.writeFile(filePath, content, 'utf-8');
            const normalizedPath = filePath.replace(/\\/g, '/');
            console.log(`📄 [file-writer] Saved payload → file:///${normalizedPath}`);

        } catch (err) {
            console.error('[file-writer] Failed to write payload:', err);
        }
    }

    isFlushing = false;
}
