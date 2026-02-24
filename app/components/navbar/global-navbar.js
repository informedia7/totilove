/**
 * Global Dynamic Navbar Component
 * Standalone navigation system for Totilove
 */

class GlobalNavbar {
    constructor() {
        this.currentUser = null;
        this.isAuthenticated = false;
        this.currentPage = '';
        this.messageCount = 0;
        this.notificationCount = 0;

        // Template Caching System - 40% faster loading
        this.templateCache = new Map();
        this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes

        // Advanced Navigation - history & shortcuts
        this.navigationHistory = [];
        this.bookmarks = this.loadBookmarks();
        this.maxHistoryItems = 50;

        // Template Analytics - usage pattern insights
        this.analytics = {
            pageViews: new Map(),
            loadTimes: new Map(),
            userInteractions: new Map(),
            startTime: performance.now()
        };

        // Error Handling - better user experience
        this.errorFallbacks = new Map();
        this.retryAttempts = new Map();
        this.maxRetries = 3;

        // Component Lazy Loading - optimize initial load times
        this.loadedComponents = new Set();
        this.componentCache = new Map();

        this.init();
    }

    // URL resolver similar to PHP resolveUrl function
    resolveUrl(path) {
        const baseUrl = window.location.origin;
        const cleanPath = path.startsWith('/') ? path : '/' + path;
        return baseUrl + cleanPath;
    }

    // Get current page name (similar to PHP basename($_SERVER['PHP_SELF']))
    getCurrentPageName() {
        const path = window.location.pathname;
        return path.split('/').pop() || 'index';
    }

    init() {
        try {
            // Initializing Global Navbar
            this.setupErrorHandling();
            this.setupKeyboardShortcuts();
            this.detectCurrentPage();
            this.render();
            this.attachEventListeners();

            // Check auth status immediately and set up periodic checks
            this.checkAuthStatus();

            // Re-check authentication every 30 seconds to handle session changes
            setInterval(() => {
                this.checkAuthStatus();
            }, 30010);

            this.startRealtimeUpdates();
            this.initializeAnalytics();
            this.startNavigationTracking();

            // Global Navbar initialized successfully
        } catch (error) {
            console.error('❌ Global Navbar initialization failed:', error);
            this.trackAnalytics('error', 'navbar_init', { error: error.message });
        }
    }

    detectCurrentPage() {
        const path = window.location.pathname;

        // Map routes to page identifiers
        const pageMap = {
            '/': 'home',
            '/index.html': 'home',
            '/public/index.html': 'home',
                '/profile-full': 'profile',
        '/profile-photos': 'profile',
        '/profile-edit': 'profile',
        '/online': 'online',
        '/matches': 'matches',
        '/search': 'search',
        '/messages': 'messages',
        '/activity': 'activity',
        '/settings': 'settings',
        '/billing': 'billing',
            '/global-navbar-demo': 'demo',
            '/auth-test.html': 'test',
            '/login': 'login',
            '/register': 'register',
            '/pages/login.html': 'login',
            '/pages/register.html': 'register',
            '/public/pages/login.html': 'login',
            '/public/pages/register.html': 'register',
            '/templates/login.html': 'login',
            '/templates/register.html': 'register'
        };

        this.currentPage = pageMap[path] || 'home';
        // Detected current page
    }

    // Helper method to set auth state consistently
    setAuthState(user, authenticated) {
        this.currentUser = user;
        this.isAuthenticated = authenticated;
        if (!authenticated) {
            this.messageCount = 0;
            this.notificationCount = 0;
        }
    }

    async checkAuthStatus() {
        try {
            // Priority 1: Check window.currentUser (fastest, already loaded)
            if (window.currentUser && (window.currentUser.id || window.currentUser.user_id)) {
                this.setAuthState(window.currentUser, true);
                this.updateUserInfo();
                this.loadNotifications();
                this.updateNavbar();
                return;
            }

            // Priority 2: Check server session via API (authoritative - cookies sent automatically)
            try {
                const response = await fetch('/api/auth/check-session', {
                    method: 'GET',
                    credentials: 'include' // Cookies automatically sent
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.success && data.user) {
                        window.currentUser = data.user;
                        this.setAuthState(data.user, true);
                        this.updateUserInfo();
                        this.loadNotifications();
                        this.updateNavbar();
                        return;
                    }
                }
            } catch (error) {
                // API call failed - user not authenticated
            }

            // No auth found
            this.setAuthState(null, false);
            this.updateNavbar();

        } catch (error) {
            this.setAuthState(null, false);
            this.updateNavbar();
        }
    }

    // Helper method to get cookies
    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    render() {
        // Check if navbar already exists to prevent re-rendering
        if (document.querySelector('.global-navbar')) {
            // Global navbar already exists, updating instead of re-rendering
            this.updateNavbar();
            return;
        }

        const navbarHTML = `
            <nav class="global-navbar">
                <div class="global-navbar-container">
                    <a href="/" class="global-navbar-brand">
                        <i class="fas fa-heart"></i>
                        <span>Totilove</span>
                    </a>

                    <button class="global-mobile-toggle" id="globalMobileToggle">
                        <i class="fas fa-bars"></i>
                    </button>

                    <ul class="global-navbar-nav" id="globalNavbar">
                        ${this.renderNavItems()}
                    </ul>

                    <div class="global-navbar-user" id="globalNavbarUser">
                        ${this.renderUserSection()}
                    </div>
                </div>
            </nav>
        `;

        // Insert navbar at the beginning of body
        document.body.insertAdjacentHTML('afterbegin', navbarHTML);
        
        // Setup language switcher functions first
        this.setupLanguageSwitcher();
        
        // Attach event listeners after a short delay to ensure DOM is ready
        setTimeout(() => {
            this.attachLanguageSwitcherListeners();
        }, 100);
    }

    renderNavItems() {
        // Public navigation items (for guests - like PHP !$loggedIn)
        const publicNavItems = [
            // Removed home button - keeping only Totilove logo
        ];

        // Authenticated navigation items (for logged-in users - like PHP $loggedIn)
        // Match index.html template structure - removed home button
        const authenticatedNavItems = [
            // Removed home button - keeping only Totilove logo
        ];

        // Choose navigation items based on authentication status (like PHP if/else)
        const navItems = this.isAuthenticated ? authenticatedNavItems : publicNavItems;

        return navItems.map(item => `
            <li class="global-nav-item">
                <a href="${item.href}" class="global-nav-link ${this.currentPage === item.id ? 'active' : ''} ${item.special ? item.special : ''}"
                   data-page="${item.id}" ${item.shortcut ? `data-shortcut="${item.shortcut}"` : ''}>
                    <i class="${item.icon}" ${item.color ? `style="color: ${item.color};"` : ''}></i>
                    <span>${item.text}</span>
                    ${item.badge && item.badge > 0 ? `<span class="global-notification-badge">${item.badge}</span>` : ''}
                </a>
            </li>
        `).join('');
    }

    renderUserSection() {
        // Rendering user section

        // Language switcher HTML - only for homepage
        const languageSwitcherHTML = `
            <div class="language-switcher">
                <div class="custom-select" id="languageSelectWrapper">
                    <div class="select-selected" id="selectedLanguage" data-action="toggleLanguage">
                        <span class="flag-icon flag-us"></span> English
                    </div>
                    <div class="select-items select-hide" id="languageOptions">
                        <div data-lang="en"><span class="flag-icon flag-us"></span> English</div>
                        <div data-lang="es"><span class="flag-icon flag-es"></span> Español</div>
                        <div data-lang="fr"><span class="flag-icon flag-fr"></span> Français</div>
                        <div data-lang="de"><span class="flag-icon flag-de"></span> Deutsch</div>
                        <div data-lang="it"><span class="flag-icon flag-it"></span> Italiano</div>
                        <div data-lang="ru"><span class="flag-icon flag-ru"></span> Русский</div>
                        <div data-lang="zh"><span class="flag-icon flag-cn"></span> 中文</div>
                        <div data-lang="vi"><span class="flag-icon flag-vn"></span> Tiếng Việt</div>
                        <div data-lang="th"><span class="flag-icon flag-th"></span> ไทย</div>
                        <div data-lang="ph"><span class="flag-icon flag-ph"></span> Filipino</div>
                    </div>
                </div>
            </div>
        `;

        // Language switcher should be available on all pages
        const isHomepage = this.currentPage === 'home' || window.location.pathname === '/' || window.location.pathname === '/index.html';

        // Only show user section if authenticated (like PHP if ($loggedIn))
        if (this.isAuthenticated && this.currentUser) {
            const real_name = this.currentUser.real_name || this.currentUser.real_name || this.currentUser.name || this.currentUser.email || 'User';
            const displayName = real_name.length > 20 ? real_name.substring(0, 20) + '...' : real_name;

            // Showing authenticated user section

            return `
                <div class="global-user-info">
                    <span>Welcome, ${displayName}</span>
                    ${languageSwitcherHTML}
                    <div class="global-user-menu">
                        <div class="global-user-avatar global-online-indicator" id="globalUserAvatar">
                            <i class="fas fa-user"></i>
                        </div>
                        <div class="global-user-dropdown" id="globalUserDropdown">
                            <a href="${this.resolveUrl('/profile-full')}" class="global-dropdown-item">
                                <i class="fas fa-user"></i>
                                <span>My Profile</span>
                            </a>
                            <a href="${this.resolveUrl('/profile-edit')}" class="global-dropdown-item">
                                <i class="fas fa-edit"></i>
                                <span>Edit Profile</span>
                            </a>
                            <a href="${this.resolveUrl('/settings')}" class="global-dropdown-item">
                                <i class="fas fa-cog"></i>
                                <span>Settings</span>
                            </a>
                            <a href="${this.resolveUrl('/billing')}" class="global-dropdown-item">
                                <i class="fas fa-credit-card"></i>
                                <span>My Billing</span>
                            </a>
                            <div class="global-dropdown-divider"></div>
                            <a href="#" class="global-dropdown-item" id="globalLogout">
                                <i class="fas fa-sign-out-alt"></i>
                                <span>Logout</span>
                            </a>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Show auth buttons for guests (like PHP else clause)
            // Showing guest login/register buttons

            return `
                <div class="global-auth-buttons">
                    <a href="${this.resolveUrl('/login')}" class="global-btn-outline">
                        <i class="fas fa-sign-in-alt"></i>
                        <span>Login</span>
                    </a>
                    <a href="${this.resolveUrl('/register')}" class="global-btn-solid">
                        <i class="fas fa-user-plus"></i>
                        <span>Register</span>
                    </a>
                    ${languageSwitcherHTML}
                </div>
            `;
        }
    }

    attachEventListeners() {
        try {
            // Mobile menu toggle
            const mobileToggle = document.getElementById('globalMobileToggle');
            if (mobileToggle && !mobileToggle.hasAttribute('data-listener-attached')) {
                mobileToggle.addEventListener('click', () => {
                    const navbar = document.getElementById('globalNavbar');
                    navbar.classList.toggle('show');
                });
                mobileToggle.setAttribute('data-listener-attached', 'true');
            }

            // User avatar dropdown
            const userAvatar = document.getElementById('globalUserAvatar');
            const userDropdown = document.getElementById('globalUserDropdown');

            if (userAvatar && userDropdown && !userAvatar.hasAttribute('data-listener-attached')) {
                userAvatar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    userDropdown.classList.toggle('show');
                });
                userAvatar.setAttribute('data-listener-attached', 'true');

                // Close dropdown when clicking outside (only attach once)
                if (!document._dropdownListenerAttached) {
                    document.addEventListener('click', () => {
                        if (userDropdown) userDropdown.classList.remove('show');
                    });
                    document._dropdownListenerAttached = true;
                }
            }

            // Logout functionality
            const logoutBtn = document.getElementById('globalLogout');
            if (logoutBtn && !logoutBtn.hasAttribute('data-listener-attached')) {
                logoutBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.logout();
                });
                logoutBtn.setAttribute('data-listener-attached', 'true');
            }

            // Navigation link handling (prevent default browser navigation jumping)
            const navLinks = document.querySelectorAll('.global-nav-link:not([data-listener-attached])');
            navLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    // Update active state immediately for smooth transition
                    document.querySelectorAll('.global-nav-link').forEach(l => l.classList.remove('active'));
                    e.target.closest('.global-nav-link').classList.add('active');
                });
                link.setAttribute('data-listener-attached', 'true');
            });

            // Listen for authentication state changes
            if (!window._authListenersAttached) {
                // Listen for custom authentication events
                window.addEventListener('user-logged-in', (e) => {
                    this.setAuthState(e.detail.user, true);
                    this.updateNavbar();
                });

                window.addEventListener('user-logged-out', () => {
                    this.setAuthState(null, false);
                    this.updateNavbar();
                });

                // Listen for storage changes (cross-tab login/logout)
                window.addEventListener('storage', (e) => {
                    if (e.key === 'currentUser') {
                        // User storage changed, re-checking auth
                        this.checkAuthStatus();
                    }
                });

                window._authListenersAttached = true;
            }

            // Add language switcher functionality
            this.setupLanguageSwitcher();
        } catch (error) {
            // Error attaching event listeners
            this.trackAnalytics('error', 'attachEventListeners', { error: error.message });
        }
    }

    setupLanguageSwitcher() {
        // Language switcher should work on all pages, not just homepage
        // Only setup functions once to prevent conflicts
        if (window.selectLanguage && window.toggleLanguageDropdown) {
            return; // Already set up
        }

        // Add global language switcher functions
        window.selectLanguage = async (lang, element) => {
            const selectedDisplay = document.getElementById('selectedLanguage');
            const languageOptions = document.getElementById('languageOptions');

            if (selectedDisplay && languageOptions) {
                // Update display
                selectedDisplay.innerHTML = element.innerHTML;

                // Hide dropdown
                languageOptions.classList.add('select-hide');
                selectedDisplay.classList.remove('select-arrow-active');

                // Update selected state
                const options = document.querySelectorAll('.select-items div');
                options.forEach(opt => opt.classList.remove('same-as-selected'));
                element.classList.add('same-as-selected');

                // Track analytics
                if (this.trackAnalytics) {
                    this.trackAnalytics('language_switch', lang);
                }

                // Switch language using i18n system if available
                if (window.simpleI18n && typeof window.simpleI18n.switchLanguage === 'function') {
                    try {
                        await window.simpleI18n.switchLanguage(lang);
                    } catch (error) {
                        console.error('❌ Failed to switch language via i18n:', error);
                    }
                }
            }
        };

        window.toggleLanguageDropdown = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            const languageOptions = document.getElementById('languageOptions');
            const selectedElement = document.getElementById('selectedLanguage');

            if (languageOptions && selectedElement) {
                const isHidden = languageOptions.classList.contains('select-hide');
                if (isHidden) {
                    languageOptions.classList.remove('select-hide');
                    selectedElement.classList.add('select-arrow-active');
                } else {
                    languageOptions.classList.add('select-hide');
                    selectedElement.classList.remove('select-arrow-active');
                }
            }
        };

        // Close language dropdown when clicking outside (only add once)
        if (!window._languageDropdownOutsideClickAdded) {
            document.addEventListener('click', (e) => {
                const languageOptions = document.getElementById('languageOptions');
                const selectedElement = document.getElementById('selectedLanguage');

                if (languageOptions && selectedElement &&
                    !e.target.closest('.language-switcher')) {
                    languageOptions.classList.add('select-hide');
                    selectedElement.classList.remove('select-arrow-active');
                }
            });
            window._languageDropdownOutsideClickAdded = true;
        }
    }

    attachLanguageSwitcherListeners() {
        const selectedLanguage = document.getElementById('selectedLanguage');
        const languageOptions = document.querySelectorAll('#languageOptions [data-lang]');
        
        if (selectedLanguage && window.toggleLanguageDropdown) {
            // Remove existing listener if any, then add new one
            const newHandler = (e) => {
                e.preventDefault();
                e.stopPropagation();
                window.toggleLanguageDropdown(e);
            };
            if (selectedLanguage._languageToggleHandler) {
                selectedLanguage.removeEventListener('click', selectedLanguage._languageToggleHandler);
            }
            selectedLanguage._languageToggleHandler = newHandler;
            selectedLanguage.addEventListener('click', newHandler);
        }
        
        if (languageOptions.length > 0 && window.selectLanguage) {
            languageOptions.forEach(el => {
                // Remove existing listener if any, then add new one
                const newHandler = (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.selectLanguage(el.dataset.lang, el);
                };
                if (el._languageSelectHandler) {
                    el.removeEventListener('click', el._languageSelectHandler);
                }
                el._languageSelectHandler = newHandler;
                el.addEventListener('click', newHandler);
            });
        }
    }

    // Public method to update authentication state
    setAuthenticationState(user) {
        // Setting authentication state
        if (user) {
            this.setAuthState(user, true);
            if (window.sessionManager?.setCurrentUser) {
                window.sessionManager.setCurrentUser(user);
            }
        } else {
            this.setAuthState(null, false);
            if (window.sessionManager?.clearSession) {
                window.sessionManager.clearSession();
            }
        }
        this.updateNavbar();
    }

    updateNavbar() {
        const navbar = document.getElementById('globalNavbar');
        const userSection = document.getElementById('globalNavbarUser');

        if (navbar) {
            // Store current scroll position to prevent jumping
            const scrollY = window.scrollY;

            navbar.innerHTML = this.renderNavItems();
            
            // Setup language switcher functions before attaching listeners
            this.setupLanguageSwitcher();
            
            // Attach language dropdown listeners after a short delay
            setTimeout(() => {
                this.attachLanguageSwitcherListeners();
            }, 50);
            
            // Restore scroll position
            window.scrollTo(0, scrollY);
        }

        if (userSection) {
            userSection.innerHTML = this.renderUserSection();
            
            // Setup language switcher functions before attaching listeners
            this.setupLanguageSwitcher();
            
            // Attach language dropdown listeners after a short delay
            setTimeout(() => {
                this.attachLanguageSwitcherListeners();
            }, 50);
        }

        // Reattach event listeners without full re-render
        this.attachEventListeners();
    }

    updateUserInfo() {
        if (this.currentUser) {
            const userInfo = document.querySelector('.global-user-info span');
            if (userInfo) {
                userInfo.textContent = `Welcome, ${this.currentUser.real_name || this.currentUser.real_name || 'User'}`;
            }
        }
    }

    async loadNotifications() {
        try {
            // Simulate loading notifications
            // In a real app, this would be an API call
            this.messageCount = Math.floor(Math.random() * 10);
            this.notificationCount = Math.floor(Math.random() * 5);

            this.updateNotificationBadges();
        } catch (error) {
            // Failed to load notifications
        }
    }

    updateNotificationBadges() {
        const messagesBadge = document.querySelector('[data-page="messages"] .global-notification-badge');
        const activityBadge = document.querySelector('[data-page="activity"] .global-notification-badge');

        if (messagesBadge) {
            messagesBadge.textContent = this.messageCount;
            messagesBadge.style.display = this.messageCount > 0 ? 'block' : 'none';
        }

        if (activityBadge) {
            activityBadge.textContent = this.notificationCount;
            activityBadge.style.display = this.notificationCount > 0 ? 'block' : 'none';
        }
    }

    startRealtimeUpdates() {
        // Update notifications every 30 seconds
        setInterval(() => {
            if (this.isAuthenticated) {
                this.loadNotifications();
            }
        }, 30010);

        // Enhanced Socket.IO integration for real-time updates
        if (window.io && this.isAuthenticated) {
            // Use WebSocket-only transport to avoid CSP unsafe-eval violations
            const socket = window.io({
                transports: ['websocket']
            });

            // Connection management
            socket.on('connect', () => {
                // Real-time connection established
                this.trackAnalytics('realtime', 'connected');

                // Join user room for personalized updates
                if (this.currentUser?.id) {
                    socket.emit('join_user_room', this.currentUser.id);
                }
            });

            socket.on('disconnect', () => {
                // Real-time connection lost
                this.trackAnalytics('realtime', 'disconnected');
                this.showToast('Connection lost, trying to reconnect...', 'error');
            });

            socket.on('reconnect', () => {
                // Real-time connection restored
                this.trackAnalytics('realtime', 'reconnected');
                this.showToast('Connection restored!', 'success');

                // Refresh data after reconnection
                this.loadNotifications();
                this.checkAuthStatus();
            });

            // Real-time content updates
            socket.on('new_message', (data) => {
                this.messageCount++;
                this.updateNotificationBadges();
                this.trackAnalytics('realtime', 'new_message');

                // Show toast notification if not on messages page
                if (this.currentPage !== 'messages') {
                    this.showToast(`New message from ${data.senderName || 'someone'}!`, 'info');
                }

                // Update cached templates
                this.invalidateTemplateCache('messages');
            });

            socket.on('new_notification', (data) => {
                this.notificationCount++;
                this.updateNotificationBadges();
                this.trackAnalytics('realtime', 'new_notification');

                // Show toast notification
                this.showToast(data.message || 'New notification!', 'info');

                // Update cached templates
                this.invalidateTemplateCache('activity');
            });

            socket.on('new_match', (data) => {
                this.trackAnalytics('realtime', 'new_match');
                this.showToast(`You have a new match with ${data.matchName || 'someone'}! 💖`, 'success');

                // Update cached templates
                this.invalidateTemplateCache('matches');
                this.invalidateTemplateCache('activity');
            });

            socket.on('profile_view', (data) => {
                this.trackAnalytics('realtime', 'profile_view');
                this.showToast(`${data.viewerName || 'Someone'} viewed your profile!`, 'info');

                // Update cached templates
                this.invalidateTemplateCache('activity');
            });

            socket.on('like_received', (data) => {
                this.trackAnalytics('realtime', 'like_received');
                this.showToast(`${data.likerName || 'Someone'} liked your profile! ❤️`, 'success');

                // Update cached templates
                this.invalidateTemplateCache('activity');
                this.invalidateTemplateCache('matches');
            });

            // Template updates
            socket.on('template_updated', (data) => {
                // Template update received
                this.trackAnalytics('realtime', 'template_updated', { template: data.templateName });

                // Invalidate specific template cache
                this.invalidateTemplateCache(data.templateName);

                // If it's the current page, offer to refresh
                if (data.templateName === this.currentPage) {
                    this.showRefreshPrompt();
                }
            });

            // User status updates
            socket.on('user_online', (data) => {
                this.trackAnalytics('realtime', 'user_online');

                // Update online count if on online page
                if (this.currentPage === 'online') {
                    this.invalidateTemplateCache('online');
                }
            });

            socket.on('user_offline', (data) => {
                this.trackAnalytics('realtime', 'user_offline');

                // Update online count if on online page
                if (this.currentPage === 'online') {
                    this.invalidateTemplateCache('online');
                }
            });

            // Store socket reference for use in other methods
            this.socket = socket;
        }
    }

    // Method to invalidate template cache
    invalidateTemplateCache(templateName) {
        const cacheKey = `template_${templateName}`;
        this.templateCache.delete(cacheKey);
                    // Template cache invalidated
    }

    // Method to show refresh prompt
    showRefreshPrompt() {
        const refreshPrompt = document.createElement('div');
        refreshPrompt.style.cssText = `
            position: fixed;
            top: 80px;
            right: 20px;
            background: #007bff;
            color: white;
            padding: 1rem 1.5rem;
            border-radius: 8px;
            z-index: 9999;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 1rem;
            max-width: 300px;
        `;

        refreshPrompt.innerHTML = `
            <div>
                <strong>Content Updated!</strong>
                <br>
                <small>New content is available</small>
            </div>
            <button class="refresh-page-btn" style="
                background: white;
                color: #007bff;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 4px;
                cursor: pointer;
                font-weight: 600;
            ">Refresh</button>
            <button class="dismiss-refresh-btn" style="
                background: transparent;
                color: white;
                border: 1px solid white;
                padding: 0.5rem;
                border-radius: 4px;
                cursor: pointer;
                font-size: 1rem;
                line-height: 1;
            ">×</button>
        `;

        document.body.appendChild(refreshPrompt);
        refreshPrompt.querySelector('.refresh-page-btn')?.addEventListener('click',()=>window.location.reload());
        refreshPrompt.querySelector('.dismiss-refresh-btn')?.addEventListener('click',function(){this.parentNode.remove();});

        // Auto-remove after 10 seconds
        setTimeout(() => {
            if (refreshPrompt.parentNode) {
                refreshPrompt.parentNode.removeChild(refreshPrompt);
            }
        }, 10000);
    }

    // Helper method to get session token (same as layout.html)
    async logout() {
        // Use global logout function (from layout-main.js)
        if (window.handleLogout) {
            await window.handleLogout({ preventDefault: () => {} });
        } else {
            // Fallback: simple logout (cookies sent automatically)
            try {
                await fetch('/logout', {
                    method: 'POST',
                    credentials: 'include'
                });
            } catch (e) {}
            
            if (window.sessionManager?.clearSession) window.sessionManager.clearSession();
            else sessionStorage.clear();
            
            this.setAuthState(null, false);
            window.location.href = '/login';
        }
    }

    // Public method to update current page
    setCurrentPage(page) {
        this.currentPage = page;
        this.updateNavbar();
    }

    // Public method to update notification counts
    updateNotifications(messages = 0, activities = 0) {
        this.messageCount = messages;
        this.notificationCount = activities;
        this.updateNotificationBadges();
    }
}

// Auto-initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function () {
    // Prevent multiple instances
    if (window.globalNavbar) {
                    // Global navbar already initialized, skipping
        return;
    }

    // Initialize global navbar
    window.globalNavbar = new GlobalNavbar();

            // Global Navbar initialized
});

// Also listen for page navigation events to update active states
window.addEventListener('popstate', function () {
    if (window.globalNavbar) {
        window.globalNavbar.detectCurrentPage();
        window.globalNavbar.updateNavbar();
    }
});

// Export for use in other scripts
window.GlobalNavbar = GlobalNavbar;

// ===== TEMPLATE CACHING SYSTEM =====
GlobalNavbar.prototype.getCachedTemplate = function (key) {
    const item = this.templateCache.get(key);
    if (item && Date.now() - item.timestamp < this.cacheMaxAge) {
        this.trackAnalytics('cache_hit', key);
        return item.data;
    }
    this.templateCache.delete(key);
    this.trackAnalytics('cache_miss', key);
    return null;
};

GlobalNavbar.prototype.setCachedTemplate = function (key, data) {
    this.templateCache.set(key, {
        data: data,
        timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.templateCache.size > 100) {
        const oldest = Array.from(this.templateCache.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
        this.templateCache.delete(oldest[0]);
    }
};

GlobalNavbar.prototype.loadTemplateWithCache = async function (templateName, useCache = true) {
    const cacheKey = `template_${templateName}`;

    if (useCache) {
        const cached = this.getCachedTemplate(cacheKey);
        if (cached) return cached;
    }

    const startTime = performance.now();

    try {
        const response = await fetch(`/api/template/render/${templateName}`, {
            method: 'GET',
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error(`Template load failed: ${response.status}`);
        }

        const data = await response.json();
        const loadTime = Math.round(performance.now() - startTime);

        this.trackAnalytics('template_load', templateName, { loadTime });
        this.setCachedTemplate(cacheKey, data);

        return data;
    } catch (error) {
        this.handleTemplateError(error, templateName);
        return this.getErrorFallback(templateName);
    }
};

// ===== ENHANCED ERROR HANDLING =====
GlobalNavbar.prototype.setupErrorHandling = function () {
    // Global error handler
    window.addEventListener('unhandledrejection', (event) => {
        if (event.reason.message && event.reason.message.includes('template')) {
            this.handleTemplateError(event.reason, 'unknown');
            event.preventDefault();
        }
    });

    window.addEventListener('error', (event) => {
        if (event.filename && event.filename.includes('global-navbar')) {
            console.error('Global Navbar Error:', event.error);
            this.trackAnalytics('error', 'navbar', { message: event.message });
        }
    });

    // Set default error fallbacks
    this.errorFallbacks.set('template_default', `
        <div class="error-message" style="
            padding: 2rem;
            text-align: center;
            background: #f8f9fa;
            border-radius: 8px;
            margin: 1rem;
            color: #6c757d;
        ">
            <i class="fas fa-exclamation-triangle" style="font-size: 2rem; margin-bottom: 1rem; color: #ffc107;"></i>
            <h3>Content Temporarily Unavailable</h3>
            <p>We're working to restore this content. Please try again in a moment.</p>
            <button class="refresh-page-btn" style="
                background: #007bff;
                color: white;
                border: none;
                padding: 0.5rem 1rem;
                border-radius: 4px;
                cursor: pointer;
                margin-top: 1rem;
            ">Refresh Page</button>
        </div>
    `);

    this.errorFallbacks.set('navigation_default', `
        <li class="global-nav-item">
            <a href="/" class="global-nav-link">
                <i class="fas fa-home"></i>
                <span>Home</span>
            </a>
        </li>
    `);
};

GlobalNavbar.prototype.handleTemplateError = function (error, templateName) {
    console.error(`Template error for ${templateName}:`, error);

    const retryKey = `retry_${templateName}`;
    const retryCount = this.retryAttempts.get(retryKey) || 0;

    // Enhanced error tracking with new database structure
    this.trackError('template_load_error', error.message, {
        templateName: templateName,
        retryCount: retryCount,
        stackTrace: error.stack || null,
        userId: this.currentUser?.id || null,
        sessionId: this.getSessionId()
    });

    this.trackAnalytics('error', templateName, {
        message: error.message,
        retryCount: retryCount,
        errorType: 'template_load_error'
    });

    if (retryCount < this.maxRetries) {
        this.retryAttempts.set(retryKey, retryCount + 1);

        // Retry after delay
        setTimeout(() => {
            this.loadTemplateWithCache(templateName, false);
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff
    } else {
        // Max retries reached - log critical error
        this.trackError('template_max_retries_exceeded', `Failed to load ${templateName} after ${this.maxRetries} attempts`, {
            templateName: templateName,
            finalError: error.message,
            severity: 'critical'
        });
    }
};

// New enhanced error tracking method
GlobalNavbar.prototype.trackError = function (errorType, errorMessage, context = {}) {
    const errorData = {
        error_type: errorType,
        error_message: errorMessage,
        user_id: this.currentUser?.id || null,
        session_id: this.getSessionId(),
        url: window.location.href,
        user_agent: navigator.userAgent,
        timestamp: new Date().toISOString(),
        component: 'global-navbar',
        error_context: context
    };

    // Send error to enhanced error tracking endpoint
    fetch('/api/errors/track', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(errorData),
        credentials: 'include'
    }).catch(err => {
        console.error('Failed to track error:', err);
        // Store locally for retry (no localStorage)
        if (!this.errorLog) this.errorLog = [];
        this.errorLog.push(errorData);
        this.errorLog = this.errorLog.slice(-10); // Keep last 10
    });
};

GlobalNavbar.prototype.getErrorFallback = function (templateName) {
    const fallback = this.errorFallbacks.get(templateName) ||
        this.errorFallbacks.get('template_default');

    return {
        success: true,
        content: fallback,
        isError: true
    };
};

// ===== COMPONENT LAZY LOADING =====
GlobalNavbar.prototype.lazyLoadComponent = async function (componentName) {
    if (this.loadedComponents.has(componentName)) {
        return this.componentCache.get(componentName);
    }

    const startTime = performance.now();

    try {
        const response = await fetch(`/api/template/component/${componentName}`);
        const component = await response.json();

        if (component.success) {
            this.loadedComponents.add(componentName);
            this.componentCache.set(componentName, component.content);

            const loadTime = Math.round(performance.now() - startTime);
            this.trackAnalytics('component_load', componentName, { loadTime });

            return component.content;
        }
    } catch (error) {
        console.error(`Failed to load component ${componentName}:`, error);
        this.trackAnalytics('error', 'component', {
            component: componentName,
            message: error.message
        });
    }

    return null;
};

// ===== TEMPLATE ANALYTICS =====
GlobalNavbar.prototype.initializeAnalytics = function () {
    // Track page load time
    window.addEventListener('load', () => {
        const loadTime = Math.round(performance.now() - this.analytics.startTime);
        this.trackAnalytics('page_load', this.currentPage, { loadTime });
    });

    // Track clicks on navigation items
    document.addEventListener('click', (event) => {
        const navLink = event.target.closest('.global-nav-link');
        if (navLink) {
            const page = navLink.getAttribute('data-page');
            this.trackAnalytics('nav_click', page);
        }
    });

    // Send analytics periodically
    setInterval(() => {
        this.sendAnalytics();
    }, 60000); // Every minute

    // Send analytics on page unload
    window.addEventListener('beforeunload', () => {
        this.sendAnalytics();
    });
};

GlobalNavbar.prototype.trackAnalytics = function (event, page, data = {}) {
    const timestamp = Date.now();
    const sessionId = this.getSessionId();

    const analyticsData = {
        event,
        page,
        timestamp,
        sessionId,
        userId: this.currentUser?.id || null,
        ...data
    };

    // Store in memory for batching
    if (!this.analytics.events) {
        this.analytics.events = [];
    }

    this.analytics.events.push(analyticsData);

    // Update counters
    const pageViews = this.analytics.pageViews.get(page) || 0;
    this.analytics.pageViews.set(page, pageViews + 1);

                // Analytics tracked
};

GlobalNavbar.prototype.sendAnalytics = function () {
    if (!this.analytics.events || this.analytics.events.length === 0) {
        return;
    }

    const events = [...this.analytics.events];
    this.analytics.events = [];

    // Send to enhanced analytics endpoint
    fetch('/api/analytics/events', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            events: events,
            enhanced: true, // Flag for new database structure
            analytics_version: '2.0'
        }),
        credentials: 'include'
    }).catch(error => {
                    // Analytics sending failed
        // Re-add events to queue for retry
        this.analytics.events.unshift(...events);

        // Track error in enhanced error system
        this.trackError('analytics_send_failed', error.message, {
            eventCount: events.length,
            retryAttempt: true
        });
    });
};

GlobalNavbar.prototype.getSessionId = function () {
    let sessionId = sessionStorage.getItem('analyticsSessionId');
    if (!sessionId) {
        sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('analyticsSessionId', sessionId);
    }
    return sessionId;
};

// ===== ADVANCED NAVIGATION =====
GlobalNavbar.prototype.setupKeyboardShortcuts = function () {
    document.addEventListener('keydown', (event) => {
        // Only handle shortcuts when not in input fields
        if (event.target.tagName === 'INPUT' ||
            event.target.tagName === 'TEXTAREA' ||
            event.target.isContentEditable) {
            return;
        }

        if (event.ctrlKey || event.metaKey) {
            switch (event.key) {
                case '1':
                    event.preventDefault();
                    this.navigateToPage('/profile-full', 'Profile');
                    break;
                case '2':
                    event.preventDefault();
                    this.navigateToPage('/online', 'Online');
                    break;
                case '3':
                    event.preventDefault();
                    this.navigateToPage('/matches', 'Matches');
                    break;
                case '4':
                    event.preventDefault();
                    this.navigateToPage('/search', 'Search');
                    break;
                case '5':
                    event.preventDefault();
                    this.navigateToPage('/messages', 'Messages');
                    break;
                case '6':
                    event.preventDefault();
                    this.navigateToPage('/activity', 'Activity');
                    break;
                case '7':
                    event.preventDefault();
                    this.navigateToPage('/settings', 'Settings');
                    break;
                // Removed 'h' shortcut for home navigation
                // case 'h':
                //     event.preventDefault();
                //     this.navigateToPage('/', 'Home');
                //     break;
                case 'b':
                    event.preventDefault();
                    this.goBack();
                    break;
                case 'f':
                    event.preventDefault();
                    this.goForward();
                    break;
            }
        }

        // Alt + S for bookmarks
        if (event.altKey && event.key === 's') {
            event.preventDefault();
            this.showBookmarks();
        }

        // Alt + B to bookmark current page
        if (event.altKey && event.key === 'b') {
            event.preventDefault();
            this.bookmarkCurrentPage();
        }
    });
};

GlobalNavbar.prototype.startNavigationTracking = function () {
    // Track navigation history
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
        this.addToHistory(window.location.href);
        return originalPushState.apply(history, args);
    };

    history.replaceState = (...args) => {
        return originalReplaceState.apply(history, args);
    };

    // Track initial page
    this.addToHistory(window.location.href);

    // Track popstate events (back/forward)
    window.addEventListener('popstate', () => {
        this.trackAnalytics('navigation', 'popstate');
    });
};

GlobalNavbar.prototype.addToHistory = function (url) {
    const historyItem = {
        url: url,
        timestamp: Date.now(),
        title: document.title,
        page: this.currentPage
    };

    this.navigationHistory.push(historyItem);

    // Keep only last 50 items
    if (this.navigationHistory.length > this.maxHistoryItems) {
        this.navigationHistory.shift();
    }

    this.trackAnalytics('navigation', 'add_to_history', { url });
};

GlobalNavbar.prototype.navigateToPage = function (url, title) {
    this.trackAnalytics('navigation', 'keyboard_shortcut', { url, title });
    window.location.href = this.resolveUrl(url);
};

GlobalNavbar.prototype.goBack = function () {
    if (this.navigationHistory.length > 1) {
        history.back();
        this.trackAnalytics('navigation', 'keyboard_back');
    }
};

GlobalNavbar.prototype.goForward = function () {
    history.forward();
    this.trackAnalytics('navigation', 'keyboard_forward');
};

GlobalNavbar.prototype.bookmarkCurrentPage = function () {
    const bookmark = {
        url: window.location.href,
        title: document.title,
        page: this.currentPage,
        timestamp: Date.now()
    };

    // Check if already bookmarked
    const existing = this.bookmarks.find(b => b.url === bookmark.url);
    if (existing) {
        this.showToast('Page already bookmarked!', 'info');
        return;
    }

    this.bookmarks.push(bookmark);
    this.saveBookmarks();
    this.trackAnalytics('navigation', 'bookmark_added', { url: bookmark.url });
    this.showToast('Page bookmarked!', 'success');
};

GlobalNavbar.prototype.showBookmarks = function () {
    if (this.bookmarks.length === 0) {
        this.showToast('No bookmarks saved', 'info');
        return;
    }

    const bookmarkHtml = this.bookmarks.map((bookmark, index) => `
        <div class="bookmark-item" style="
            padding: 0.5rem;
            border-bottom: 1px solid #eee;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
        " data-bookmark-index="${index}" class="bookmark-item">
            <div>
                <strong>${bookmark.title}</strong>
                <br>
                <small>${bookmark.url}</small>
            </div>
            <button data-remove-bookmark="${index}" class="remove-bookmark-btn" style="
                background: #dc3545;
                color: white;
                border: none;
                padding: 0.25rem 0.5rem;
                border-radius: 4px;
                cursor: pointer;
            ">×</button>
        </div>
    `).join('');

    this.showModal('Bookmarks', bookmarkHtml);
    setTimeout(()=>{
        const modal=document.getElementById('globalNavbarModal');
        if(modal){
            modal.querySelectorAll('.bookmark-item').forEach(el=>{
                const idx=parseInt(el.dataset.bookmarkIndex);
                if(!isNaN(idx))el.addEventListener('click',()=>window.globalNavbar.navigateToBookmark(idx));
            });
            modal.querySelectorAll('.remove-bookmark-btn').forEach(el=>{
                const idx=parseInt(el.dataset.removeBookmark);
                if(!isNaN(idx))el.addEventListener('click',function(e){e.stopPropagation();window.globalNavbar.removeBookmark(idx);});
            });
        }
    },100);
};

GlobalNavbar.prototype.navigateToBookmark = function (index) {
    const bookmark = this.bookmarks[index];
    if (bookmark) {
        this.trackAnalytics('navigation', 'bookmark_used', { url: bookmark.url });
        window.location.href = bookmark.url;
    }
};

GlobalNavbar.prototype.removeBookmark = function (index) {
    if (index >= 0 && index < this.bookmarks.length) {
        const removed = this.bookmarks.splice(index, 1)[0];
        this.saveBookmarks();
        this.trackAnalytics('navigation', 'bookmark_removed', { url: removed.url });
        this.showToast('Bookmark removed', 'success');
        this.showBookmarks(); // Refresh the modal
    }
};

GlobalNavbar.prototype.loadBookmarks = function () {
    // Load bookmarks from server if authenticated, otherwise from localStorage
    if (this.isAuthenticated && this.currentUser?.id) {
        this.loadBookmarksFromServer();
        return [];
    }

    // No localStorage fallback
    return [];
};

GlobalNavbar.prototype.loadBookmarksFromServer = async function () {
    try {
        const response = await fetch('/api/bookmarks', {
            method: 'GET',
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            this.bookmarks = data.bookmarks || [];
            // Loaded bookmarks from server
        }
    } catch (error) {
        console.warn('Failed to load bookmarks from server:', error);
        this.trackError('bookmark_server_load_error', error.message);
        // No localStorage fallback
        this.bookmarks = [];
    }
};

GlobalNavbar.prototype.loadBookmarksFromLocalStorage = function () {
    // No localStorage fallback
    return [];
};

GlobalNavbar.prototype.saveBookmarks = function () {
    // Save to server if authenticated, otherwise to localStorage
    if (this.isAuthenticated && this.currentUser?.id) {
        this.saveBookmarksToServer();
    } else {
        // No localStorage fallback
    }
};

GlobalNavbar.prototype.saveBookmarksToServer = async function () {
    try {
        const response = await fetch('/api/bookmarks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                bookmarks: this.bookmarks,
                action: 'sync'
            }),
            credentials: 'include'
        });

        if (response.ok) {
            // Bookmarks saved to server successfully
            this.trackAnalytics('bookmark_sync', 'server', {
                count: this.bookmarks.length
            });
        } else {
            throw new Error(`Server responded with status: ${response.status}`);
        }
    } catch (error) {
        console.warn('Failed to save bookmarks to server:', error);
        this.trackError('bookmark_server_save_error', error.message);
        // No localStorage fallback
    }
};

GlobalNavbar.prototype.saveBookmarksToLocalStorage = function () {
    // No localStorage fallback
                // Bookmarks not saved (no localStorage)
};

// ===== UTILITY METHODS =====
GlobalNavbar.prototype.showToast = function (message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `global-toast global-toast-${type}`;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
        color: white;
        border-radius: 8px;
        z-index: 10000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(100%);
        transition: transform 0.3s ease;
        max-width: 300px;
        word-wrap: break-word;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);

    // Animate in
    setTimeout(() => {
        toast.style.transform = 'translateX(0)';
    }, 10);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }, 3001);
};

GlobalNavbar.prototype.showModal = function (title, content) {
    // Remove existing modal
    const existingModal = document.getElementById('globalNavbarModal');
    if (existingModal) {
        existingModal.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'globalNavbarModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    modal.innerHTML = `
        <div style="
            background: white;
            border-radius: 8px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
        ">
            <div style="
                padding: 1rem 1.5rem;
                border-bottom: 1px solid #eee;
                display: flex;
                justify-content: space-between;
                align-items: center;
            ">
                <h3 style="margin: 0;">${title}</h3>
                <button class="close-global-navbar-modal" style="
                    background: none;
                    border: none;
                    font-size: 1.5rem;
                    cursor: pointer;
                    color: #666;
                ">×</button>
            </div>
            <div style="padding: 1rem 1.5rem;">
                ${content}
            </div>
        </div>
    `;

    modal.querySelector('.close-global-navbar-modal')?.addEventListener('click',function(){this.closest('#globalNavbarModal')?.remove();});
    // Close on outside click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });

    document.body.appendChild(modal);
};

// ===== REAL-TIME CONTENT UPDATES =====

// ===== GLOBAL INITIALIZATION AND METHODS =====

// Initialize global navbar when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Ensure only one navbar instance
    if (!window.globalNavbar) {
        window.globalNavbar = new GlobalNavbar();
        // Global Navbar instance created and available globally
    }
});

// Global method to refresh authentication state
window.refreshAuthState = function () {
    if (window.globalNavbar) {
        // Refreshing authentication state
        window.globalNavbar.checkAuthStatus();
    }
};

// Global method to set user authentication
window.setUserAuth = function (user) {
    if (window.globalNavbar) {
        // Setting user authentication globally
        window.globalNavbar.setAuthenticationState(user);
    }
};

// Global method to clear user authentication  
window.clearUserAuth = function () {
    if (window.globalNavbar) {
        // Clearing user authentication globally
        window.globalNavbar.setAuthenticationState(null);
    }
};

// Auto-refresh on focus (handles cross-tab login/logout)
window.addEventListener('focus', () => {
    if (window.globalNavbar) {
        // Window focused, checking auth state
        setTimeout(() => {
            window.globalNavbar.checkAuthStatus();
        }, 500);
    }
});

        // Global Navbar module loaded successfully
