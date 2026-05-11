// Global logout function - used by both layout.html and global navbar
window.handleLogout = async function(event) {
    if (event && event.preventDefault) event.preventDefault();
    
    try {
        // Call server logout (cookies sent automatically)
        await fetch('/logout', {
            method: 'POST',
            credentials: 'include' // Cookies automatically sent
        });
    } catch (e) {
        // Continue with cleanup even if API call fails
    } finally {
        // Cleanup client-side state
        if (window.sessionManager?.clearSession) {
            window.sessionManager.clearSession();
        } else {
            sessionStorage.clear();
        }
        
        window.currentUser = null;
        if (window.globalNavbar) {
            if (window.globalNavbar.setAuthState) {
                window.globalNavbar.setAuthState(null, false);
            } else {
                window.globalNavbar.currentUser = null;
                window.globalNavbar.isAuthenticated = false;
                window.globalNavbar.messageCount = 0;
                window.globalNavbar.notificationCount = 0;
            }
        }
        
        window.location.href = '/login';
    }
};

// Mobile menu toggle function
function toggleMobileMenu(forceState) {
    const menuContainer = document.getElementById('mobile-menu-container');
    const menuToggle = document.getElementById('mobile-menu-toggle');

    if (!menuContainer || !menuToggle) {
        return;
    }

    const shouldOpen = typeof forceState === 'boolean'
        ? forceState
        : !menuContainer.classList.contains('mobile-open');

    menuContainer.classList.toggle('mobile-open', shouldOpen);
    menuToggle.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
}

// Close mobile menu when clicking outside
document.addEventListener('click', function(event) {
    const menuContainer = document.getElementById('mobile-menu-container');
    const menuToggle = document.getElementById('mobile-menu-toggle');

    if (menuContainer && menuToggle && window.innerWidth <= 768) {
        const isClickInside = menuContainer.contains(event.target) || menuToggle.contains(event.target);

        if (!isClickInside && menuContainer.classList.contains('mobile-open')) {
            toggleMobileMenu(false);
        }
    }
});

// Close mobile menu when clicking on a menu item
document.addEventListener('DOMContentLoaded', function() {
    const menuItems = document.querySelectorAll('.mobile-menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', function() {
            if (window.innerWidth <= 768) {
                toggleMobileMenu(false);
            }
        });
    });
});

// Enhanced Template System Integration
document.addEventListener('DOMContentLoaded', function() {
    // Wait a bit for layout-user-data.js to finish initializing
    // Since scripts load in order, give it a small delay to ensure currentUser is set
    setTimeout(function() {
        // Simple initialization - try to get user data from the page
        const userData = window.currentUser || {};
        
        // Check if we have user data in the template variables
        if (userData && userData.id) {
            window.currentUser = userData;
            // Initialize immediately
            initializeLayoutNotifications();
            initializePresenceEngine();
        } else {
            // Use global navbar auth check
            if (window.globalNavbar) {
                window.globalNavbar.checkAuthStatus().then(() => {
                    if (window.currentUser) {
                        initializeLayoutNotifications();
                        initializePresenceEngine();
                    }
                }).catch(() => {});
            }
        }
    }, 50); // Small delay to ensure layout-user-data.js has finished
});

// Initialize Presence Engine bindings for layout-level dots
function initializePresenceEngine() {
    const pollInterval = setInterval(() => {
        if (!window.Presence || !window.Presence.initialized) {
            return;
        }

        clearInterval(pollInterval);

        const registerDots = (root = document) => {
            const selectors = '.online-dot-results[data-user-id]';
            root.querySelectorAll(selectors).forEach(element => {
                const userId = element.dataset.userId;
                if (userId) {
                    window.Presence.bindIndicator(element, userId, { variant: 'dot' });
                }
            });
        };

        registerDots();

        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        registerDots(node);
                    }
                });
            });
        });

        observer.observe(document.body, { childList: true, subtree: true });
    }, 300);
}

// WebSocket notification system for layout
let layoutSocket = null;
let layoutSocketInitializing = false;
let socketIoClientPromise = null;
let layoutNotificationRetryTimer = null;

function getLayoutCurrentUser() {
    const body = document.body;
    const bodyUserId = body?.getAttribute('data-user-id');
    const parsedBodyUserId = bodyUserId && bodyUserId !== 'null' && bodyUserId !== ''
        ? parseInt(bodyUserId, 10)
        : null;

    const sessionUser = window.sessionManager?.getCurrentUser?.() || null;
    const mergedUser = {
        ...(sessionUser || {}),
        ...(window.currentUser || {})
    };

    const resolvedId = mergedUser.id || parsedBodyUserId;
    if (!resolvedId) {
        return null;
    }

    return {
        ...mergedUser,
        id: resolvedId,
        real_name: mergedUser.real_name || body?.getAttribute('data-user-real-name') || mergedUser.email || ''
    };
}

function scheduleLayoutNotificationInitialization() {
    if (layoutNotificationRetryTimer || layoutSocketInitializing || (layoutSocket && layoutSocket.connected)) {
        return;
    }

    layoutNotificationRetryTimer = setTimeout(() => {
        layoutNotificationRetryTimer = null;
        initializeLayoutNotifications();
    }, 250);
}

function ensureSocketIoClient() {
    if (typeof window.io !== 'undefined') {
        return Promise.resolve(window.io);
    }

    if (socketIoClientPromise) {
        return socketIoClientPromise;
    }

    socketIoClientPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = '/socket.io/socket.io.js';
        script.async = true;
        script.onload = () => {
            if (typeof window.io !== 'undefined') {
                resolve(window.io);
            } else {
                reject(new Error('Socket.IO global unavailable after load'));
            }
        };
        script.onerror = () => reject(new Error('Socket.IO client script failed to load'));
        document.head.appendChild(script);
    }).catch(error => {
        socketIoClientPromise = null;
        throw error;
    });

    return socketIoClientPromise;
}

function initializeLayoutNotifications() {
    const currentUser = getLayoutCurrentUser();
    if (!currentUser || !currentUser.id) {
        scheduleLayoutNotificationInitialization();
        return;
    }

    window.currentUser = {
        ...(window.currentUser || {}),
        ...currentUser
    };

    if (window.PresenceConfig && window.PresenceConfig.socketEnabled === false) {
        return;
    }
    
    if (layoutSocket && layoutSocket.connected) {
        return;
    }

    if (typeof window.io === 'undefined') {
        ensureSocketIoClient()
            .then(() => {
                initializeLayoutNotifications();
            })
            .catch(() => {});
        return;
    }

    if (layoutSocketInitializing) {
        return;
    }

    try {
        // Use WebSocket-only transport to avoid CSP unsafe-eval violations
        layoutSocketInitializing = true;
        layoutSocket = window.io({
            transports: ['websocket']
        });

        layoutSocket.on('connect', () => {
            layoutSocketInitializing = false;
            const connectedUser = getLayoutCurrentUser();
            if (!connectedUser || !connectedUser.id) {
                scheduleLayoutNotificationInitialization();
                return;
            }
            // Authenticate the socket connection
            const authData = {
                userId: connectedUser.id,
                real_name: connectedUser.real_name || connectedUser.email
            };
            layoutSocket.emit('authenticate', authData);
        });

        layoutSocket.on('authenticated', (data) => {
            // Update badge after authentication
            updateMessageBadge();
            updateTalkNotificationBadge();
        });

        layoutSocket.on('auth_error', (error) => {
            // Silent error handling
        });

        layoutSocket.on('disconnect', (reason) => {
            // Silent disconnect handling
        });

        layoutSocket.on('connect_error', (error) => {
            layoutSocketInitializing = false;
            // Silent error handling
        });

        // Listen for new messages
        layoutSocket.on('new_message', async (messageData) => {
            const activeUser = getLayoutCurrentUser();
            if (!activeUser || !activeUser.id) {
                return;
            }

            // Check if this message is for the current user
            if (messageData.receiverId == activeUser.id) {
                // Prevent duplicate notifications by checking source and message ID
                const messageKey = `${messageData.id}_${messageData.source || 'unknown'}`;
                if (window.processedMessages && window.processedMessages.has(messageKey)) {
                    return;
                }
                
                // Mark this message as processed
                if (!window.processedMessages) window.processedMessages = new Set();
                window.processedMessages.add(messageKey);
                
                // Clean up old processed messages (keep only last 10)
                if (window.processedMessages.size > 10) {
                    const firstKey = window.processedMessages.values().next().value;
                    window.processedMessages.delete(firstKey);
                }
                
                // Update message badge
                updateMessageBadge();
                
                // Update talk notification badge with new message count
                updateTalkNotificationBadge();
                
                // Show notifications on all pages
                // Flash inbox tab red
                flashInboxTab();
                
                // Show layout notification
                showLayoutNotification(messageData);
                playNotificationSound('receiver');
            }
        });

        // Listen for message sent confirmations
        layoutSocket.on('message_sent', async (messageData) => {
            updateMessageBadge();
            updateTalkNotificationBadge();
        });

    } catch (error) {
        layoutSocketInitializing = false;
        // Silent error handling
    }
}

// Update message notification badge
window.updateMessageBadge = async function() {
    try {
        // Get unread message count
        const response = await fetch(`/api/messages/count?user_id=${window.currentUser.id}`);
        const data = await response.json();
        
        if (data.success) {
            const totalCount = data.total_count || 0;
            const unreadCount = data.unread_count || 0;
            
            // Update layout badge (messages-badge) - show total count
            const layoutBadge = document.getElementById('messages-badge');
            if (layoutBadge) {
                if (totalCount > 0) {
                    layoutBadge.textContent = totalCount;
                    layoutBadge.style.display = 'inline-block';
                } else {
                    layoutBadge.style.display = 'none';
                }
            }
            
            // Update messages page badge (inbox-notification-badge) - show total count
            const inboxBadge = document.getElementById('inbox-notification-badge');
            if (inboxBadge) {
                if (totalCount > 0) {
                    inboxBadge.textContent = totalCount;
                    inboxBadge.style.display = 'flex';
                } else {
                    inboxBadge.style.display = 'none';
                }
            }
            

        }
    } catch (error) {
        // Silent error handling
    }
}

// Update talk notification badge with new message count
window.updateTalkNotificationBadge = async function() {
    try {
        // Get unread message count for new messages
        const response = await fetch(`/api/messages/count?user_id=${window.currentUser.id}`);
        const data = await response.json();
        
        if (data.success) {
            const unreadCount = data.unread_count || 0;
            
            // Update talk notification badge - show unread count
            const talkBadge = document.getElementById('talk-notification-badge');
            if (talkBadge) {
                if (unreadCount > 0) {
                    talkBadge.textContent = unreadCount;
                    talkBadge.style.display = 'flex';
                } else {
                    talkBadge.style.display = 'none';
                }
            }
            
                const talkBadgeMobile = document.getElementById('talk-notification-badge-mobile');
                if (talkBadgeMobile) {
                    if (unreadCount > 0) {
                        talkBadgeMobile.textContent = unreadCount;
                        talkBadgeMobile.style.display = 'flex';
                    } else {
                        talkBadgeMobile.style.display = 'none';
                    }
                }
        }
    } catch (error) {
        // Silent error handling
    }
}

// Show notification in layout
function showLayoutNotification(messageData) {
    const senderName = messageData.senderUsername || messageData.sender_real_name || 'Someone';

    // Create a dedicated host node outside any scroll container
    const notification = document.createElement('div');
    notification.setAttribute('data-layout-toast', '1');

    // Use fully inline styles — immune to CSS class conflicts and overflow-x:hidden on body
    Object.assign(notification.style, {
        position: 'fixed',
        top: '20px',
        right: '20px',
        background: 'rgba(30, 30, 50, 0.97)',
        color: '#fff',
        borderRadius: '12px',
        boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        zIndex: '2147483647',
        maxWidth: '340px',
        minWidth: '240px',
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        border: '1px solid rgba(255,255,255,0.18)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontSize: '14px',
        lineHeight: '1.45',
        transition: 'opacity 0.3s ease',
        opacity: '1',
        boxSizing: 'border-box',
        userSelect: 'none',
    });

    notification.innerHTML = `
        <span style="font-size:1.3rem;flex-shrink:0;line-height:1;">&#9993;</span>
        <div style="flex:1;min-width:0;overflow:hidden;">
            <div style="font-weight:700;font-size:0.9rem;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">New Message!</div>
            <div style="font-size:0.82rem;opacity:0.75;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">From ${senderName}</div>
        </div>
        <button data-close-toast style="background:none;border:none;color:rgba(255,255,255,0.55);cursor:pointer;padding:2px 4px;font-size:1rem;line-height:1;flex-shrink:0;border-radius:4px;" aria-label="Close">&#x2715;</button>
    `;

    // Close button
    notification.querySelector('[data-close-toast]').addEventListener('click', (e) => {
        e.stopPropagation();
        notification.remove();
    });

    // Click anywhere on notification (except close) to go to Talk
    notification.addEventListener('click', () => {
        window.location.href = '/talk.html';
    });

    // Append to documentElement (<html>) to escape overflow-x:hidden on body
    document.documentElement.appendChild(notification);

    // Fade out then remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            setTimeout(() => notification.parentNode && notification.remove(), 350);
        }
    }, 5000);
}

// Flash inbox tab red when new message arrives (original effect)
function flashInboxTab() {
    const inboxTab = document.getElementById('inbox-tab');
    if (inboxTab) {
        // Add a pulsing animation
        inboxTab.style.animation = 'pulse 1s ease-in-out';
        inboxTab.style.backgroundColor = '#ff6b6b';
        inboxTab.style.color = 'white';
        
        // Reset after animation
        setTimeout(() => {
            inboxTab.style.animation = '';
            inboxTab.style.backgroundColor = '';
            inboxTab.style.color = '';
        }, 1000);
    }
}

// Play notification sound - different sounds for sender vs receiver
function playNotificationSound(type = 'receiver') {
    // Use only one sound method to prevent duplicates
    try {
        // Resume audio context if suspended (browser requirement)
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        const startTime = audioContext.currentTime;
        
        if (type === 'sender') {
            // Gentle Drop for sender - soft descending note like a water drop
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(1200, startTime);
            oscillator.frequency.exponentialRampToValueAtTime(600, startTime + 0.15);
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.12, startTime + 0.03);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.2);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.2);
        } else {
            // Cute Pop for receiver - quick bubbly sound like a soft pop
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, startTime);
            oscillator.frequency.exponentialRampToValueAtTime(1200, startTime + 0.08);
            
            gainNode.gain.setValueAtTime(0, startTime);
            gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.1);
            
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.1);
        }
        
        return; // Exit here if successful
    } catch (error) {
        // Silent error handling
    }
    
    // Only use fallback if Web Audio API completely fails
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiRVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT');
        audio.volume = 0.2; // Lower volume for softer fallback
        audio.play().catch(e => {
            // Silent error handling
        });
    } catch (fallbackError) {
        // Silent error handling
    }
}

// Initialize message badge on page load
document.addEventListener('DOMContentLoaded', function() {
    const currentUser = getLayoutCurrentUser();
    if (currentUser && currentUser.id) {
        window.currentUser = {
            ...(window.currentUser || {}),
            ...currentUser
        };
        updateMessageBadge();
        updateTalkNotificationBadge();
    } else {
        scheduleLayoutNotificationInitialization();
    }
    
    // Set up logout handling for online tracker
    setupLogoutHandling();
    
    // Account icon color is now set server-side to prevent jumping
});

// Toggle account dropdown
function toggleAccountDropdown(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('account-dropdown');
    const icon = document.getElementById('account-icon');
    const isVisible = dropdown && dropdown.style.display === 'block';
    
    // Close all dropdowns first
    document.querySelectorAll('.account-dropdown').forEach(d => {
        d.style.display = 'none';
    });
    
    // Toggle this dropdown
    if (dropdown && !isVisible) {
        dropdown.style.display = 'block';
        icon?.setAttribute('aria-expanded', 'true');
    } else {
        icon?.setAttribute('aria-expanded', 'false');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function(event) {
    const dropdown = document.getElementById('account-dropdown');
    const icon = document.getElementById('account-icon');
    const wrapper = document.querySelector('.account-icon-wrapper');
    
    if (dropdown && icon && wrapper && 
        !dropdown.contains(event.target) && 
        !icon.contains(event.target) && 
        !wrapper.contains(event.target)) {
        dropdown.style.display = 'none';
        icon.setAttribute('aria-expanded', 'false');
    }
});

// Setup logout handling with online activity tracker
function setupLogoutHandling() {
    const logoutLinks = document.querySelectorAll('a[href*="/logout"]');
    logoutLinks.forEach(link => {
        link.addEventListener('click', window.handleLogout);
    });
}

