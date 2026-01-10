/**
 * Asset Loader
 * 
 * Conditionally loads new CSS and JS assets based on feature flags
 * Migration Phase 3: Week 9
 */

(function() {
    'use strict';
    
    // Feature flags from server (injected via template)
    const featureFlags = window.FEATURE_FLAGS || {
        useNewCSS: false,
        useNewJS: false,
        useNewComponents: false,
        enableAll: false
    };
    
    /**
     * Load CSS file
     * @param {string} href - CSS file path
     * @param {string} id - Optional ID for the link element
     * @returns {Promise} Promise that resolves when CSS is loaded
     */
    function loadCSS(href, id = null) {
        return new Promise((resolve, reject) => {
            // Check if already loaded
            if (id && document.getElementById(id)) {
                resolve();
                return;
            }
            
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = href;
            if (id) link.id = id;
            
            link.onload = () => resolve();
            link.onerror = () => reject(new Error(`Failed to load CSS: ${href}`));
            
            document.head.appendChild(link);
        });
    }
    
    /**
     * Load JavaScript module
     * @param {string} src - JS file path
     * @param {Object} options - Load options { type: 'module', defer, async }
     * @returns {Promise} Promise that resolves when JS is loaded
     */
    function loadJS(src, options = {}) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.type = options.type || 'text/javascript';
            if (options.defer) script.defer = true;
            if (options.async) script.async = true;
            
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load JS: ${src}`));
            
            document.head.appendChild(script);
        });
    }
    
    /**
     * Load new CSS architecture files
     */
    async function loadNewCSS() {
        if (!featureFlags.useNewCSS && !featureFlags.enableAll) {
            return;
        }
        
        try {
            const cssFiles = [
                { href: '/assets/css/new/00-tokens.css', id: 'new-css-tokens' },
                { href: '/assets/css/new/01-base.css', id: 'new-css-base' },
                { href: '/assets/css/new/02-components/components.css', id: 'new-css-components' },
                { href: '/assets/css/new/03-layout.css', id: 'new-css-layout' },
                { href: '/assets/css/new/04-responsive.css', id: 'new-css-responsive' }
            ];
            
            // Load CSS files sequentially to maintain order
            for (const file of cssFiles) {
                try {
                    await loadCSS(file.href, file.id);
                    console.log(`[AssetLoader] Loaded CSS: ${file.href}`);
                } catch (error) {
                    console.warn(`[AssetLoader] Failed to load CSS: ${file.href}`, error);
                }
            }
        } catch (error) {
            console.error('[AssetLoader] Error loading new CSS:', error);
        }
    }
    
    /**
     * Load new JavaScript architecture files
     */
    async function loadNewJS() {
        if (!featureFlags.useNewJS && !featureFlags.enableAll) {
            return;
        }
        
        try {
            // Core utilities (load first)
            await loadJS('/assets/js/new/core/utils.js', { type: 'module' });
            console.log('[AssetLoader] Loaded: core/utils.js');
            
            // API client
            await loadJS('/assets/js/new/core/api-client.js', { type: 'module' });
            console.log('[AssetLoader] Loaded: core/api-client.js');
            
            // State manager
            await loadJS('/assets/js/new/core/state.js', { type: 'module' });
            console.log('[AssetLoader] Loaded: core/state.js');
            
            // Components (if enabled)
            if (featureFlags.useNewComponents || featureFlags.enableAll) {
                await loadJS('/assets/js/new/components/BaseComponent.js', { type: 'module' });
                console.log('[AssetLoader] Loaded: components/BaseComponent.js');
                
                await loadJS('/assets/js/new/components/UserCard.js', { type: 'module' });
                console.log('[AssetLoader] Loaded: components/UserCard.js');
            }
        } catch (error) {
            console.error('[AssetLoader] Error loading new JS:', error);
        }
    }
    
    /**
     * Initialize asset loading
     */
    async function init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                loadNewCSS();
                loadNewJS();
            });
        } else {
            await loadNewCSS();
            await loadNewJS();
        }
    }
    
    // Expose API
    window.AssetLoader = {
        loadCSS,
        loadJS,
        loadNewCSS,
        loadNewJS,
        featureFlags
    };
    
    // Auto-initialize
    init();
})();


