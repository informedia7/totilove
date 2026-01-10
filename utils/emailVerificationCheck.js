/**
 * Email Verification Check Utility
 * 
 * This utility provides functions to check if a user's email is verified.
 * Used in the hybrid verification approach where users can register and browse,
 * but need verification for critical features like messaging, profile viewing, etc.
 */

/**
 * Check if a user's email is verified
 * @param {Object} db - Database connection object
 * @param {number|string} userId - User ID to check
 * @returns {Promise<{verified: boolean, user?: Object}>} Verification status and user data
 */
async function checkEmailVerification(db, userId) {
    try {
        const result = await db.query(
            `SELECT id, email, COALESCE(email_verified, false) as email_verified 
             FROM users 
             WHERE id = $1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return { verified: false, user: null };
        }

        const user = result.rows[0];
        return {
            verified: user.email_verified === true || user.email_verified === 'true',
            user: user
        };
    } catch (error) {
        console.error('Error checking email verification:', error);
        // On error, assume not verified for security
        return { verified: false, user: null };
    }
}

/**
 * Middleware-style function that returns an error response if email is not verified
 * @param {Object} db - Database connection object
 * @param {number|string} userId - User ID to check
 * @returns {Promise<Object|null>} Error response object if not verified, null if verified
 */
async function requireEmailVerification(db, userId) {
    const { verified, user } = await checkEmailVerification(db, userId);
    
    if (!verified) {
        return {
            success: false,
            error: 'Email verification required',
            message: 'Please verify your email address to use this feature. Check your inbox for the verification email.',
            requiresEmailVerification: true,
            code: 'EMAIL_VERIFICATION_REQUIRED'
        };
    }
    
    return null; // Verified, no error
}

module.exports = {
    checkEmailVerification,
    requireEmailVerification
};






























































































































