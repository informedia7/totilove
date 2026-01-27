/**
 * Error Handler Middleware
 * Provides consistent error handling and custom ApiError class
 */

/**
 * Custom API Error class
 * Extends Error with status code and optional details
 */
class ApiError extends Error {
    constructor(status, message, details = null) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Standard error response format
 * @param {Error|ApiError} error - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware
 */
function errorHandler(error, req, res, next) {
    // Log error for debugging
    console.error('[ErrorHandler]', {
        message: error.message,
        status: error.status || 500,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        url: req.url,
        method: req.method,
        ip: req.ip
    });

    // Handle ApiError instances
    if (error instanceof ApiError) {
        return res.status(error.status).json({
            success: false,
            error: error.message,
            details: error.details || undefined
        });
    }

    // Handle validation errors (Joi)
    if (error.isJoi) {
        return res.status(400).json({
            success: false,
            error: 'Validation error',
            details: error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message
            }))
        });
    }

    // Handle multer errors (file upload)
    if (error.name === 'MulterError') {
        let message = 'File upload error';
        if (error.code === 'LIMIT_FILE_SIZE') {
            message = 'File too large';
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            message = 'Too many files';
        } else if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            message = 'Unexpected file field';
        }
        return res.status(400).json({
            success: false,
            error: message,
            details: { code: error.code }
        });
    }

    // Default error response
    const status = error.status || error.statusCode || 500;
    const message = status === 500 && process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message || 'An error occurred';

    res.status(status).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
}

/**
 * Async handler wrapper
 * Wraps async route handlers to catch errors automatically
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Try-catch wrapper helper
 * Executes async function and handles errors
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options object
 * @param {Function} options.onError - Custom error handler
 * @returns {Function} Wrapped function
 */
function tryCatch(fn, options = {}) {
    return async (req, res, next) => {
        try {
            await fn(req, res, next);
        } catch (error) {
            if (options.onError) {
                return options.onError(error, req, res, next);
            }
            next(error);
        }
    };
}

module.exports = {
    ApiError,
    errorHandler,
    asyncHandler,
    tryCatch
};





























