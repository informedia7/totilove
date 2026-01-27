(function () {
    const CORE_MODULES = [
        '/assets/js/new/pages/talk/talk_config.js',
        '/assets/js/new/pages/talk/talk_utils.js',
        '/assets/js/new/pages/talk/talk_state.js',
        '/assets/js/new/pages/talk/conversations/talk_conversation-list-loader.js',
        '/assets/js/new/pages/talk/conversations/talk_conversation-list-renderer.js',
        '/assets/js/new/pages/talk/conversations/talk_conversation-list-selector.js',
        '/assets/js/new/pages/talk/messages/talk_message-loader.js',
        '/assets/js/new/pages/talk/messages/talk_message-factory.js',
        '/assets/js/new/pages/talk/messages/talk_message-renderer.js',
        '/assets/js/new/pages/talk/messages/talk_message-pagination.js',
        '/assets/js/new/pages/talk/messages/talk_message-actions.js',
        '/assets/js/new/pages/talk/messages/talk_message-validator.js',
        '/assets/js/new/pages/talk/messages/talk_message-sender.js',
        '/assets/js/new/pages/talk/messages/talk_message-save.js',
        '/assets/js/new/pages/talk/messages/talk_message-recall.js',
        '/assets/js/new/pages/talk/websocket/talk_socket-manager.js',
        '/assets/js/new/pages/talk/websocket/talk_realtime-messaging.js',
        '/assets/js/new/pages/talk/websocket/talk_typing-indicator.js',
        '/assets/js/new/pages/talk/talk_style-registry.js',
        '/assets/js/new/pages/talk/talk_block-manager.js',
        '/assets/js/new/pages/talk/conversations/talk_conversation-list-remover.js',
        '/assets/js/new/pages/talk/talk_app-init.js'
    ];

    const DEFERRED_MODULES = [
        '/assets/js/new/pages/talk/search/talk_search-controller.js',
        '/assets/js/new/pages/talk/search/talk_search-panel-module.js',
        '/assets/js/new/pages/talk/search/talk_search-filters-module.js',
        '/assets/js/new/pages/talk/search/talk_search-results-module.js',
        '/assets/js/new/pages/talk/search/talk_search-ui-module.js',
        '/assets/js/new/pages/talk/search/talk_search-main.js',
        '/assets/js/new/pages/talk/images/talk_image-compressor.js',
        '/assets/js/new/pages/talk/images/talk_image-handler.js',
        '/assets/js/new/pages/talk/images/talk_image-preview.js'
    ];

    const scriptCache = new Map();
    const supportsPreload = (() => {
        const link = document.createElement('link');
        return !!(link.relList && link.relList.supports && link.relList.supports('preload'));
    })();

    function appendTarget() {
        return document.head || document.body || document.documentElement;
    }

    function preloadScripts(list) {
        if (!supportsPreload || !Array.isArray(list) || list.length === 0) {
            return;
        }

        list.forEach((src) => {
            if (!src || document.querySelector(`link[data-talk-preload="${src}"]`)) {
                return;
            }

            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = src;
            link.dataset.talkPreload = src;
            appendTarget().appendChild(link);
        });
    }

    preloadScripts(CORE_MODULES);

    function loadScript(src) {
        if (scriptCache.has(src)) {
            return scriptCache.get(src);
        }

        const promise = new Promise((resolve, reject) => {
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing && existing.dataset.loaded === 'true') {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.async = false;
            script.dataset.talkLoader = 'true';
            script.onload = () => {
                script.dataset.loaded = 'true';
                resolve();
            };
            script.onerror = () => {
                reject(new Error(`Failed to load ${src}`));
            };
            appendTarget().appendChild(script);
        });

        scriptCache.set(src, promise);
        return promise;
    }

    function loadScriptsSequentially(list) {
        return list.reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve());
    }

    function whenIdle(callback) {
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(callback, { timeout: 2000 });
        } else {
            setTimeout(callback, 0);
        }
    }

    whenIdle(() => preloadScripts(DEFERRED_MODULES));

    function toggleAppLoading(isLoading) {
        const container = document.querySelector('.app-container');
        if (!container) {
            return;
        }

        if (isLoading) {
            container.setAttribute('aria-busy', 'true');
            container.dataset.talkReady = 'false';
            container.dataset.prevOpacity = container.style.opacity || '';
            container.dataset.prevPointer = container.style.pointerEvents || '';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
            if (!container.style.transition) {
                container.style.transition = 'opacity 0.25s ease';
            }
        } else {
            container.setAttribute('aria-busy', 'false');
            container.dataset.talkReady = 'true';
            container.style.opacity = container.dataset.prevOpacity || '';
            container.style.pointerEvents = container.dataset.prevPointer || '';
            delete container.dataset.prevOpacity;
            delete container.dataset.prevPointer;
        }
    }

    const coreModulesPromise = loadScriptsSequentially(CORE_MODULES);

    const talkBootstrap = window.talkBootstrap || {};
    talkBootstrap.coreReady = coreModulesPromise;
    window.talkBootstrap = talkBootstrap;
    window.__talkCoreModulesReady = coreModulesPromise;

    let resolveAppReady;
    let rejectAppReady;
    talkBootstrap.appReady = new Promise((resolve, reject) => {
        resolveAppReady = resolve;
        rejectAppReady = reject;
    });

    async function bootstrapTalk() {
        toggleAppLoading(true);

        try {
            await coreModulesPromise;
            if (typeof window.initApp === 'function') {
                await window.initApp();
            }
            resolveAppReady();
        } catch (error) {
            rejectAppReady(error);
            console.error('[Talk] Failed to initialize chat', error);
            if (typeof window.showNotification === 'function') {
                window.showNotification('Chat failed to load. Please refresh the page.', 'error');
            }
            toggleAppLoading(false);
            return;
        }

        toggleAppLoading(false);

        whenIdle(() => {
            const deferredPromise = loadScriptsSequentially(DEFERRED_MODULES).catch((error) => {
                console.error('[Talk] Deferred module load failed', error);
            });
            talkBootstrap.deferredReady = deferredPromise;

            if (typeof window.setupSmartRefresh === 'function') {
                try {
                    window.setupSmartRefresh();
                } catch (error) {
                    console.error('[Talk] Failed to start smart refresh', error);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrapTalk, { once: true });
    } else {
        bootstrapTalk();
    }
})();
