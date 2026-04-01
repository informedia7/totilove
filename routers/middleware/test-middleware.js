/**
 * Simple test to verify middleware can be imported and used
 * Run with: node routers/middleware/test-middleware.js
 */

console.log('Testing middleware imports...\n');

try {
    const errorHandler = require('./errorHandler');
    console.log('✅ errorHandler imported successfully');
    console.log('   - ApiError:', typeof errorHandler.ApiError);
    console.log('   - errorHandler:', typeof errorHandler.errorHandler);
    console.log('   - asyncHandler:', typeof errorHandler.asyncHandler);
} catch (error) {
    console.error('❌ errorHandler import failed:', error.message);
}

try {
    const authMiddleware = require('./authMiddleware');
    console.log('\n✅ authMiddleware imported successfully');
    console.log('   - extractSessionToken:', typeof authMiddleware.extractSessionToken);
    console.log('   - requireAuth:', typeof authMiddleware.requireAuth);
} catch (error) {
    console.error('❌ authMiddleware import failed:', error.message);
}

try {
    const validationMiddleware = require('./validationMiddleware');
    console.log('\n✅ validationMiddleware imported successfully');
    console.log('   - validate:', typeof validationMiddleware.validate);
    console.log('   - sanitizeText:', typeof validationMiddleware.sanitizeText);
    console.log('   - hasJoi:', validationMiddleware.hasJoi);
} catch (error) {
    console.error('❌ validationMiddleware import failed:', error.message);
}

try {
    const rateLimiter = require('./rateLimiter');
    console.log('\n✅ rateLimiter imported successfully');
    console.log('   - createLimiter:', typeof rateLimiter.createLimiter);
    console.log('   - hasRateLimit:', rateLimiter.hasRateLimit);
} catch (error) {
    console.error('❌ rateLimiter import failed:', error.message);
}

try {
    const requestLogger = require('./requestLogger');
    console.log('\n✅ requestLogger imported successfully');
    console.log('   - createRequestLogger:', typeof requestLogger.createRequestLogger);
    console.log('   - requestLogger:', typeof requestLogger.requestLogger);
} catch (error) {
    console.error('❌ requestLogger import failed:', error.message);
}

try {
    const securityMiddleware = require('./securityMiddleware');
    console.log('\n✅ securityMiddleware imported successfully');
    console.log('   - securityHeaders:', typeof securityMiddleware.securityHeaders);
    console.log('   - requestSizeLimit:', typeof securityMiddleware.requestSizeLimit);
    console.log('   - sanitizeFilename:', typeof securityMiddleware.sanitizeFilename);
} catch (error) {
    console.error('❌ securityMiddleware import failed:', error.message);
}

console.log('\n✨ All middleware tests completed!');





























