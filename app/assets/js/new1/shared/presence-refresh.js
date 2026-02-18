(function (window, document) {
    'use strict';

    const DEFAULT_INTERVAL = 30000;

    function hasLiveSocket() {
        const presence = window.Presence;
        if (!presence) return false;
        const socket = presence.socket;
        return !!(socket && socket.connected);
    }

    function resolveElement(target) {
        if (typeof target === 'string') {
            return document.getElementById(target);
        }
        return target || null;
    }

    function startAutoRefreshStatus(userId, target, options = {}) {
        const presence = window.Presence;
        if (!presence) {
            console.warn('PresenceRefresh: window.Presence is not available.');
            return () => {};
        }

        const element = resolveElement(target);
        const id = parseInt(userId, 10);
        if (!id || Number.isNaN(id)) {
            console.warn('PresenceRefresh: invalid user id for auto refresh.');
            return () => {};
        }

        if (element) {
            presence.bindIndicator(element, id, options.indicatorOptions || options);
        }

        const interval = options.interval || DEFAULT_INTERVAL;
        const forceRefresh = options.forceRefresh !== false;

        let intervalId = null;
        let stopped = false;

        const visibilityHandler = () => {
            if (document.hidden) {
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            } else {
                refresh(true);
                ensureInterval();
            }
        };

        async function refresh(force = false) {
            if (stopped) return;
            if (document.hidden) return;
            if (hasLiveSocket()) return;
            try {
                await presence.requestStatus(id, {
                    forceRefresh: force || forceRefresh
                });
            } catch (error) {
                console.warn(`PresenceRefresh: failed to refresh status for ${id}`, error.message);
            }
        }

        function ensureInterval() {
            if (intervalId || interval <= 0) return;
            intervalId = setInterval(() => refresh(true), interval);
        }

        document.addEventListener('visibilitychange', visibilityHandler);
        refresh(true);
        ensureInterval();

        return () => {
            stopped = true;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            document.removeEventListener('visibilitychange', visibilityHandler);
        };
    }

    function autoRefreshMultiple(entries = [], options = {}) {
        const presence = window.Presence;
        if (!presence) {
            console.warn('PresenceRefresh: window.Presence is not available.');
            return () => {};
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return () => {};
        }

        const resolvedEntries = entries
            .map(entry => {
                const id = parseInt(entry.userId, 10);
                const element = resolveElement(entry.target);
                if (!id || Number.isNaN(id) || !element) {
                    return null;
                }
                const indicatorOptions = entry.options || options.indicatorOptions || {};
                presence.bindIndicator(element, id, indicatorOptions);
                return { id };
            })
            .filter(Boolean);

        if (resolvedEntries.length === 0) {
            return () => {};
        }

        const interval = options.interval || DEFAULT_INTERVAL;
        const forceRefresh = options.forceRefresh !== false;

        let intervalId = null;
        let stopped = false;

        const visibilityHandler = () => {
            if (document.hidden) {
                if (intervalId) {
                    clearInterval(intervalId);
                    intervalId = null;
                }
            } else {
                refresh(true);
                ensureInterval();
            }
        };

        async function refresh(force = false) {
            if (stopped) return;
            if (document.hidden) return;
            if (hasLiveSocket()) return;
            const ids = resolvedEntries.map(item => item.id);
            if (!ids.length) return;
            try {
                await presence.requestStatuses(ids, {
                    forceRefresh: force || forceRefresh
                });
            } catch (error) {
                console.warn('PresenceRefresh: failed to refresh multiple statuses', error.message);
            }
        }

        function ensureInterval() {
            if (intervalId || interval <= 0) return;
            intervalId = setInterval(() => refresh(true), interval);
        }

        document.addEventListener('visibilitychange', visibilityHandler);
        refresh(true);
        ensureInterval();

        return () => {
            stopped = true;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
            document.removeEventListener('visibilitychange', visibilityHandler);
        };
    }

    window.PresenceRefresh = {
        AUTO_REFRESH_INTERVAL: DEFAULT_INTERVAL,
        startAutoRefreshStatus,
        autoRefreshMultiple
    };
})(window, document);
