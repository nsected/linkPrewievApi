// logger/index.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { enqueuePayload } from "./logFileWriter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- LEVELS & COLORS ---
const LOG_LEVELS = {
    trace: 10,
    verbose: 15,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

const COLORS = {
    trace: "\x1b[37m", // white
    verbose: "\x1b[90m", // gray
    debug: "\x1b[36m", // cyan
    info: "\x1b[32m", // green
    warn: "\x1b[33m", // yellow
    error: "\x1b[31m", // red
    fatal: "\x1b[35m", // magenta
    reset: "\x1b[0m",
};

function emojiFor(level) {
    switch (level) {
        case "trace":
            return "🔍";
        case "verbose":
            return "🗣️";
        case "debug":
            return "🐛";
        case "info":
            return "ℹ️";
        case "warn":
            return "⚠️";
        case "error":
            return "💥";
        case "fatal":
            return "☠️";
        default:
            return "📄";
    }
}

// --- Ensure directories exist ---
function ensureLogDirs() {
    const base = path.resolve("./logs");
    const htmlDir = path.join(base, "html");
    if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
    if (!fs.existsSync(htmlDir)) fs.mkdirSync(htmlDir, { recursive: true });
}
ensureLogDirs();

// --- Core Logger Factory ---
function createLogger(namespaceDefaults = {}) {
    // use LOG_LEVEL or DEBUG_LEVEL, default = info
    const envLevel =
        process.env.LOG_LEVEL ||
        process.env.DEBUG_LEVEL ||
        process.env.LOGLEVEL ||
        "info";
    const levelThreshold = LOG_LEVELS[envLevel] ?? 30;

    async function log(level, ctx = {}) {
        const msgLevelVal = LOG_LEVELS[level];
        if (msgLevelVal < levelThreshold) return;

        const record = { ...namespaceDefaults, ...ctx };
        const message = record.message || "";


        const emoji = emojiFor(level);
        const color = COLORS[level] || COLORS.reset;
        const reset = COLORS.reset;
        const ns = record.namespace ? `[${record.namespace}]` : "";
        const url = record.taskUrl ? `(${record.taskUrl})` : "";
        const taskParams = record.taskParams ? record.taskParams : {};
        const extra = record.extra ? record.extra : {};
        const timestamp = new Date().toISOString();

        const consoleMsg = `${color}${emoji} [${level.toUpperCase()}] ${timestamp} ${ns}${url} ${message}${JSON.stringify(taskParams)}${JSON.stringify(extra)}{reset}`;
        console.log(consoleMsg);
        var { payload } = record;
        payload = consoleMsg + '\n'+ payload;
        // --- Save payload if large ---
        if (payload && typeof payload === "string" && payload.length > 500) {
            try {
                const filePath = await enqueuePayload(
                    record.taskUrl || record.namespace || "unknown",
                    payload
                );
                record.file = path.relative(process.cwd(), filePath);
                delete record.payload;
            } catch (err) {
                console.error("❌ Failed to enqueue payload:", err);
            }
        }
        // --- Write JSON log line ---
        const logLine =
            JSON.stringify({
                time: timestamp,
                level,
                ...record,
            }) + "\n";

        const logFilePath = path.resolve("./logs/app.log");
        fs.appendFile(logFilePath, logLine, (err) => {
            if (err) console.error("Log write error:", err);
        });


    }

    // --- API methods for each level ---
    const api = {};
    for (const level of Object.keys(LOG_LEVELS)) {
        api[level] = async (...args) => {
            const [ctx, msg] = args;
            if (typeof ctx === "string") return log(level, { message: ctx });
            if (typeof msg === "string") return log(level, { ...ctx, message: msg });
            return log(level, ctx || {});
        };
    }

    // --- Child logger ---
    api.child = (bindings = {}) => createLogger(bindings);
    return api;
}

export const appLog = createLogger();
