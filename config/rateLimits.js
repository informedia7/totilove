/**
 * Shared HTTP + WebSocket rate-limit tuning (single source of truth for docs and imports).
 *
 * Policy (HTTP): see routers/middleware/rateLimiter.js — preset limiters are built after Redis init.
 * WebSocket chat messages: sliding window via Redis keys msg_rate_<userId> (per minute).
 */
module.exports = {
    /** WebSocket: max outgoing chat messages per sender per 60s window (normal load) */
    WS_CHAT_MESSAGES_PER_MINUTE_NORMAL: 25,
    /** WebSocket: stricter cap when monitoring reports high load */
    WS_CHAT_MESSAGES_PER_MINUTE_HIGH_LOAD: 10,
    WS_CHAT_RATE_WINDOW_SECONDS: 60
};
