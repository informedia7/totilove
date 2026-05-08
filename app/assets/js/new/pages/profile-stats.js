(function () {
    const dataNode = document.getElementById('profile-stats-data');
    if (!dataNode) {
        return;
    }

    const raw = (dataNode.textContent || dataNode.innerText || '').trim();
    let stats = {};

    if (raw) {
        try {
            stats = JSON.parse(raw);
        } catch (error) {
            stats = {};
        }
    }

    if (Array.isArray(stats)) {
        stats = {};
    }

    const setText = (field, fallback) => {
        const nodes = document.querySelectorAll(`[data-stat-field="${field}"]`);
        if (!nodes.length) {
            return;
        }
        const value = stats[field];
        const hasValue = value !== null && value !== undefined && value !== '';
        if (!hasValue && fallback === undefined) {
            return;
        }
        const displayValue = hasValue ? value : fallback;
        nodes.forEach((el) => {
            el.textContent = displayValue;
        });
    };

    const numericFields = [
        'profileViews',
        'likesReceived',
        'favoritesCount',
        'messagesSent',
        'messagesReceived',
        'matchesTotal'
    ];

    numericFields.forEach((field) => setText(field, '0'));

    syncMatchesStatWithMatcherEndpoint();

    async function syncMatchesStatWithMatcherEndpoint() {
        const userId = getCurrentUserId();
        if (!userId) {
            return;
        }

        try {
            const sessionToken = getSessionToken();
            const headers = {};

            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`;
                headers['X-Session-Token'] = sessionToken;
            }

            const queryParams = new URLSearchParams({ include_total: 'true' });
            if (sessionToken) {
                queryParams.set('token', sessionToken);
            }

            const fetchUrl = `/api/matches/${userId}?${queryParams.toString()}`;
            const response = await fetch(fetchUrl, {
                credentials: 'same-origin',
                headers
            });

            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            const totalFromMatcher = Number(payload?.pagination?.total);

            if (payload?.success && Number.isFinite(totalFromMatcher)) {
                stats.matchesTotal = totalFromMatcher;
                setText('matchesTotal');
            }
        } catch (error) {
            // Keep server-rendered value if matcher sync fails.
        }
    }

    function getCurrentUserId() {
        if (window.currentUser && window.currentUser.id) {
            return window.currentUser.id;
        }

        const body = document.body;
        const fallbackId = body ? body.getAttribute('data-user-id') : null;
        return fallbackId && fallbackId !== 'null' && fallbackId !== ''
            ? parseInt(fallbackId, 10)
            : null;
    }

    function getSessionToken() {
        const urlToken = new URLSearchParams(window.location.search).get('token');
        if (urlToken) {
            return urlToken;
        }

        if (typeof window.getSessionToken === 'function') {
            const tokenFromWindow = window.getSessionToken();
            if (tokenFromWindow) {
                return tokenFromWindow;
            }
        }

        if (window.sessionToken) {
            return window.sessionToken;
        }

        const cookies = document.cookie ? document.cookie.split(';') : [];
        for (const rawCookie of cookies) {
            const trimmed = rawCookie.trim();
            if (!trimmed) {
                continue;
            }

            if (trimmed.startsWith('sessionToken=')) {
                return decodeURIComponent(trimmed.slice('sessionToken='.length));
            }

            if (trimmed.startsWith('session=')) {
                return decodeURIComponent(trimmed.slice('session='.length));
            }
        }

        return null;
    }

})();
