(function (window, document) {
    'use strict';

    const DEFAULTS = {
        root: null,
        attributeTarget: null,
        scrollContainer: null,
        focusSelectors: ['#messageInput', 'textarea', 'input', '[contenteditable="true"]'],
        minKeyboardHeight: 80,
        fallbackHeight: 260
    };

    function matchesSelector(element, selectors) {
        if (!element || typeof element.matches !== 'function') {
            return false;
        }
        return selectors.some((selector) => {
            try {
                return selector ? element.matches(selector) : false;
            } catch (error) {
                return false;
            }
        });
    }

    class KeyboardManager {
        constructor(options = {}) {
            if (!document || !document.documentElement) {
                throw new Error('KeyboardManager requires a document context.');
            }

            this.options = Object.assign({}, DEFAULTS, options);
            this.root = this.options.root || document.documentElement;
            this.attributeTarget = this.options.attributeTarget || document.body;
            this.scrollContainer = this.options.scrollContainer || document.getElementById('messagesArea');
            this.focusSelectors = Array.isArray(this.options.focusSelectors) ? this.options.focusSelectors : DEFAULTS.focusSelectors;
            this.minKeyboardHeight = Math.max(0, this.options.minKeyboardHeight || DEFAULTS.minKeyboardHeight);
            this.fallbackHeight = Math.max(0, this.options.fallbackHeight || DEFAULTS.fallbackHeight);

            this.viewport = window.visualViewport || null;
            this.baseViewportHeight = this.getViewportHeight();
            this.keyboardVisible = false;
            this.focusedInput = false;
            this.lastHeight = 0;

            this.boundViewportChange = this.handleViewportChange.bind(this);
            this.boundFocusIn = this.handleFocusIn.bind(this);
            this.boundFocusOut = this.handleFocusOut.bind(this);
            this.boundOrientationReset = this.resetBaseViewport.bind(this);

            this.attach();
            this.applyKeyboardState(false, 0);
        }

        attach() {
            if (this.viewport) {
                this.viewport.addEventListener('resize', this.boundViewportChange);
                this.viewport.addEventListener('scroll', this.boundViewportChange);
            } else {
                window.addEventListener('resize', this.boundViewportChange);
            }

            window.addEventListener('focusin', this.boundFocusIn);
            window.addEventListener('focusout', this.boundFocusOut);
            window.addEventListener('talk:orientationchange', this.boundOrientationReset);
        }

        destroy() {
            if (this.viewport) {
                this.viewport.removeEventListener('resize', this.boundViewportChange);
                this.viewport.removeEventListener('scroll', this.boundViewportChange);
            } else {
                window.removeEventListener('resize', this.boundViewportChange);
            }

            window.removeEventListener('focusin', this.boundFocusIn);
            window.removeEventListener('focusout', this.boundFocusOut);
            window.removeEventListener('talk:orientationchange', this.boundOrientationReset);
        }

        getViewportHeight() {
            if (this.viewport && typeof this.viewport.height === 'number') {
                return this.viewport.height;
            }
            return window.innerHeight;
        }

        resetBaseViewport() {
            this.baseViewportHeight = this.getViewportHeight();
            setTimeout(() => this.handleViewportChange(), 50);
        }

        handleFocusIn(event) {
            if (!matchesSelector(event.target, this.focusSelectors)) {
                return;
            }
            this.focusedInput = true;
            this.scrollContainer = this.options.scrollContainer || document.getElementById('messagesArea');
            this.handleViewportChange();
        }

        handleFocusOut(event) {
            if (!matchesSelector(event.target, this.focusSelectors)) {
                return;
            }
            this.focusedInput = false;
            setTimeout(() => {
                if (!this.focusedInput) {
                    this.applyKeyboardState(false, 0);
                    this.baseViewportHeight = this.getViewportHeight();
                }
            }, 120);
        }

        handleViewportChange() {
            if (!this.focusedInput) {
                this.applyKeyboardState(false, 0);
                this.baseViewportHeight = this.getViewportHeight();
                return;
            }

            const currentHeight = this.getViewportHeight();
            if (!this.keyboardVisible || currentHeight > this.baseViewportHeight) {
                this.baseViewportHeight = currentHeight;
            }

            const delta = Math.max(0, this.baseViewportHeight - currentHeight);
            const effectiveHeight = delta > this.minKeyboardHeight
                ? delta
                : (!this.viewport ? this.fallbackHeight : 0);

            if (effectiveHeight > 0) {
                this.applyKeyboardState(true, effectiveHeight);
            } else {
                this.applyKeyboardState(false, 0);
            }
        }

        applyKeyboardState(isVisible, height) {
            if (this.keyboardVisible === isVisible && Math.abs(this.lastHeight - height) < 1) {
                return;
            }

            this.keyboardVisible = isVisible;
            this.lastHeight = height;
            const cssValue = `${Math.max(0, Math.round(isVisible ? height : 0))}px`;

            if (this.root) {
                this.root.style.setProperty('--keyboard-height', cssValue);
            }

            if (this.attributeTarget) {
                this.attributeTarget.dataset.keyboard = isVisible ? 'open' : 'closed';
                this.attributeTarget.classList.toggle('keyboard-open', isVisible);
            }

            if (isVisible && this.scrollContainer) {
                const raf = typeof window.requestAnimationFrame === 'function'
                    ? window.requestAnimationFrame.bind(window)
                    : (callback) => setTimeout(callback, 16);
                raf(() => {
                    if (this.scrollContainer) {
                        this.scrollContainer.scrollTop = this.scrollContainer.scrollHeight;
                    }
                });
            }
        }
    }

    window.KeyboardManager = window.KeyboardManager || KeyboardManager;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = KeyboardManager;
    }
})(window, document);
