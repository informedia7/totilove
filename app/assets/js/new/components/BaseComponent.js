/**
 * BaseComponent
 * 
 * Base class for all components providing common functionality:
 * - Lifecycle management (init, mount, unmount, destroy)
 * - Event delegation
 * - DOM utilities
 * - State management
 * Migration Phase 2: Week 6
 */

import { debounce, throttle } from '../core/utils.js';

export class BaseComponent {
    /**
     * @param {Object} config - Component configuration
     * @param {HTMLElement|string} config.container - Container element or selector
     * @param {Object} config.events - Event handlers
     * @param {boolean} config.autoInit - Auto-initialize on construction
     */
    constructor(config = {}) {
        this.config = {
            autoInit: true,
            ...config
        };
        
        this.container = null;
        this.events = new Map();
        this.observers = [];
        this.timers = [];
        this.isDestroyed = false;
        this.state = {};
        
        // Bind methods
        this.handleEvent = this.handleEvent.bind(this);
        
        if (this.config.autoInit) {
            this.init();
        }
    }
    
    /**
     * Initialize component
     * Override in subclasses
     */
    async init() {
        if (this.config.container) {
            this.container = typeof this.config.container === 'string' 
                ? document.querySelector(this.config.container)
                : this.config.container;
        }
        
        if (this.config.events) {
            this.setupEvents(this.config.events);
        }
        
        // Call lifecycle hook
        await this.onInit();
    }
    
    /**
     * Lifecycle hook: Called after initialization
     * Override in subclasses
     */
    async onInit() {
        // Override in subclasses
    }
    
    /**
     * Mount component to DOM
     * @param {HTMLElement|string} container - Container element or selector
     */
    mount(container) {
        if (typeof container === 'string') {
            container = document.querySelector(container);
        }
        
        if (!container) {
            console.warn(`[${this.constructor.name}] Container not found`);
            return;
        }
        
        this.container = container;
        this.onMount();
    }
    
    /**
     * Lifecycle hook: Called after mounting
     * Override in subclasses
     */
    onMount() {
        // Override in subclasses
    }
    
    /**
     * Unmount component from DOM
     */
    unmount() {
        this.cleanup();
        this.onUnmount();
    }
    
    /**
     * Lifecycle hook: Called after unmounting
     * Override in subclasses
     */
    onUnmount() {
        // Override in subclasses
    }
    
    /**
     * Destroy component and clean up resources
     */
    destroy() {
        if (this.isDestroyed) return;
        
        this.cleanup();
        this.onDestroy();
        this.isDestroyed = true;
    }
    
    /**
     * Lifecycle hook: Called before destruction
     * Override in subclasses
     */
    onDestroy() {
        // Override in subclasses
    }
    
    /**
     * Clean up event listeners, observers, timers
     */
    cleanup() {
        // Remove event listeners
        this.events.forEach((handler, event) => {
            const [target, eventName] = this.parseEventKey(event);
            if (target) {
                target.removeEventListener(eventName, handler);
            }
        });
        this.events.clear();
        
        // Disconnect observers
        this.observers.forEach(observer => {
            if (observer && typeof observer.disconnect === 'function') {
                observer.disconnect();
            }
        });
        this.observers = [];
        
        // Clear timers
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers = [];
    }
    
    /**
     * Setup event delegation
     * @param {HTMLElement} container - Container element
     * @param {Object} handlers - Event handlers map { selector: handler }
     */
    setupEventDelegation(container, handlers) {
        if (!container) {
            container = this.container;
        }
        
        if (!container) {
            console.warn(`[${this.constructor.name}] No container for event delegation`);
            return;
        }
        
        Object.entries(handlers).forEach(([selector, handler]) => {
            container.addEventListener('click', (e) => {
                const target = e.target.closest(selector);
                if (target) {
                    handler.call(this, e, target);
                }
            });
        });
    }
    
    /**
     * Setup events
     * @param {Object} events - Event handlers { 'event selector': handler }
     */
    setupEvents(events) {
        Object.entries(events).forEach(([key, handler]) => {
            const [target, eventName] = this.parseEventKey(key);
            if (target && eventName) {
                const boundHandler = handler.bind(this);
                target.addEventListener(eventName, boundHandler);
                this.events.set(key, boundHandler);
            }
        });
    }
    
    /**
     * Parse event key (e.g., 'click .button' or 'window:resize')
     * @param {string} key - Event key
     * @returns {[HTMLElement|Window, string]} [target, eventName]
     */
    parseEventKey(key) {
        const parts = key.split(':');
        if (parts.length === 2) {
            const [targetName, eventName] = parts;
            if (targetName === 'window') {
                return [window, eventName];
            } else if (targetName === 'document') {
                return [document, eventName];
            }
        }
        
        // Default to container
        return [this.container, key];
    }
    
    /**
     * Generic event handler
     * @param {Event} event - Event object
     */
    handleEvent(event) {
        // Override in subclasses
    }
    
    /**
     * Set component state
     * @param {Object} newState - New state object
     * @param {Function} callback - Callback after state update
     */
    setState(newState, callback) {
        this.state = { ...this.state, ...newState };
        this.onStateChange(this.state);
        if (callback) callback();
    }
    
    /**
     * Get component state
     * @returns {Object} Current state
     */
    getState() {
        return { ...this.state };
    }
    
    /**
     * Lifecycle hook: Called when state changes
     * Override in subclasses
     * @param {Object} state - New state
     */
    onStateChange(state) {
        // Override in subclasses
    }
    
    /**
     * Create debounced function
     * @param {Function} func - Function to debounce
     * @param {number} wait - Wait time in ms
     * @returns {Function} Debounced function
     */
    debounce(func, wait) {
        const debounced = debounce(func.bind(this), wait);
        return debounced;
    }
    
    /**
     * Create throttled function
     * @param {Function} func - Function to throttle
     * @param {number} limit - Limit time in ms
     * @returns {Function} Throttled function
     */
    throttle(func, limit) {
        const throttled = throttle(func.bind(this), limit);
        return throttled;
    }
    
    /**
     * Set timeout (automatically cleaned up on destroy)
     * @param {Function} callback - Callback function
     * @param {number} delay - Delay in ms
     * @returns {number} Timer ID
     */
    setTimeout(callback, delay) {
        const timer = setTimeout(() => {
            callback.call(this);
            this.timers = this.timers.filter(t => t !== timer);
        }, delay);
        this.timers.push(timer);
        return timer;
    }
    
    /**
     * Set interval (automatically cleaned up on destroy)
     * @param {Function} callback - Callback function
     * @param {number} delay - Delay in ms
     * @returns {number} Interval ID
     */
    setInterval(callback, delay) {
        const timer = setInterval(() => {
            callback.call(this);
        }, delay);
        this.timers.push(timer);
        return timer;
    }
    
    /**
     * Create IntersectionObserver (automatically cleaned up on destroy)
     * @param {Function} callback - Callback function
     * @param {Object} options - Observer options
     * @returns {IntersectionObserver} Observer instance
     */
    createIntersectionObserver(callback, options = {}) {
        const observer = new IntersectionObserver((entries) => {
            callback.call(this, entries);
        }, options);
        this.observers.push(observer);
        return observer;
    }
    
    /**
     * Create MutationObserver (automatically cleaned up on destroy)
     * @param {Function} callback - Callback function
     * @param {Object} options - Observer options
     * @returns {MutationObserver} Observer instance
     */
    createMutationObserver(callback, options = {}) {
        const observer = new MutationObserver((mutations) => {
            callback.call(this, mutations);
        });
        this.observers.push(observer);
        return observer;
    }
    
    /**
     * Query selector (scoped to container)
     * @param {string} selector - CSS selector
     * @returns {HTMLElement|null} Element or null
     */
    $(selector) {
        if (!this.container) {
            return document.querySelector(selector);
        }
        return this.container.querySelector(selector);
    }
    
    /**
     * Query selector all (scoped to container)
     * @param {string} selector - CSS selector
     * @returns {NodeList} Elements
     */
    $$(selector) {
        if (!this.container) {
            return document.querySelectorAll(selector);
        }
        return this.container.querySelectorAll(selector);
    }
    
    /**
     * Emit custom event
     * @param {string} eventName - Event name
     * @param {*} detail - Event detail
     * @param {HTMLElement} target - Target element (defaults to container)
     */
    emit(eventName, detail = {}, target = null) {
        const element = target || this.container || document;
        const event = new CustomEvent(eventName, {
            detail,
            bubbles: true,
            cancelable: true
        });
        element.dispatchEvent(event);
    }
    
    /**
     * Listen to custom event
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     * @param {HTMLElement} target - Target element (defaults to container)
     */
    on(eventName, handler, target = null) {
        const element = target || this.container || document;
        const boundHandler = handler.bind(this);
        element.addEventListener(eventName, boundHandler);
        this.events.set(`${eventName}:${element}`, boundHandler);
    }
    
    /**
     * Remove event listener
     * @param {string} eventName - Event name
     * @param {Function} handler - Event handler
     * @param {HTMLElement} target - Target element (defaults to container)
     */
    off(eventName, handler, target = null) {
        const element = target || this.container || document;
        element.removeEventListener(eventName, handler);
        this.events.delete(`${eventName}:${element}`);
    }
    
    /**
     * Log message with component name prefix
     * @param {...*} args - Arguments to log
     */
    log(...args) {
        console.log(`[${this.constructor.name}]`, ...args);
    }
    
    /**
     * Log warning with component name prefix
     * @param {...*} args - Arguments to log
     */
    warn(...args) {
        console.warn(`[${this.constructor.name}]`, ...args);
    }
    
    /**
     * Log error with component name prefix
     * @param {...*} args - Arguments to log
     */
    error(...args) {
        console.error(`[${this.constructor.name}]`, ...args);
    }
}


