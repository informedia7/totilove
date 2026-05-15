/**
 * Public footer/legal pages: run i18n init (uses same language as global navbar via localStorage).
 * Syncs copyright year.
 *
 * Runs on DOMContentLoaded or immediately if the document is already past that (scripts at end of body).
 */
(function () {
    async function startFooterI18n() {
        if (window.__totiloveFooterI18nStarted) {
            return;
        }
        window.__totiloveFooterI18nStarted = true;
        try {
            if (window.simpleI18n && typeof window.simpleI18n.init === 'function') {
                await window.simpleI18n.init();
            }
        } catch (e) {
            // i18n init failed — page keeps default HTML
        }
        var y = document.getElementById('fp-year');
        if (y) {
            y.textContent = new Date().getFullYear();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startFooterI18n);
    } else {
        startFooterI18n();
    }
})();
