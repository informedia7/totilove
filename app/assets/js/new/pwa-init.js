/**
 * PWA Initialization
 * 
 * Registers service worker and handles PWA installation
 * Migration Phase 3: Week 11
 */

(function() {
    'use strict';
    
    // Check if service workers are supported
    if ('serviceWorker' in navigator) {
        // Register service worker
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('/assets/js/new/service-worker.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered:', registration.scope);
                    
                    // Check for updates
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New service worker available
                                console.log('[PWA] New service worker available');
                                // Optionally show update notification
                            }
                        });
                    });
                })
                .catch((error) => {
                    console.warn('[PWA] Service Worker registration failed:', error);
                });
        });
        
        // Listen for service worker updates
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            console.log('[PWA] Service Worker controller changed - reloading page');
            window.location.reload();
        });
    }
    
    // Handle PWA install prompt
    let deferredPrompt;
    
    window.addEventListener('beforeinstallprompt', (e) => {
        // Store the event for later use
        deferredPrompt = e;
        
        // Check if we should show custom install button or let browser handle it
        // Only prevent default if we have a custom install button
        const installButton = document.getElementById('pwa-install-button');
        if (installButton) {
            // Prevent the mini-infobar from appearing if we have custom button
            e.preventDefault();
            
            // Show custom install button
            installButton.style.display = 'block';
            installButton.addEventListener('click', () => {
                // Show the install prompt
                deferredPrompt.prompt();
                
                // Wait for user response
                deferredPrompt.userChoice.then((choiceResult) => {
                    if (choiceResult.outcome === 'accepted') {
                        console.log('[PWA] User accepted install prompt');
                    } else {
                        console.log('[PWA] User dismissed install prompt');
                    }
                    
                    deferredPrompt = null;
                    if (installButton) {
                        installButton.style.display = 'none';
                    }
                });
            });
        } else {
            // No custom button - let browser show its own install banner
            // Don't prevent default, browser will handle it
            console.log('[PWA] Install prompt available - browser will show install banner');
        }
    });
    
    // Track if app is installed
    window.addEventListener('appinstalled', () => {
        console.log('[PWA] App installed');
        deferredPrompt = null;
    });
    
    // Check if app is running in standalone mode (installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
        document.documentElement.classList.add('pwa-installed');
    }
    
    // Expose PWA API
    window.PWA = {
        install: () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
            }
        },
        isInstalled: () => {
            return window.matchMedia('(display-mode: standalone)').matches ||
                   window.navigator.standalone ||
                   document.referrer.includes('android-app://');
        }
    };
})();


