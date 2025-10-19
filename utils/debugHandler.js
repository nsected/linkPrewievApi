// utils/debugHandler.js
// Leveled, colorized logger.
// Levels (low->high verbosity): error < warn < info < debug < verbose
// Set current level via DEBUG_LEVEL env var, e.g. DEBUG_LEVEL=debug
// Note: debug() and verbose() both produce detailed output; verbose is the deepest.

const LOG_LEVELS = ["error", "warn", "info", "debug", "verbose"];
const DEFAULT_LEVEL = "info";
const currentLevel = (process.env.DEBUG_LEVEL || DEFAULT_LEVEL).toLowerCase();

/**
 * Internal: should we emit logs for `level` given currentLevel?
 */
function shouldLog(level) {
    const i = LOG_LEVELS.indexOf(level);
    const cur = LOG_LEVELS.indexOf(currentLevel);
    return i <= cur;
}

/**
 * Color and prefix mapping
 */
const LEVEL_META = {
    error: { prefix: "❌", color: "\x1b[31m" },   // red
    warn:  { prefix: "⚠️", color: "\x1b[33m" },   // yellow
    info:  { prefix: "ℹ️", color: "\x1b[36m" },   // cyan
    debug: { prefix: "🐞", color: "\x1b[90m" },   // gray
    verbose:{prefix: "🧠", color: "\x1b[35m" },   // magenta
};

const RESET = "\x1b[0m";

function ts() {
    return new Date().toISOString();
}

/**
 * Core formatter used by all exported helpers.
 * message may be string or template-like; args follow and are passed to console.appLog.
 */
function formatAndPrint(level, message, ...args) {
    if (!shouldLog(level)) return;
    const meta = LEVEL_META[level] || { prefix: "", color: "" };
    // allow passing objects as first arg without stringifying here - console.appLog handles them
    const header = `${meta.color}${meta.prefix} [${level.toUpperCase()}] ${ts()}:${RESET}`;
    // print header + message and rest args (keeps object formatting)
    console.log(`${header} ${message}`, ...args);
}

/**
 * Public API
 *
 * Note: maintain backward compatibility with previous usage:
 *   import { debug, info, warn, error, verbose } from "../utils/debugHandler.js";
 */
export function error(message, ...args) {
    formatAndPrint("error", message, ...args);
}

export function warn(message, ...args) {
    formatAndPrint("warn", message, ...args);
}

export function info(message, ...args) {
    formatAndPrint("info", message, ...args);
}

/**
 * debug and verbose are both "detailed"; verbose is deeper (activated only when DEBUG_LEVEL=verbose)
 * Use debug for step-by-step internal decisions. Use verbose for extreme detail (network bodies, full HTML dumps).
 */
export function debug(message, ...args) {
    return
    formatAndPrint("debug", message, ...args);
}

export function verbose(message, ...args) {
    formatAndPrint("verbose", message, ...args);
}

/*
// deprecated: legacy single debug() implementation (kept for reference).
// Previously we had one debug() that handled everything inline and used console.debug directly.
// Keeping it commented per rule "never delete, only mark deprecated".
//
// function legacyDebug(...args) {
//   console.debug("[parser]", ...args);
//}
*/

export default {
    error,
    warn,
    info,
    debug,
    verbose,
};
