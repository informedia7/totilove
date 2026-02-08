(function (window, document) {
    'use strict';

    const DEFAULTS = {
        container: null,
        containerSelector: '.main-content',
        minDistance: 80,
        maxDuration: 600,
        verticalThreshold: 90,
        horizontalLockThreshold: 14,
        maxWidth: 768,
        ignoreAttribute: 'data-disable-swipe',
        ignoreSelectors: ['.search-panel.show', '.modal.show'],
        hasActiveConversation: null,
        onShowChat: null,
        onShowList: null
    };

    function supportsTouch() {
        return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }

    function getTouchByIdentifier(touchList, identifier) {
        if (identifier === null || typeof identifier === 'undefined') {
            return touchList[0] || null;
        }
        for (let index = 0; index < touchList.length; index += 1) {
            const touch = touchList[index];
            if (touch.identifier === identifier) {
                return touch;
            }
        }
        return null;
    }

    class SwipeManager {
        constructor(options = {}) {
            this.options = Object.assign({}, DEFAULTS, options);
            this.container = this.options.container || document.querySelector(this.options.containerSelector);
            this.enabled = Boolean(this.container) && supportsTouch();

            this.touchIdentifier = null;
            this.startX = null;
            this.startY = null;
            this.startTime = null;
            this.swipeLocked = false;
            this.active = false;

            this.onTouchStart = this.onTouchStart.bind(this);
            this.onTouchMove = this.onTouchMove.bind(this);
            this.onTouchEnd = this.onTouchEnd.bind(this);
            this.onTouchCancel = this.onTouchCancel.bind(this);

            if (this.enabled) {
                this.attach();
            }
        }

        attach() {
            if (!this.container) {
                return;
            }
            this.container.addEventListener('touchstart', this.onTouchStart, { passive: true });
            this.container.addEventListener('touchmove', this.onTouchMove, { passive: false });
            this.container.addEventListener('touchend', this.onTouchEnd, { passive: true });
            this.container.addEventListener('touchcancel', this.onTouchCancel, { passive: true });
        }

        detach() {
            if (!this.container) {
                return;
            }
            this.container.removeEventListener('touchstart', this.onTouchStart);
            this.container.removeEventListener('touchmove', this.onTouchMove);
            this.container.removeEventListener('touchend', this.onTouchEnd);
            this.container.removeEventListener('touchcancel', this.onTouchCancel);
        }

        destroy() {
            this.detach();
            this.resetGesture();
            this.enabled = false;
        }

        shouldHandle() {
            return this.enabled && window.innerWidth <= this.options.maxWidth;
        }

        resetGesture() {
            this.touchIdentifier = null;
            this.startX = null;
            this.startY = null;
            this.startTime = null;
            this.swipeLocked = false;
            this.active = false;
        }

        matchesIgnoredTarget(target) {
            if (!target || !target.closest) {
                return false;
            }
            if (target.closest(`[${this.options.ignoreAttribute}="true"]`)) {
                return true;
            }
            if (Array.isArray(this.options.ignoreSelectors)) {
                return this.options.ignoreSelectors.some((selector) => selector && target.closest(selector));
            }
            return false;
        }

        onTouchStart(event) {
            if (!this.shouldHandle() || event.touches.length !== 1 || this.matchesIgnoredTarget(event.target)) {
                this.resetGesture();
                return;
            }

            const touch = event.touches[0];
            this.touchIdentifier = touch.identifier;
            this.startX = touch.clientX;
            this.startY = touch.clientY;
            this.startTime = performance.now();
            this.swipeLocked = false;
            this.active = true;
        }

        onTouchMove(event) {
            if (!this.active || !this.shouldHandle()) {
                return;
            }

            const touch = getTouchByIdentifier(event.touches, this.touchIdentifier);
            if (!touch) {
                return;
            }

            const deltaX = touch.clientX - this.startX;
            const deltaY = touch.clientY - this.startY;

            if (!this.swipeLocked) {
                if (Math.abs(deltaY) > Math.abs(deltaX) || Math.abs(deltaY) > this.options.verticalThreshold) {
                    this.resetGesture();
                    return;
                }
                if (Math.abs(deltaX) > this.options.horizontalLockThreshold) {
                    this.swipeLocked = true;
                }
            }

            if (this.swipeLocked) {
                event.preventDefault();
            }
        }

        onTouchEnd(event) {
            if (!this.active || !this.shouldHandle()) {
                this.resetGesture();
                return;
            }

            const touch = getTouchByIdentifier(event.changedTouches, this.touchIdentifier);
            if (!touch || !this.swipeLocked) {
                this.resetGesture();
                return;
            }

            const elapsed = performance.now() - this.startTime;
            if (elapsed > this.options.maxDuration) {
                this.resetGesture();
                return;
            }

            const deltaX = touch.clientX - this.startX;
            if (Math.abs(deltaX) >= this.options.minDistance) {
                if (deltaX > 0) {
                    this.handleSwipeRight();
                } else {
                    this.handleSwipeLeft();
                }
            }

            this.resetGesture();
        }

        onTouchCancel() {
            this.resetGesture();
        }

        handleSwipeLeft() {
            if (typeof this.options.hasActiveConversation === 'function' && !this.options.hasActiveConversation()) {
                return;
            }
            if (typeof this.options.onShowChat === 'function') {
                this.options.onShowChat();
            }
        }

        handleSwipeRight() {
            if (typeof this.options.onShowList === 'function') {
                this.options.onShowList();
            }
        }
    }

    window.SwipeManager = window.SwipeManager || SwipeManager;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = SwipeManager;
    }
})(window, document);
