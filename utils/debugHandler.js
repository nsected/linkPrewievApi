// utils/debugHandler.js
const LOG_LEVELS = ["error", "warn", "info", "debug", "verbose"];
const currentLevel = process.env.DEBUG_LEVEL || "debug"; // по умолчанию debug

export function verbose(message, ...args) {
    log("verbose", message, ...args);
}
export function debug(message, ...args) {
    log("debug", message, ...args);
}
export function info(message, ...args) {
    log("info", message, ...args);
}
export function warn(message, ...args) {
    log("warn", message, ...args);
}
export function error(message, ...args) {
    log("error", message, ...args);
}

function log(level, message, ...args) {
    if (LOG_LEVELS.indexOf(level) > LOG_LEVELS.indexOf(currentLevel)) return;

    const timestamp = new Date().toISOString();
    const prefix =
        level === "error"
            ? "❌"
            : level === "warn"
                ? "⚠️"
                : level === "info"
                    ? "ℹ️"
                    : level === "debug"
                        ? "🐞"
                        : "🧠"; // verbose

    const color =
        level === "error"
            ? "\x1b[31m" // red
            : level === "warn"
                ? "\x1b[33m" // yellow
                : level === "info"
                    ? "\x1b[36m" // cyan
                    : level === "debug"
                        ? "\x1b[90m" // gray
                        : "\x1b[35m"; // magenta for verbose

    console.log(`${color}${prefix} [${level.toUpperCase()}] ${timestamp}: ${message}\x1b[0m`, ...args);
}
