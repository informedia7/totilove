/**
 * TALK MESSAGE VALIDATOR
 * Handles message validation and sanitization
 * Extracted from talk.html (lines 1603-1768)
 * 
 * Dependencies:
 * - TalkState (talk_state.js)
 * - Global functions: showNotification
 */

/**
 * Message validation configuration
 */
const MESSAGE_CONFIG = {
    MAX_LENGTH: 2000, // Maximum characters per message
    FORBIDDEN_CHARS: /[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, // Control characters except newline, tab, carriage return
    FORBIDDEN_PATTERNS: [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // Script tags
        /javascript:/gi, // JavaScript protocol
        /on\w+\s*=/gi, // Event handlers (onclick, onerror, etc.)
        /<iframe/gi, // Iframe tags
        /<object/gi, // Object tags
        /<embed/gi, // Embed tags
        /<link/gi, // Link tags
        /<meta/gi, // Meta tags
        /<style/gi // Style tags
    ]
};

/**
 * Sanitize message content to prevent XSS attacks
 */
function sanitizeMessage(text) {
    if (!text) return '';
    
    // Remove HTML tags (but preserve text content)
    let sanitized = text.replace(/<[^>]*>/g, '');
    
    // Remove forbidden patterns
    MESSAGE_CONFIG.FORBIDDEN_PATTERNS.forEach(pattern => {
        sanitized = sanitized.replace(pattern, '');
    });
    
    // Remove control characters (except newline, tab, carriage return)
    sanitized = sanitized.replace(MESSAGE_CONFIG.FORBIDDEN_CHARS, '');
    
    // Escape remaining HTML entities
    sanitized = sanitized
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;');
    
    // Unescape common safe entities that users might want
    sanitized = sanitized
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#x27;/g, "'");
    
    return sanitized.trim();
}

/**
 * Validate message content (includes bad words check via API)
 */
async function validateMessageContent(text) {
    if (!text || !text.trim()) {
        return { valid: false, error: 'Please enter a message' };
    }

    const trimmed = text.trim();
    
    // Check length
    if (trimmed.length > MESSAGE_CONFIG.MAX_LENGTH) {
        return { 
            valid: false, 
            error: `Message is too long. Maximum ${MESSAGE_CONFIG.MAX_LENGTH} characters allowed.` 
        };
    }

    // Check for forbidden patterns
    for (const pattern of MESSAGE_CONFIG.FORBIDDEN_PATTERNS) {
        if (pattern.test(trimmed)) {
            return { 
                valid: false, 
                error: 'Message contains forbidden content. Please remove any scripts or HTML tags.' 
            };
        }
    }

    // Check for control characters (except allowed ones: newline, tab, carriage return)
    if (MESSAGE_CONFIG.FORBIDDEN_CHARS.test(trimmed)) {
        return { 
            valid: false, 
            error: 'Message contains invalid characters.' 
        };
    }

    // Check for bad words via API (non-blocking, backend will enforce)
    // Skip this check if it fails - backend will enforce validation
    // Use a timeout to prevent hanging
    const currentUserId = TalkState.getCurrentUserId();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout
        
        const response = await fetch('/api/messages/validate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-User-ID': currentUserId
            },
            body: JSON.stringify({ content: trimmed }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // Try to parse response as JSON (works for both success and error responses)
        let data = null;
        try {
            const responseText = await response.text();
            if (responseText) {
                data = JSON.parse(responseText);
            }
        } catch (parseError) {
            // If JSON parsing fails, log warning
            console.warn('Validation API response parse error:', parseError);
        }

        // Check for validation failure - server returns success: true but valid: false when bad words found
        if (data) {
            // Check if validation failed (valid: false) regardless of success status
            if (data.valid === false || data.success === false) {
                return {
                    valid: false,
                    error: data.error || 'Your message contains inappropriate language. Please revise your message.'
                };
            }
        }

        // If response is not OK, try to extract error message
        if (!response.ok) {
            if (data && data.error) {
                return {
                    valid: false,
                    error: data.error || 'Your message contains inappropriate language. Please revise your message.'
                };
            }
            // Log warning if we can't parse the error
            console.warn('Validation API returned error status:', response.status, data);
        }
    } catch (error) {
        // If validation API fails (network error, timeout, etc.), continue (backend will enforce)
        if (error.name !== 'AbortError') {
            console.warn('Bad words validation check failed, backend will enforce:', error.message);
        }
    }

    return { valid: true, sanitized: sanitizeMessage(trimmed) };
}

/**
 * Character counter function
 */
function updateCharacterCounter() {
    const input = document.getElementById('messageInput');
    const counter = document.getElementById('characterCounter');
    if (!input || !counter) return;
    
    const length = input.value.length;
    const maxLength = MESSAGE_CONFIG.MAX_LENGTH;
    counter.textContent = `${length} / ${maxLength}`;
    
    // Change color when approaching limit
    if (length > maxLength * 0.9) {
        counter.style.color = '#dc3545'; // Red
    } else if (length > maxLength * 0.75) {
        counter.style.color = '#ffc107'; // Yellow
    } else {
        counter.style.color = '#6c757d'; // Gray
    }
}

/**
 * Validate message input (includes conversation validation)
 */
async function validateMessageInput(text) {
    // Validate conversation first
    const currentConversation = TalkState.getCurrentConversation();
    if (!currentConversation) {
        return false;
    }
    
    const conversations = TalkState.getConversations();
    const conversation = conversations[currentConversation];
    if (!conversation || !conversation.partnerId) {
        if (typeof showNotification === 'function') {
            showNotification('No conversation selected', 'error');
        }
        return false;
    }

    // Validate message content (async - includes bad words check)
    const contentValidation = await validateMessageContent(text);
    if (!contentValidation.valid) {
        if (typeof showNotification === 'function') {
            showNotification(contentValidation.error, 'error');
        }
        return false;
    }

    return { conversation, sanitizedContent: contentValidation.sanitized };
}

/**
 * Helper function to get current timestamp
 */
function getCurrentTimestamp() {
    return new Date().toISOString();
}

// Make functions globally available
window.MESSAGE_CONFIG = MESSAGE_CONFIG;
window.sanitizeMessage = sanitizeMessage;
window.validateMessageContent = validateMessageContent;
window.updateCharacterCounter = updateCharacterCounter;
window.validateMessageInput = validateMessageInput;
window.getCurrentTimestamp = getCurrentTimestamp;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MESSAGE_CONFIG,
        sanitizeMessage,
        validateMessageContent,
        updateCharacterCounter,
        validateMessageInput,
        getCurrentTimestamp
    };
}













