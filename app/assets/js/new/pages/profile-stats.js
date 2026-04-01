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
        'messagesSent',
        'messagesReceived',
        'matchesTotal'
    ];

    numericFields.forEach((field) => setText(field, '0'));

    syncMatchesStatWithMatchesPage();

    async function syncMatchesStatWithMatchesPage() {
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

            const tokenParam = sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : '';
            const response = await fetch(`/api/matches/${userId}${tokenParam}`, {
                credentials: 'same-origin',
                headers
            });

            if (!response.ok) {
                return;
            }

            const payload = await response.json();
            if (!payload.success || !Array.isArray(payload.matches)) {
                return;
            }

            stats.matchesTotal = payload.matches.length;
            setText('matchesTotal');
        } catch (error) {
            // Swallow errors silently; stats fallback already rendered
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
