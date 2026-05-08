(function (window, document) {
    'use strict';

    const DEFAULT_OPTIONS = {
        classTarget: null,
        dataTarget: null,
        debounce: 120
    };

    const ORIENTATION_CLASSES = ['orientation-portrait', 'orientation-landscape'];

    function dispatchOrientationEvent(payload) {
        try {
            window.dispatchEvent(new CustomEvent('talk:orientationchange', { detail: payload }));
        } catch (error) {
            if (typeof document.createEvent === 'function') {
                const legacyEvent = document.createEvent('CustomEvent');
                if (legacyEvent && legacyEvent.initCustomEvent) {
                    legacyEvent.initCustomEvent('talk:orientationchange', true, true, payload);
                    window.dispatchEvent(legacyEvent);
                }
            }
        }
    }

    class OrientationManager {
        constructor(options = {}) {
            if (!document || !document.body) {
                throw new Error('OrientationManager requires a document context.');
            }

            this.options = Object.assign({}, DEFAULT_OPTIONS, options);
            this.classTarget = this.options.classTarget || document.body;
            this.dataTarget = this.options.dataTarget || document.body;
            this.debounceDelay = Math.max(16, this.options.debounce || 0);
            this.orientation = null;
            this.pendingTimeout = null;
            this.mediaQuery = null;
            this.listenersAttached = false;

            this.boundScheduleChange = this.scheduleChange.bind(this);
            this.boundApply = this.applyDetectedOrientation.bind(this);

            this.bootstrap();
        }

        bootstrap() {
            this.applyOrientation(this.detectOrientation(), 'init');
            this.attach();
        }

        attach() {
            if (this.listenersAttached) {
                return;
            }

            if (window.matchMedia) {
                this.mediaQuery = window.matchMedia('(orientation: portrait)');
                if (this.mediaQuery.addEventListener) {
                    this.mediaQuery.addEventListener('change', this.boundScheduleChange);
                } else if (this.mediaQuery.addListener) {
                    this.mediaQuery.addListener(this.boundScheduleChange);
                }
            }

            window.addEventListener('resize', this.boundScheduleChange, { passive: true });
            window.addEventListener('orientationchange', this.boundScheduleChange, { passive: true });
            this.listenersAttached = true;
        }

        destroy() {
            if (this.mediaQuery) {
                if (this.mediaQuery.removeEventListener) {
                    this.mediaQuery.removeEventListener('change', this.boundScheduleChange);
                } else if (this.mediaQuery.removeListener) {
                    this.mediaQuery.removeListener(this.boundScheduleChange);
                }
            }

            window.removeEventListener('resize', this.boundScheduleChange);
            window.removeEventListener('orientationchange', this.boundScheduleChange);
            clearTimeout(this.pendingTimeout);
            this.listenersAttached = false;
        }

        detectOrientation() {
            if (window.screen && window.screen.orientation && window.screen.orientation.type) {
                return window.screen.orientation.type.startsWith('landscape') ? 'landscape' : 'portrait';
            }

            if (window.matchMedia) {
                if (window.matchMedia('(orientation: landscape)').matches) {
                    return 'landscape';
                }
                if (window.matchMedia('(orientation: portrait)').matches) {
                    return 'portrait';
                }
            }

            return window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
        }

        scheduleChange() {
            clearTimeout(this.pendingTimeout);
            this.pendingTimeout = setTimeout(this.boundApply, this.debounceDelay);
        }

        applyDetectedOrientation() {
            this.applyOrientation(this.detectOrientation(), 'change');
        }

        applyOrientation(nextOrientation, source = 'update') {
            if (!nextOrientation || nextOrientation === this.orientation) {
                return;
            }

            this.orientation = nextOrientation;
            const normalized = nextOrientation === 'landscape' ? 'LANDSCAPE' : 'PORTRAIT';

            if (this.classTarget) {
                ORIENTATION_CLASSES.forEach((cls) => this.classTarget.classList.remove(cls));
                this.classTarget.classList.add(`orientation-${nextOrientation}`);
            }

            if (document.body && this.classTarget !== document.body) {
                ORIENTATION_CLASSES.forEach((cls) => document.body.classList.remove(cls));
                document.body.classList.add(`orientation-${nextOrientation}`);
            }

            if (this.dataTarget) {
                this.dataTarget.dataset.orientation = normalized;
            }

            if (document.body && this.dataTarget !== document.body) {
                document.body.dataset.orientation = normalized;
            }

            dispatchOrientationEvent({ orientation: normalized, source });
        }
    }

    window.OrientationManager = window.OrientationManager || OrientationManager;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = OrientationManager;
    }
})(window, document);
