/**
 * AgeValidation – Lightweight, Accessible, Event-Driven
 * Supports min/max number inputs (18–100)
 */

const AgeValidation = (() => {
    const DEFAULTS = {
        min: 18,
        max: 100,
        errorClass: 'error'
    };

    function createError(el) {
        const id = `${el.id}-error`;
        let msg = document.getElementById(id);
        if (!msg) {
            msg = document.createElement('div');
            msg.id = id;
            msg.className = 'error-message';
            el.after(msg);
        }
        el.setAttribute('aria-describedby', id);
        return msg;
    }

    function clearError(el) {
        const msg = document.getElementById(`${el.id}-error`);
        if (msg) msg.remove();
        el.removeAttribute('aria-describedby');
        el.classList.remove(DEFAULTS.errorClass);
        el.setAttribute('aria-invalid', 'false');
    }

    function setError(el, text) {
        const msg = createError(el);
        msg.textContent = text;
        el.classList.add(DEFAULTS.errorClass);
        el.setAttribute('aria-invalid', 'true');
    }

    function emit(el, detail) {
        el.dispatchEvent(new CustomEvent('age-change', {
            bubbles: true,
            detail
        }));
    }

    function sanitizeInput(el, cfg, isMin) {
        const maxLength = String(cfg.max).length;
        let value = el.value.replace(/\D/g, '').slice(0, maxLength);
        const n = Number(value);
        // Prevent values exceeding max during typing
        if (value && n > cfg.max) {
            value = String(isMin ? cfg.min : cfg.max);
        }
        el.value = value;
    }

    function validate(el, other, isMin, cfg) {
        const v = el.value;
        clearError(el);
        if (v === '') {
            emit(el, { valid: true });
            return true;
        }
        let n = Number(v);
        if (n < cfg.min || n > cfg.max) {
            n = (n > cfg.max) ? (isMin ? cfg.min : cfg.max) : cfg.min;
            el.value = String(n);
            emit(el, { valid: false });
            return false;
        }
        if (other?.value) {
            const o = Number(other.value);
            if ((isMin && n > o) || (!isMin && n < o)) {
                setError(el, isMin ? 'Minimum age cannot exceed maximum' : 'Maximum age cannot be less than minimum');
                emit(el, { valid: false });
                return false;
            }
        }
        emit(el, { valid: true, min: isMin ? n : Number(other?.value || null), max: !isMin ? n : Number(other?.value || null) });
        return true;
    }

    function bind(el, other, isMin, cfg) {
        const maxLength = String(cfg.max).length;
        Object.assign(el, { type: 'text', inputMode: 'numeric', autocomplete: 'off', maxLength });
        el.setAttribute('aria-label', isMin ? 'Minimum age' : 'Maximum age');

        el.addEventListener('keydown', e => {
            const allowedKeys = [8, 9, 27, 13, 46, 35, 36, 37, 38, 39, 40];
            const ctrlKeys = [65, 67, 86, 88];
            if (allowedKeys.includes(e.keyCode) || (ctrlKeys.includes(e.keyCode) && e.ctrlKey)) return;
            const isDigit = (e.keyCode >= 48 && e.keyCode <= 57) || (e.keyCode >= 96 && e.keyCode <= 105);
            if (!isDigit) e.preventDefault();
        });

        el.addEventListener('input', () => {
            sanitizeInput(el, cfg, isMin);
        });

        el.addEventListener('blur', () => {
            validate(el, other, isMin, cfg);
            // Also validate the other field to clear its error if it's now valid
            if (other) {
                validate(other, el, !isMin, cfg);
            }
        });

        el.addEventListener('paste', e => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text');
            if (!/^\d+$/.test(pasted)) return;
            const n = Number(pasted);
            el.value = (pasted.length > maxLength || n > cfg.max) ? String(isMin ? cfg.min : cfg.max) :
                       (n < cfg.min) ? String(cfg.min) : pasted.slice(0, maxLength);
            sanitizeInput(el, cfg, isMin);
        });
    }

    function init(minId, maxId, options = {}) {
        const cfg = { ...DEFAULTS, ...options };
        const minEl = document.getElementById(minId);
        const maxEl = document.getElementById(maxId);

        if (!minEl || !maxEl) {
            console.warn('AgeValidation: inputs not found');
            return;
        }

        bind(minEl, maxEl, true, cfg);
        bind(maxEl, minEl, false, cfg);
    }

    // Backward compatibility alias
    function initNumberInputs(minId, maxId, options = {}) {
        init(minId, maxId, options);
    }

    function validateAgeRange(ageMin, ageMax, options = {}) {
        const cfg = { ...DEFAULTS, ...options };
        const errors = [];
        
        // Age range validation removed - handled by input validation
        
        if (ageMin !== null && ageMin !== undefined && ageMin !== '' && 
            ageMax !== null && ageMax !== undefined && ageMax !== '') {
            const min = Number(ageMin);
            const max = Number(ageMax);
            if (!isNaN(min) && !isNaN(max) && min > max) {
                errors.push('Minimum age cannot exceed maximum age');
            }
        }
        
        return { valid: errors.length === 0, errors };
    }

    return { init, initNumberInputs, validateAgeRange };
})();

/* Global export */
window.AgeValidation = AgeValidation;
window.AgeCheck = AgeValidation;
