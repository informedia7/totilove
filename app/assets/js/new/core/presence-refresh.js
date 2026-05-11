// PresenceRefresh: keeps "Last active X..." text fresh without refetching.
// Works by re-rendering already-bound presence indicators using cached status.
(function (window) {
    'use strict';

    function resolveIntervalMs(value, fallback) {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.max(1000, Math.round(n));
    }

    function safeGetPresence() {
        return window.Presence || null;
    }

    /**
     * Starts a timer that re-renders the given presence-bound element so
     * relative time strings (e.g. "Last active 2m ago") stay up-to-date.
     *
     * @param {number} userId
     * @param {Element} element
     * @param {object} options
     * @returns {function} stop() cleanup function
     */
    function startAutoRefreshStatus(userId, element, options = {}) {
        const presence = safeGetPresence();
        const numericUserId = Number(userId);
        if (!presence || !element || !element.isConnected || !Number.isFinite(numericUserId)) {
            return function stopNoop() {};
        }

        const intervalMs = resolveIntervalMs(options.intervalMs, 15000);
        const refresh = () => {
            try {
                const p = safeGetPresence();
                if (!p || !element.isConnected) {
                    return;
                }
                if (typeof p.getCachedStatus !== 'function' || typeof p.renderElement !== 'function') {
                    return;
                }
                const cached = p.getCachedStatus(numericUserId);
                if (cached) {
                    p.renderElement(element, cached);
                }
            } catch (_error) {
                // noop
            }
        };

        // Render once immediately so UI is consistent.
        refresh();

        const timer = window.setInterval(refresh, intervalMs);

        return function stop() {
            try {
                window.clearInterval(timer);
            } catch (_error) {
                // noop
            }
        };
    }

    window.PresenceRefresh = window.PresenceRefresh || {};
    window.PresenceRefresh.startAutoRefreshStatus = startAutoRefreshStatus;
})(window);

