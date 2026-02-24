/**
 * TALK SOCKET MANAGER
 * Handles WebSocket connection, authentication, and connection status
 * Extracted from talk.html (lines 1557-1654, 2114-2144, 1964-1975)
 * 
 * Dependencies:
 * - Global variables: currentUserId, window.currentUser, window.io
 * - Global functions: showNotification, updateConnectionStatus, setupStatusWebSocketListeners
 */

function talkSocketsEnabled() {
    return !(window.PresenceConfig && window.PresenceConfig.socketEnabled === false);
}

// Initialize socket variables (will be set by initializeWebSocket)
if (typeof window.socket === 'undefined') {
    window.socket = null;
}
if (typeof window.isSocketConnected === 'undefined') {
    window.isSocketConnected = false;
}
if (typeof window.isAuthenticated === 'undefined') {
    window.isAuthenticated = false;
}
if (typeof window.pendingOperations === 'undefined') {
    window.pendingOperations = [];
}

// Keep local references for backward compatibility
let socket = window.socket;
let isSocketConnected = window.isSocketConnected;
let isAuthenticated = window.isAuthenticated;
let pendingOperations = window.pendingOperations;

/**
 * Initialize WebSocket connection
 */
function initializeWebSocket() {
    // Prevent multiple initializations
    if (window.socket && window.isSocketConnected) {
        return; // Already initialized and connected
    }

    // Prevent recursion - ensure we're not calling ourselves
    if (window._initializingWebSocket) {
        return; // Already initializing
    }
    if (!talkSocketsEnabled()) {
        window.socket = null;
        window.isSocketConnected = false;
        window.isAuthenticated = false;
        window.pendingOperations = [];
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('disabled');
        }
        if (typeof showNotification === 'function') {
            showNotification('Real-time messaging disabled by configuration.', 'info');
        }
        window.safeSocketEmit = () => {
            console.info('[Talk] socket emit skipped (transport disabled)');
        };
        return;
    }

    window._initializingWebSocket = true;

    try {
        if (!window.io) {
            if (typeof showNotification === 'function') {
                showNotification('⚠️ Real-time features unavailable (Socket.IO not loaded)', 'warning');
            }
            window._initializingWebSocket = false;
            return;
        }

        socket = window.io({ transports: ['websocket'] });
        window.socket = socket;

        // Show connecting status
        if (typeof updateConnectionStatus === 'function') {
            updateConnectionStatus('connecting');
        }

        // Reset authentication state
        isAuthenticated = false;
        window.isAuthenticated = false;
        pendingOperations = [];
        window.pendingOperations = [];

        socket.on('connect', () => {
            isSocketConnected = true;
            window.isSocketConnected = true;

            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('connected');
            }

            isAuthenticated = false; // Reset on reconnect
            window.isAuthenticated = false;

            // SECURITY: Authenticate user with WebSocket BEFORE allowing operations
            const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
            if (currentUserId) {
                socket.emit('authenticate', {
                    userId: currentUserId,
                    real_name: window.currentUser?.real_name || 'User'
                });
            }

            if (typeof showNotification === 'function') {
                showNotification('Real time notifications are enabled', 'success');
                setTimeout(() => document.querySelector('.toast-success')?.remove(), 1500);
            }
        });

        socket.on('authenticated', (data) => {
            isAuthenticated = true;
            window.isAuthenticated = true;

            const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);

            // Join user-specific room for receiving messages
            if (currentUserId) {
                socket.emit('join_user_room', currentUserId);
            }

            // Set up enhanced status listeners (only if not already initialized)
            if (!window.statusListenersInitialized) {
                if (typeof setupStatusWebSocketListeners === 'function') {
                    setupStatusWebSocketListeners();
                }
                window.statusListenersInitialized = true;
            }

            // Setup real-time message handlers after authentication
            if (typeof setupRealtimeMessageHandlers === 'function') {
                setupRealtimeMessageHandlers();
            }

            // Process any pending operations
            pendingOperations.forEach(op => op());
            pendingOperations = [];
            window.pendingOperations = [];
        });

        // SECURITY: Wrapper to ensure operations only happen after authentication
        const safeSocketEmit = (event, data) => {
            if (isAuthenticated) {
                socket.emit(event, data);
            } else {
                pendingOperations.push(() => socket.emit(event, data));
                window.pendingOperations = pendingOperations;
            }
        };

        // Expose safe emit function
        window.safeSocketEmit = safeSocketEmit;

        socket.on('disconnect', () => {
            isSocketConnected = false;
            window.isSocketConnected = false;
            isAuthenticated = false; // Reset auth on disconnect
            window.isAuthenticated = false;

            // Reset realtime handlers flag so they can be set up again on reconnect
            window.realtimeHandlersSetup = false;

            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('disconnected');
            }

            if (typeof showNotification === 'function') {
                showNotification('⚠️ Real-time messaging disconnected', 'warning');
            }

            // Clean up status update interval
            if (window.statusUpdateInterval) {
                clearInterval(window.statusUpdateInterval);
                window.statusUpdateInterval = null;
            }
        });

        socket.on('reconnect', () => {
            isSocketConnected = true;
            window.isSocketConnected = true;
            isAuthenticated = false; // Reset auth on reconnect
            window.isAuthenticated = false;

            // Reset realtime handlers flag so they can be set up again
            window.realtimeHandlersSetup = false;

            if (typeof updateConnectionStatus === 'function') {
                updateConnectionStatus('connected');
            }

            if (typeof showNotification === 'function') {
                showNotification('✅ Real-time messaging restored', 'success');
            }

            // Re-authenticate after reconnection
            const currentUserId = TalkState ? TalkState.getCurrentUserId() : (window.currentUser?.id || null);
            if (currentUserId) {
                socket.emit('authenticate', {
                    userId: currentUserId,
                    real_name: window.currentUser?.real_name || 'User'
                });
            }

            // Re-setup status listeners after reconnection (only if not already initialized)
            if (!window.statusListenersInitialized) {
                if (typeof setupStatusWebSocketListeners === 'function') {
                    setupStatusWebSocketListeners();
                }
                window.statusListenersInitialized = true;
            }

            // Re-setup real-time message handlers after reconnection
            if (typeof setupRealtimeMessageHandlers === 'function') {
                setupRealtimeMessageHandlers();
            }
        });

    } catch (error) {
        if (typeof showNotification === 'function') {
            showNotification('⚠️ Real-time features unavailable', 'warning');
        }
    } finally {
        window._initializingWebSocket = false;
    }
}

/**
 * Set up status listeners using the working user_profile system
 */
function setupStatusWebSocketListeners() {
    if (!socket || !isSocketConnected) return;

    // Prevent multiple initializations
    if (window.statusListenersInitialized) {
        return;
    }

    // Mark as initialized
    window.statusListenersInitialized = true;
}

/**
 * Update connection status indicator
 * @param {string} status - Connection status ('connected', 'disconnected', 'connecting')
 */
function updateConnectionStatus(status) {
    const indicator = document.getElementById('connectionStatus');
    if (!indicator) return;

    // Remove existing classes
    indicator.classList.remove('connected', 'disconnected', 'connecting');

    // Add new class and update text
    switch (status) {
        case 'connected':
            indicator.classList.add('connected');
            indicator.innerHTML = '🟢 Real-time ON';
            indicator.style.display = 'block';
            // Auto-hide after 3 seconds
            setTimeout(() => {
                indicator.style.display = 'none';
            }, 3001);
            break;
        case 'disconnected':
            indicator.classList.add('disconnected');
            indicator.innerHTML = '🔴 Offline mode';
            indicator.style.display = 'block';
            break;
        case 'connecting':
            indicator.classList.add('connecting');
            indicator.innerHTML = '🟡 Connecting...';
            indicator.style.display = 'block';
            break;
    }
}

// Make functions globally available
window.initializeWebSocket = initializeWebSocket;
window.setupStatusWebSocketListeners = setupStatusWebSocketListeners;
window.updateConnectionStatus = updateConnectionStatus;

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        initializeWebSocket,
        setupStatusWebSocketListeners,
        updateConnectionStatus
    };
}












