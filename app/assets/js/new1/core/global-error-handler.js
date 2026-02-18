/**
 * Global Error Handler for Totilove Application
 * Enhanced error logging and display system that works across all pages
 */

// Enhanced error logging and display system
const ErrorDisplay = {
    errors: [],
    isInitialized: false,
    
    // Initialize the error display system
    init: function() {
        if (this.isInitialized) return;
        
        this.setupGlobalErrorHandlers();
        this.setupConsoleErrorCapture();
        this.setupFetchErrorCapture();
        this.isInitialized = true;
    },
    
    // Capture and log error with full details
    captureError: function(error, context = '') {
        // Prevent infinite recursion
        if (this._capturingError) {
            return null;
        }
        
        this._capturingError = true;
        
        try {
            const errorDetail = {
                timestamp: new Date().toISOString(),
                context: context,
                message: error.message || String(error),
                stack: error.stack || 'No stack trace available',
                type: error.name || 'UnknownError',
                url: window.location.href,
                userAgent: navigator.userAgent,
                // Capture additional browser info
                browserInfo: {
                    language: navigator.language,
                    platform: navigator.platform,
                    cookieEnabled: navigator.cookieEnabled,
                    onLine: navigator.onLine,
                    screen: {
                        width: screen.width,
                        height: screen.height,
                        colorDepth: screen.colorDepth
                    }
                }
            };
            
            this.errors.push(errorDetail);
            console.error('🔴 Detailed Error:', errorDetail);
            
            // Display error in UI
            this.displayError(errorDetail);
            
            return errorDetail;
        } finally {
            this._capturingError = false;
        }
    },
    
    // Create detailed error display UI
    displayError: function(errorDetail) {
        // Check if error container exists, if not create it
        let errorContainer = document.getElementById('detailedErrorContainer');
        if (!errorContainer) {
            errorContainer = document.createElement('div');
            errorContainer.id = 'detailedErrorContainer';
            errorContainer.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                max-width: 600px;
                max-height: 80vh;
                overflow-y: auto;
                background: #fff;
                border: 2px solid #e74c3c;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.2);
                z-index: 10000;
                font-family: monospace;
                display: none;
            `;
            
            errorContainer.innerHTML = `
                <div style="background: #e74c3c; color: white; padding: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <h4 style="margin: 0; font-size: 14px;">⚠️ Error Details</h4>
                    <button onclick="ErrorDisplay.toggleDetails()" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px;">&times;</button>
                </div>
                <div id="errorDetailsList" style="padding: 15px; max-height: 400px; overflow-y: auto;"></div>
                <div style="padding: 10px; background: #f5f5f5; border-top: 1px solid #ddd;">
                    <button onclick="ErrorDisplay.copyErrors()" style="background: #3498db; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 10px;">Copy All</button>
                    <button onclick="ErrorDisplay.clearErrors()" style="background: #95a5a6; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">Clear</button>
                </div>
            `;
            
            document.body.appendChild(errorContainer);
        }
        
        // Add error to list
        const errorList = document.getElementById('errorDetailsList');
        const errorElement = document.createElement('div');
        errorElement.style.cssText = 'margin-bottom: 15px; padding: 10px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 4px;';
        
        errorElement.innerHTML = `
            <div style="color: #e74c3c; font-weight: bold; margin-bottom: 5px;">
                [${errorDetail.timestamp}] ${errorDetail.context}
            </div>
            <div style="color: #2c3e50; margin-bottom: 5px;">
                <strong>Type:</strong> ${errorDetail.type}
            </div>
            <div style="color: #2c3e50; margin-bottom: 5px;">
                <strong>Message:</strong> ${errorDetail.message}
            </div>
            <details style="margin-top: 10px;">
                <summary style="cursor: pointer; color: #3498db;">Stack Trace</summary>
                <pre style="background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; margin-top: 5px;">${errorDetail.stack}</pre>
            </details>
            <details style="margin-top: 10px;">
                <summary style="cursor: pointer; color: #3498db;">Browser Info</summary>
                <pre style="background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 11px; margin-top: 5px;">${JSON.stringify(errorDetail.browserInfo, null, 2)}</pre>
            </details>
        `;
        
        errorList.insertBefore(errorElement, errorList.firstChild);
        
        // Show error container
        errorContainer.style.display = 'block';
        
        // Also add a notification badge
        this.showErrorBadge();
    },
    
    // Show error notification badge
    showErrorBadge: function() {
        let badge = document.getElementById('errorBadge');
        if (!badge) {
            badge = document.createElement('div');
            badge.id = 'errorBadge';
            badge.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: #e74c3c;
                color: white;
                padding: 10px 15px;
                border-radius: 50px;
                cursor: pointer;
                font-weight: bold;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
                z-index: 9999;
                display: flex;
                align-items: center;
                gap: 8px;
                animation: pulse 2s infinite;
            `;
            badge.innerHTML = `<span>⚠️</span> <span id="errorCount">0</span> Errors`;
            badge.onclick = () => this.toggleDetails();
            
            // Add pulse animation
            const style = document.createElement('style');
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            `;
            document.head.appendChild(style);
            
            document.body.appendChild(badge);
        }
        
        document.getElementById('errorCount').textContent = this.errors.length;
    },
    
    // Toggle error details display
    toggleDetails: function() {
        const container = document.getElementById('detailedErrorContainer');
        const badge = document.getElementById('errorBadge');
        
        if (container) {
            const isVisible = container.style.display !== 'none';
            container.style.display = isVisible ? 'none' : 'block';
            if (badge) {
                badge.style.display = isVisible ? 'flex' : 'none';
            }
        }
    },
    
    // Copy all errors to clipboard
    copyErrors: function() {
        const errorText = this.errors.map(error => {
            return `
===============================
Timestamp: ${error.timestamp}
Context: ${error.context}
Type: ${error.type}
Message: ${error.message}
URL: ${error.url}
User Agent: ${error.userAgent}
Stack Trace:
${error.stack}
Browser Info:
${JSON.stringify(error.browserInfo, null, 2)}
===============================
            `;
        }).join('\n\n');
        
        navigator.clipboard.writeText(errorText).then(() => {
            alert('Error details copied to clipboard!');
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    },
    
    // Clear all errors
    clearErrors: function() {
        this.errors = [];
        const errorList = document.getElementById('errorDetailsList');
        if (errorList) {
            errorList.innerHTML = '';
        }
        const badge = document.getElementById('errorBadge');
        if (badge) {
            badge.remove();
        }
        const container = document.getElementById('detailedErrorContainer');
        if (container) {
            container.style.display = 'none';
        }
    },
    
    // Setup global error handlers
    setupGlobalErrorHandlers: function() {
        // Global error handler
        window.addEventListener('error', (event) => {
            this.captureError(event.error || new Error(event.message), 'Window Error');
        });

        // Promise rejection handler
        window.addEventListener('unhandledrejection', (event) => {
            this.captureError(new Error(event.reason), 'Unhandled Promise Rejection');
        });
    },
    
    // Setup console error capture
    setupConsoleErrorCapture: function() {
        // Override console.error to capture all errors
        const originalConsoleError = console.error;
        console.error = (...args) => {
            originalConsoleError.apply(console, args);
            
            // Prevent infinite recursion by checking if this is our own error
            const errorMessage = args.map(arg => {
                if (arg instanceof Error) {
                    return arg.message;
                }
                return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
            }).join(' ');
            
            // Skip if this is our own error message to prevent infinite loops
            // Also skip benign errors like "Modal not found" which are handled gracefully
            if (errorMessage.includes('🔴 Detailed Error:') || 
                errorMessage.includes('global-error-handler.js') ||
                errorMessage.includes('ErrorDisplay.captureError') ||
                errorMessage.includes('Modal not found') ||
                errorMessage.includes('Unchecked runtime.lastError')) {
                return;
            }
            
            this.captureError(new Error(errorMessage), 'Console Error');
        };
    },
    
    // Setup fetch error capture
    setupFetchErrorCapture: function() {
        // Intercept fetch errors with retry logic
        const originalFetch = window.fetch;
        window.fetch = (...args) => {
            return this.fetchWithRetry(originalFetch, ...args);
        };
    },
    
    // Enhanced fetch with retry logic for network failures
    fetchWithRetry: async function(originalFetch, ...args) {
        const maxRetries = 3;
        const retryDelays = [1000, 2000, 4000]; // 1s, 2s, 4s
        let lastError;
        
        // Check if this is a bulk status endpoint that handles 429 internally
        const url = args[0]?.url || args[0];
        const isBulkStatusEndpoint = typeof url === 'string' && url.includes('/api/users-online-status');
        const isLeadershipClaimEndpoint = typeof url === 'string' && url.includes('/api/presence/leadership/claim');
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                const response = await originalFetch.apply(window, args);
                
                if (!response.ok) {
                    // For bulk status endpoint, return 429 response without retrying
                    // (the calling code handles it with exponential backoff)
                    if (response.status === 429 && isBulkStatusEndpoint) {
                        return response;
                    }
                    
                    // Don't retry on client errors (4xx) except 429 (rate limit)
                    if (response.status >= 400 && response.status < 500 && response.status !== 429) {
                        if (response.status === 409 && isLeadershipClaimEndpoint) {
                            return response;
                        }
                        this.captureError(
                            new Error(`HTTP ${response.status}: ${response.statusText}`),
                            `Fetch Error: ${args[0]}`
                        );
                        return response;
                    }
                    
                    // Retry on server errors (5xx) and rate limits (429) for other endpoints
                    if (attempt === maxRetries) {
                        // Don't log 429 errors for bulk endpoint as they're handled gracefully
                        if (!(response.status === 429 && isBulkStatusEndpoint)) {
                            this.captureError(
                                new Error(`HTTP ${response.status}: ${response.statusText}`),
                                `Fetch Error: ${args[0]}`
                            );
                        }
                        return response;
                    }
                    
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                return response;
                
            } catch (error) {
                lastError = error;
                
                // Check if this is a network error that should be retried
                const isNetworkError = this.isRetryableError(error);
                
                if (!isNetworkError || attempt === maxRetries) {
                    this.captureError(error, `Fetch Failed: ${args[0]}`);
                    throw error;
                }
                
                // Wait before retrying
                const delay = retryDelays[attempt] || retryDelays[retryDelays.length - 1];
                console.warn(`Fetch attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
                
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError;
    },
    
    // Determine if an error should trigger a retry
    isRetryableError: function(error) {
        // Network errors that should be retried
        if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
            return true;
        }
        
        // Connection errors
        if (error.message.includes('NetworkError') || 
            error.message.includes('Connection') ||
            error.message.includes('timeout')) {
            return true;
        }
        
        // Server errors (5xx)
        if (error.message.includes('HTTP 5')) {
            return true;
        }
        
        // Rate limiting (429)
        if (error.message.includes('HTTP 429')) {
            return true;
        }
        
        return false;
    }
};

// Add manual error trigger for debugging
window.triggerTestError = function() {
    throw new Error('This is a test error to check error display functionality');
};

// Initialize error display system when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        ErrorDisplay.init();
    });
} else {
    // DOM is already loaded
    ErrorDisplay.init();
}

// Make ErrorDisplay globally available
window.ErrorDisplay = ErrorDisplay;
