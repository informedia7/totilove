/**
 * Validation Middleware
 * Request validation using Joi or basic validation
 */

let Joi = null;
try {
    Joi = require('joi');
} catch (e) {
    console.warn('[ValidationMiddleware] Joi not installed. Install with: npm install joi');
}

/**
 * Validate request data against schema
 * @param {Object} schema - Joi schema or validation function
 * @param {string} source - Source of data: 'body', 'query', 'params'
 * @returns {Function} Express middleware
 */
function validate(schema, source = 'body') {
    return (req, res, next) => {
        const data = req[source];
        
        // If Joi is available, use it
        if (Joi && schema.isJoi) {
            const { error, value } = schema.validate(data, {
                abortEarly: false,
                stripUnknown: true
            });

            if (error) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation error',
                    details: error.details.map(d => ({
                        field: d.path.join('.'),
                        message: d.message,
                        value: d.context?.value
                    }))
                });
            }

            // Replace request data with validated and sanitized data
            req[source] = value;
            next();
        } 
        // Fallback to basic validation function
        else if (typeof schema === 'function') {
            try {
                const result = schema(data);
                if (result !== true && typeof result === 'object') {
                    return res.status(400).json({
                        success: false,
                        error: result.error || 'Validation error',
                        details: result.details
                    });
                }
                next();
            } catch (error) {
                return res.status(400).json({
                    success: false,
                    error: error.message || 'Validation error'
                });
            }
        } else {
            next();
        }
    };
}

/**
 * Sanitize text input
 * Removes HTML tags and dangerous patterns
 * @param {string} text - Text to sanitize
 * @returns {string} Sanitized text
 */
function sanitizeText(text) {
    if (!text || typeof text !== 'string') return '';
    
    let sanitized = text;
    
    // Remove HTML tags
    sanitized = sanitized.replace(/<[^>]*>/g, '');
    
    // Remove dangerous patterns
    const forbiddenPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /<iframe/gi,
        /<object/gi,
        /<embed/gi,
    ];
    
    forbiddenPatterns.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    
    return sanitized.trim();
}

/**
 * Sanitize object recursively
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
function sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return typeof obj === 'string' ? sanitizeText(obj) : obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    const sanitized = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            sanitized[key] = sanitizeObject(obj[key]);
        }
    }
    
    return sanitized;
}

/**
 * Common validation schemas (if Joi is available)
 */
const schemas = {};

if (Joi) {
    schemas.profileUpdate = Joi.object({
        real_name: Joi.string().min(2).max(100).pattern(/^[a-zA-Z\s]+$/).optional(),
        email: Joi.string().email().optional(),
        age: Joi.number().integer().min(18).max(120).optional(),
        gender: Joi.string().valid('male', 'female', 'other').optional(),
        bio: Joi.string().max(2000).optional(),
        country_id: Joi.number().integer().positive().optional(),
        state_id: Joi.number().integer().positive().optional(),
        city_id: Joi.number().integer().positive().optional(),
    });

    schemas.login = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required()
    });

    schemas.register = Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(),
        real_name: Joi.string().min(2).max(100).pattern(/^[a-zA-Z\s]+$/).required(),
        gender: Joi.string().valid('male', 'female', 'other').required(),
        age: Joi.number().integer().min(18).max(120).required()
    });

    schemas.settingsUpdate = Joi.object({
        email_notifications: Joi.boolean().optional(),
        sms_notifications: Joi.boolean().optional(),
        profile_visibility: Joi.string().valid('public', 'private', 'friends').optional()
    });
}

/**
 * Basic email validation (works without Joi)
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * Basic password validation (works without Joi)
 * @param {string} password - Password to validate
 * @param {Object} options - Validation options
 * @returns {Object} Validation result
 */
function validatePassword(password, options = {}) {
    const minLength = options.minLength || 6;
    const requireUppercase = options.requireUppercase || false;
    const requireLowercase = options.requireLowercase || false;
    const requireNumber = options.requireNumber || false;
    const requireSpecial = options.requireSpecial || false;

    const errors = [];

    if (!password || password.length < minLength) {
        errors.push(`Password must be at least ${minLength} characters`);
    }

    if (requireUppercase && !/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }

    if (requireLowercase && !/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }

    if (requireNumber && !/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }

    if (requireSpecial && !/[^a-zA-Z0-9]/.test(password)) {
        errors.push('Password must contain at least one special character');
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

module.exports = {
    validate,
    sanitizeText,
    sanitizeObject,
    schemas,
    isValidEmail,
    validatePassword,
    hasJoi: !!Joi
};





























