// Activity Page JavaScript
// Extracted from activity.html - Phase 1 CSS/JS Extraction

(function() {
    'use strict';
    
    // Get session token function
    function getSessionToken() {
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        
        if (urlToken) {
            return urlToken;
        }
        
        // Try session manager first (preferred method)
        if (window.sessionManager && window.sessionManager.getToken) {
            return window.sessionManager.getToken() || '';
        }
        
        // Try cookies as fallback
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'sessionToken') {
                return value;
            }
        }
        
        return '';
    }
    
    // Load ProfileModalActions module
    function loadProfileModalActions() {
        if (typeof window.ProfileModalActions === 'undefined') {
            const script = document.createElement('script');
            script.src = '/components/modals/profile-modal-actions.js';
            script.onload = function() {
                // Initialize with page-specific configuration
                if (window.ProfileModalActions) {
                    window.ProfileModalActions.init({
                        getCurrentUserId: () => ActivityManager.currentUserId,
                        getCurrentProfileUserId: () => window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null,
                        getSessionToken: getSessionToken,
                        showNotification: (message, type) => ActivityManager.showToast(message, type)
                    });
                }
            };
            script.onerror = function() {
                console.warn('⚠️ Failed to load ProfileModalActions module');
            };
            document.head.appendChild(script);
        } else {
            // Already loaded, just initialize
            if (window.ProfileModalActions) {
                window.ProfileModalActions.init({
                    getCurrentUserId: () => ActivityManager.currentUserId,
                    getCurrentProfileUserId: () => window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null,
                    getSessionToken: getSessionToken,
                    showNotification: (message, type) => ActivityManager.showToast(message, type)
                });
            }
        }
    }

    function showNotification(message, type = 'info', iconOverride = null) {
        const iconMap = {
            success: 'check-circle',
            error: 'exclamation-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle',
            favorite: 'star',
            like: 'heart'
        };
        const normalizedType = iconMap[type] ? type : 'info';
        const iconClass = iconOverride || iconMap[normalizedType];
        const notification = document.createElement('div');
        notification.className = `notification notification-${normalizedType}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${iconClass}"></i>
                <span>${message}</span>
            </div>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.classList.add('show'), 100);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 1800);
    }

    window.showNotification = showNotification;
    
    // Unblock confirmation modal functions
    function closeUnblockConfirm() {
        document.getElementById('unblockConfirmModal').style.display = 'none';
        ActivityManager.pendingUnblockUserId = null;
    }
    
    function confirmUnblock() {
        const userId = ActivityManager.pendingUnblockUserId;
        if (userId) {
            closeUnblockConfirm();
            ActivityManager.unblockUser(userId);
        }
    }
    
    // Close modal when clicking overlay
    document.addEventListener('DOMContentLoaded', function() {
        const overlay = document.querySelector('.unblock-confirm-overlay');
        if (overlay) {
            overlay.addEventListener('click', closeUnblockConfirm);
        }
    });
    
    // Activity data management
    const ActivityManager = {
        currentFilter: 'all',
        currentUserId: null,
        isDesktopView: false,
        desktopSectionOrder: ['viewers', 'favorites', 'messages', 'who-liked-me', 'who-i-like', 'blocked'],
        lazyObserver: null,
        lazyLoadedSections: null,
        lazyLoadingPromises: null,
        lazySectionHandlers: null,
        latestMessages: [],
        tabVisibilityMap: {
            all: ['viewers'],
            messages: ['messages'],
            views: ['viewers'],
            favorites: ['favorites'],
            likes: ['who-liked-me'],
            'my-likes': ['who-i-like'],
            blocked: ['blocked']
        },
        profileNameMap: new Map(),
        
        // Get user ID from current session
        getUserIdFromToken() {
            // Try from global currentUser first
            if (window.currentUser && window.currentUser.id) {
                return window.currentUser.id;
            }
            
            // Try from session manager
            if (window.sessionManager && typeof window.sessionManager.getCurrentUser === 'function') {
                const user = window.sessionManager.getCurrentUser();
                if (user && user.id) {
                    return user.id;
                }
            }
            
            return null;
        },
        
        // Initialize the activity page
        async init() {
            // Get current user ID
            this.currentUserId = this.getUserIdFromToken();

            this.lazyLoadedSections = new Set();
            this.lazyLoadingPromises = {};
            this.lazySectionHandlers = {
                favorites: () => this.loadFavorites(),
                'who-liked-me': () => this.loadWhoLikedMe(),
                'who-i-like': () => this.loadWhoILike(),
                blocked: () => this.loadBlockedUsers()
            };
            
            if (!this.currentUserId) {
                console.warn('⚠️ User ID not found, showing empty state...');
                // Don't redirect, just show empty state
            }
            
            await this.loadAllActivity();
            this.setupEventListeners();
            this.setupSectionCollapsing();
            this.setupViewportMode();
            this.applyActiveTabState();
        },
        
        // Load all activity data
        async loadAllActivity() {
            await Promise.all([
                this.loadViewers(),
                this.loadMessages()
            ]);

            if (!this.lazyLoadedSections) {
                this.lazyLoadedSections = new Set();
            }
            this.lazyLoadedSections.add('viewers');
            this.lazyLoadedSections.add('messages');

            this.prepareLazySections();
        },

        prepareLazySections() {
            const handlers = this.lazySectionHandlers || {};
            const lazySections = Object.keys(handlers);
            if (!lazySections.length) {
                return;
            }

            const targets = lazySections
                .filter((section) => !this.lazyLoadedSections.has(section))
                .map((section) => ({
                    section,
                    element: document.querySelector(`[data-section="${section}"]`)
                }))
                .filter((item) => item.element);

            if (!targets.length) {
                return;
            }

            if (!('IntersectionObserver' in window)) {
                targets.forEach((target) => this.triggerLazyLoad(target.section));
                return;
            }

            this.lazyObserver = new IntersectionObserver((entries, observer) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        const sectionName = entry.target.dataset.section;
                        if (sectionName) {
                            this.triggerLazyLoad(sectionName);
                        }
                        observer.unobserve(entry.target);
                    }
                });
            }, { rootMargin: '200px 0px 0px' });

            targets.forEach(({ element }) => this.lazyObserver.observe(element));
        },

        triggerLazyLoad(sectionName) {
            if (!sectionName) {
                return Promise.resolve();
            }

            this.lazyLoadingPromises = this.lazyLoadingPromises || {};

            if (this.lazyLoadedSections?.has(sectionName)) {
                return this.lazyLoadingPromises[sectionName] || Promise.resolve();
            }

            if (this.lazyLoadingPromises[sectionName]) {
                return this.lazyLoadingPromises[sectionName];
            }

            const loader = this.lazySectionHandlers?.[sectionName];
            if (typeof loader !== 'function') {
                return Promise.resolve();
            }

            const loadPromise = Promise.resolve(loader()).then(() => {
                this.lazyLoadedSections.add(sectionName);
            }).finally(() => {
                delete this.lazyLoadingPromises[sectionName];
            });

            this.lazyLoadingPromises[sectionName] = loadPromise;
            return loadPromise;
        },

        setupSectionCollapsing() {
            if (typeof window.matchMedia !== 'function') {
                return;
            }

            const mediaQuery = window.matchMedia('(max-width: 767px)');
            const applyState = () => {
                const isMobile = mediaQuery.matches;
                document.querySelectorAll('.activity-section[data-mobile-collapsed="true"]').forEach((section) => {
                    if (isMobile) {
                        const userPreference = section.dataset.userExpanded === 'true';
                        this.setSectionExpansion(section, userPreference, { persistPreference: false });
                    } else {
                        this.setSectionExpansion(section, true, { persistPreference: false });
                    }
                });
            };

            applyState();
            if (typeof mediaQuery.addEventListener === 'function') {
                mediaQuery.addEventListener('change', applyState);
            } else if (typeof mediaQuery.addListener === 'function') {
                mediaQuery.addListener(applyState);
            }
        },

        setupViewportMode() {
            if (typeof window.matchMedia !== 'function') {
                this.isDesktopView = false;
                return;
            }

            const desktopQuery = window.matchMedia('(min-width: 1024px)');
            const applyViewportState = () => {
                this.isDesktopView = desktopQuery.matches;
                this.applyActiveTabState();
            };

            applyViewportState();

            if (typeof desktopQuery.addEventListener === 'function') {
                desktopQuery.addEventListener('change', applyViewportState);
            } else if (typeof desktopQuery.addListener === 'function') {
                desktopQuery.addListener(applyViewportState);
            }
        },

        setSectionExpansion(section, shouldExpand, options = {}) {
            if (!section) {
                return;
            }

            section.classList.toggle('is-collapsed', !shouldExpand);
            const messagesList = section.querySelector('.messages-list');
            if (messagesList) {
                messagesList.style.display = shouldExpand ? 'grid' : 'none';
                messagesList.classList.toggle('grid', shouldExpand);
            }

            const messagesToggleIcon = section.querySelector('.messages-toggle-icon');
            if (messagesToggleIcon) {
                messagesToggleIcon.textContent = shouldExpand ? '−' : '+';
            }

            this.updateSectionToggleUI(section, shouldExpand);
            const header = section.querySelector('.section-header[role="button"]');
            if (header) {
                header.setAttribute('aria-expanded', shouldExpand ? 'true' : 'false');
            }

            const persistPreference = options.persistPreference !== false;
            if (persistPreference && section.dataset.mobileCollapsed === 'true') {
                section.dataset.userExpanded = shouldExpand ? 'true' : 'false';
            }
        },

        updateSectionToggleUI(section, isExpanded) {
            if (!section) {
                return;
            }

            const toggleBtn = section.querySelector('.section-toggle-btn');
            if (!toggleBtn) {
                return;
            }

            toggleBtn.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
            const icon = toggleBtn.querySelector('.toggle-icon');
            if (icon) {
                icon.textContent = isExpanded ? '−' : '+';
            }
        },
        
        // Load profile viewers
        async loadViewers() {
            try {
                // Show all recent viewers (not just today's) - the "X today" badge shows today's count separately
                const response = await fetch('/api/activity/viewers?limit=3', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderViewers(data.viewers);
                    this.updateViewersCount(data.todayCount, data.totalCount);
                }
            } catch (error) {
                console.error('Error loading viewers:', error);
                this.showError('.viewers-list', 'Failed to load viewers');
            }
        },
        
        // Load favorites
        async loadFavorites() {
            try {
                // Show only 6 favorites initially
                const response = await fetch('/api/activity/favorites?limit=6', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderFavorites(data.favorites);
                    this.updateFavoritesCount(data.totalCount);
                }
            } catch (error) {
                console.error('Error loading favorites:', error);
                this.showError('.favorites-grid', 'Failed to load favorites');
            }
        },
        
        // Load new messages
        async loadMessages() {
            try {
                const response = await fetch('/api/activity/messages?limit=50', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.latestMessages = Array.isArray(data.messages) ? data.messages : [];
                    this.renderMessages(this.latestMessages);
                    this.updateMessagesCount(data.unreadCount);
                }
            } catch (error) {
                console.error('Error loading messages:', error);
                this.latestMessages = [];
                this.showError('.messages-list', 'Failed to load messages');
            }
        },
        
        // Load likes
        async loadWhoLikedMe() {
            try {
                // Show all recent likes (not just today's) - the "X today" badge shows today's count separately
                const response = await fetch('/api/activity/who-liked-me?limit=6', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderWhoLikedMe(data.users);
                    this.updateWhoLikedMeCount(data.todayCount, data.totalCount);
                }
            } catch (error) {
                console.error('Error loading who liked me:', error);
                this.showError('.who-liked-me-grid', 'Failed to load who liked me');
            }
        },

        async loadWhoILike() {
            try {
                const response = await fetch('/api/activity/who-i-like?limit=6', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderWhoILike(data.users);
                    this.updateWhoILikeCount(data.totalCount || data.users?.length || 0);
                }
            } catch (error) {
                console.error('Error loading who I like:', error);
                this.showError('.who-i-like-grid', 'Failed to load who I like');
            }
        },

        async loadBlockedUsers() {
            try {
                const response = await fetch('/api/blocked-users', {
                    headers: {
                        'X-User-ID': this.currentUserId,
                        'Authorization': `Bearer ${getSessionToken()}`
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderBlockedUsers(data.blockedUsers || []);
                    this.updateBlockedUsersCount(data.blockedUsers?.length || 0);
                }
            } catch (error) {
                console.error('Error loading blocked users:', error);
                this.showError('.blocked-users-grid', 'Failed to load blocked users');
            }
        },
        
        // Render viewers
        renderViewers(viewers) {
            this.renderUserCardSection({
                containerSelector: '.viewers-list',
                users: viewers,
                columns: 3,
                emptyState: '<p class="empty-state-message">No viewers yet</p>',
                metaBuilder: (viewer) => [
                    this.buildMetaRow('far fa-clock', `Viewed ${this.formatTime(viewer.viewed_at)}`)
                ]
            });
        },
        
        // Render favorites
        renderFavorites(favorites) {
            this.renderUserCardSection({
                containerSelector: '.favorites-grid',
                users: favorites,
                columns: 4,
                emptyState: '<p class="empty-state-message grid-full-width">No favorites yet</p>',
                metaBuilder: (favorite) => [
                    this.buildMetaRow('far fa-clock', `Favorited ${this.formatTime(favorite.created_at || favorite.favorited_date)}`)
                ],
                overlayBuilder: (favorite, profile) => {
                    const userId = favorite.user_id || favorite.id || profile.id || '';
                    if (!userId) {
                        return '';
                    }
                    return `
                        <button class="remove-favorite-btn" type="button" data-user-id="${userId}" title="Remove from favorites">
                            <i class="fas fa-heart favorite-icon-default"></i>
                            <i class="fas fa-heart-broken favorite-icon-hover"></i>
                        </button>
                    `;
                }
            });
        },
        
        // Render messages
        renderMessages(messages) {
            const container = document.querySelector('.messages-list');
            
            if (!messages || messages.length === 0) {
                container.innerHTML = '<p class="empty-state-message">No new messages</p>';
                return;
            }
            
            // Get session token for navigation
            const sessionToken = getSessionToken();
            
            container.innerHTML = messages.map(message => {
                const isDeleted = message.is_sender_deleted || message.sender_name === 'Deleted User';
                const displayName = isDeleted ? 'Account Deactivated' : this.escapeHtml(message.sender_name);
                const defaultImg = (message.gender && message.gender.toString().toLowerCase() === 'f') ? '/assets/images/default_profile_female.svg' : '/assets/images/default_profile_male.svg';
                const profileImage = isDeleted ? '/assets/images/account_deactivated.svg' : (message.profile_image || defaultImg);
                const rawMessageText = typeof message.message_text === 'string' ? message.message_text.trim() : '';
                const previewText = rawMessageText ? this.escapeHtml(rawMessageText) : 'Sent a message';
                const messageText = isDeleted 
                    ? `<span class="message-deleted-text">"${this.truncateText(previewText, 80)}"</span>`
                    : `"${this.truncateText(previewText, 80)}"`;
                
                return `
                <div class="message-card ${isDeleted ? 'message-card-deleted' : ''}" ${isDeleted ? `onclick="window.location.href='/talk?token=${sessionToken}&user=${message.sender_id}'"` : ''}>
                    <img src="${profileImage}" alt="Profile" class="message-card-avatar">
                    <div class="message-card-content">
                        <div class="message-card-name ${isDeleted ? 'message-card-name-deleted' : ''}">${displayName}</div>
                        ${!isDeleted ? `<div class="message-card-info">${message.age} • ${this.escapeHtml(message.location)}</div>` : ''}
                        <div class="message-card-time"><i class="far fa-clock"></i>${this.formatTime(message.sent_at)}</div>
                        <div class="message-card-text">${messageText}${message.unread_count > 1 ? ', <span class="message-unread-count">' + message.unread_count + ' new messages</span>' : ''}</div>
                    </div>
                    ${!isDeleted ? `<a href="/talk?token=${sessionToken}&user=${message.sender_id}" class="reply-message-btn" data-user-id="${message.sender_id}" data-real_name="${this.escapeHtml(message.sender_name)}">Reply</a>` : '<span class="message-deactivated-badge">⚠️ Deactivated</span>'}
                </div>
            `;
            }).join('');
        },
        
        // Render likes

        renderWhoLikedMe(users) {
            this.renderUserCardSection({
                containerSelector: '.who-liked-me-grid',
                users,
                columns: 3,
                emptyState: '<p class="empty-state-message grid-full-width">No one has liked you yet</p>',
                metaBuilder: (user) => [
                    this.buildMetaRow('far fa-clock', `Liked ${this.formatTime(user.liked_at)}`)
                ]
            });
        },

        renderWhoILike(users) {
            this.renderUserCardSection({
                containerSelector: '.who-i-like-grid',
                users,
                columns: 3,
                emptyState: '<p class="empty-state-message grid-full-width">You haven\'t liked anyone yet</p>',
                metaBuilder: (user) => [
                    this.buildMetaRow('far fa-clock', `Liked ${this.formatTime(user.liked_at)}`)
                ],
                overlayBuilder: (user, profile) => {
                    const userId = user.user_id || user.id || profile.id || '';
                    if (!userId) {
                        return '';
                    }
                    return `
                        <button class="unlike-btn" type="button" data-user-id="${userId}" title="Unlike">
                            <i class="fas fa-thumbs-up thumb-icon-default"></i>
                            <i class="fas fa-thumbs-down thumb-icon-hover"></i>
                        </button>
                    `;
                }
            });
        },
        
        // Update count badges
        setTabBadge(selector, count) {
            const badge = document.querySelector(selector);
            if (!badge) {
                return;
            }

            const numericCount = Number(count);
            const safeCount = Number.isFinite(numericCount) ? Math.max(0, numericCount) : 0;
            if (safeCount <= 0) {
                badge.style.display = 'none';
                return;
            }

            badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
            badge.style.display = 'flex';
        },

        updateViewersCount(todayCount, totalCount) {
            const badge = document.querySelector('.viewers-count-badge');
            
            // Hide badge if count is 0, show if 1 or more
            if (todayCount > 0) {
                badge.textContent = `${todayCount} today`;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
            
            document.querySelector('.total-viewers-count').textContent = totalCount || 0;
            
            if (totalCount > 3) {
                document.querySelector('.viewers-view-all').style.display = 'block';
            }

            this.setTabBadge('.views-tab-badge', totalCount || todayCount || 0);
        },
        
        updateFavoritesCount(count) {
            this.setTabBadge('.favorites-tab-badge', count || 0);
            document.querySelector('.total-favorites-count').textContent = count || 0;
            
            const viewAllSection = document.querySelector('.favorites-view-all');
            const defaultViewSection = document.querySelector('.favorites-default-view');
            
            if (count > 0) {
                // Show "View All" if we're in default view (showing 6), hide "Default View" toggle
                const favoritesGrid = document.querySelector('.favorites-grid');
                const currentCount = favoritesGrid.querySelectorAll('.activity-card-wrapper').length;
                
                if (currentCount < count && currentCount <= 6) {
                    // We're showing default view (6 or less)
                    viewAllSection.style.display = 'inline-block';
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'none';
                    }
                } else {
                    // We're showing all favorites
                    viewAllSection.style.display = 'none';
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'inline-block';
                    }
                }
            } else {
                viewAllSection.style.display = 'none';
                if (defaultViewSection) {
                    defaultViewSection.style.display = 'none';
                }
            }
        },
        
        updateMessagesCount(count) {
            this.setTabBadge('.messages-tab-badge', count || 0);
            const badge = document.querySelector('.messages-count-badge');
            if (count > 0) {
                badge.textContent = `${count} new`;
                badge.style.display = 'inline-block';
            } else {
                badge.textContent = 'No new messages';
                badge.style.display = 'inline-block';
                badge.style.background = 'var(--muted-color)';
            }
        },
        

        updateWhoLikedMeCount(todayCount, totalCount) {
            this.setTabBadge('.likes-tab-badge', totalCount || todayCount || 0);
            const badge = document.querySelector('.who-liked-me-count-badge');
            
            // Hide badge if count is 0, show if 1 or more
            if (todayCount > 0) {
                badge.textContent = `${todayCount} today`;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
            
            document.querySelector('.total-who-liked-me-count').textContent = totalCount || 0;
            
            if (totalCount > 6) {
                document.querySelector('.who-liked-me-view-all').style.display = 'block';
            }
        },

        updateWhoILikeCount(count) {
            this.setTabBadge('.my-likes-tab-badge', count || 0);
            document.querySelector('.total-who-i-like-count').textContent = count || 0;
            
            const viewAllSection = document.querySelector('.who-i-like-view-all');
            const defaultViewSection = document.querySelector('.who-i-like-default-view');
            
            if (count > 0) {
                // Show "View All" if we're in default view (showing 6), hide "Default View" toggle
                const whoILikeGrid = document.querySelector('.who-i-like-grid');
                const currentCount = whoILikeGrid.querySelectorAll('.activity-card-wrapper').length;
                
                if (currentCount < count && currentCount <= 6) {
                    // We're showing default view (6 or less)
                    viewAllSection.style.display = 'inline-block';
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'none';
                    }
                } else {
                    // We're showing all
                    viewAllSection.style.display = 'none';
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'inline-block';
                    }
                }
            } else {
                viewAllSection.style.display = 'none';
                if (defaultViewSection) {
                    defaultViewSection.style.display = 'none';
                }
            }
        },

        updateBlockedUsersCount(count) {
            this.setTabBadge('.blocked-tab-badge', count || 0);
            const badge = document.querySelector('.blocked-users-count-badge');
            badge.textContent = `${count} blocked`;
        },

        renderBlockedUsers(blockedUsers) {
            this.renderUserCardSection({
                containerSelector: '.blocked-users-grid',
                users: blockedUsers,
                columns: 3,
                emptyState: '<p class="empty-state-message grid-full-width">No blocked users</p>',
                metaBuilder: (user) => [
                    this.buildMetaRow('far fa-clock', `Blocked ${this.formatTime(user.blocked_at)}`),
                    user.block_reason ? this.buildMetaNote(user.block_reason) : ''
                ],
                actionsBuilder: (user) => [
                    `<button class="activity-card-action-btn unblock-user-btn" type="button" data-user-id="${user.user_id || user.id || ''}" data-user-name="${this.escapeHtml(user.name)}">
                        <i class="fas fa-unlock"></i> Unblock
                    </button>`
                ]
            });
        },

        resolveProfileDisplayName(userId, fallbackName = 'this user') {
            const defaultName = fallbackName || 'this user';
            const numericId = Number(userId);
            if (Number.isNaN(numericId)) {
                return defaultName;
            }

            if (!this.profileNameMap) {
                this.profileNameMap = new Map();
            }

            const cached = this.profileNameMap.get(numericId);
            if (cached) {
                return cached;
            }

            const card = document.querySelector(`.activity-card-wrapper[data-user-id="${numericId}"]`);
            const quickActionName = card?.querySelector('.uc-quick-action[data-action="like"]')?.dataset?.username;
            const headingName = card?.querySelector('.uc-name-text')?.textContent;
            const resolved = (quickActionName && quickActionName.trim()) || (headingName && headingName.trim()) || defaultName;
            this.profileNameMap.set(numericId, resolved);
            return resolved;
        },

        renderUserCardSection({
            containerSelector,
            users = [],
            columns = 3,
            emptyState = '<p class="empty-state-message">No activity yet</p>',
            metaBuilder,
            actionsBuilder,
            overlayBuilder
        }) {
            const container = document.querySelector(containerSelector);
            if (!container) {
                return;
            }

            if (!Array.isArray(users) || users.length === 0) {
                container.innerHTML = emptyState;
                return;
            }

            const cards = users.map((user) => {
                if (!user) {
                    return '';
                }

                const profile = this.normalizeProfileForCard(user);
                if (!this.profileNameMap) {
                    this.profileNameMap = new Map();
                }
                if (profile?.id !== undefined && profile?.id !== null) {
                    const nameCandidate = profile.real_name || profile.name || profile.username || profile.display_name || profile.full_name || '';
                    const numericId = Number(profile.id);
                    const trimmedName = typeof nameCandidate === 'string' ? nameCandidate.trim() : '';
                    if (!Number.isNaN(numericId) && trimmedName) {
                        this.profileNameMap.set(numericId, trimmedName);
                    }
                }
                const metaResult = typeof metaBuilder === 'function'
                    ? metaBuilder(user, profile)
                    : [];
                const metaRows = Array.isArray(metaResult)
                    ? metaResult.filter(Boolean).join('')
                    : (metaResult || '');
                const actionResult = typeof actionsBuilder === 'function'
                    ? actionsBuilder(user, profile)
                    : [];
                const actions = Array.isArray(actionResult)
                    ? actionResult.filter(Boolean).join('')
                    : (actionResult || '');
                const overlayResult = typeof overlayBuilder === 'function'
                    ? overlayBuilder(user, profile)
                    : '';
                const overlay = Array.isArray(overlayResult)
                    ? overlayResult.filter(Boolean).join('')
                    : (overlayResult || '');

                return `
                    <div class="activity-card-wrapper" data-user-id="${profile.id ?? ''}">
                        ${overlay ? `<div class="activity-card-overlay">${overlay}</div>` : ''}
                        ${this.renderUserCard(profile, columns)}
                        ${metaRows ? `<div class="activity-card-meta">${metaRows}</div>` : ''}
                        ${actions ? `<div class="activity-card-actions">${actions}</div>` : ''}
                    </div>
                `;
            }).filter(Boolean).join('');

            if (!cards) {
                container.innerHTML = emptyState;
                return;
            }

            container.innerHTML = cards;

            if (typeof window.setupResultsUserCardEvents === 'function') {
                window.setupResultsUserCardEvents(container);
            }
        },

        renderUserCard(profile, columns) {
            if (typeof window.renderResultsUserCard === 'function') {
                return window.renderResultsUserCard(profile, columns);
            }
            return this.buildLegacyActivityCard(profile);
        },

        buildLegacyActivityCard(profile) {
            const name = this.escapeHtml(profile?.name || profile?.real_name || 'Unknown User');
            const locationParts = [profile?.city, profile?.country].filter(Boolean);
            const location = locationParts.length ? this.escapeHtml(locationParts.join(', ')) : 'Unknown';
            const ageText = profile?.age ? `${profile.age}` : '';

            return `
                <div class="activity-legacy-card">
                    <div class="legacy-card-header">
                        <span class="legacy-card-name">${name}</span>
                        ${ageText ? `<span class="legacy-card-age">${ageText}</span>` : ''}
                    </div>
                    <div class="legacy-card-location">${location}</div>
                </div>
            `;
        },

        normalizeProfileForCard(user = {}) {
            const location = user.location || '';
            const id = user.user_id ?? user.viewer_id ?? user.profile_id ?? user.id ?? null;
            const realName = user.real_name || user.name || user.username || 'Unknown User';
            const city = user.city || user.city_name || this.extractCityFromLocation(location);
            const country = user.country || user.country_name || this.extractCountryFromLocation(location);
            const preferredGender = user.preferred_gender || user.gender_preference || user.seeking_gender_preference || '';
            const seekingGender = user.seeking_gender || preferredGender || '';
            const preferredAgeMin = user.preferred_age_min ?? user.age_min ?? null;
            const preferredAgeMax = user.preferred_age_max ?? user.age_max ?? null;
            const seekingAgeMin = user.seeking_age_min ?? preferredAgeMin;
            const seekingAgeMax = user.seeking_age_max ?? preferredAgeMax;

            return {
                ...user,
                id,
                name: realName,
                real_name: realName,
                username: user.username || realName,
                city,
                country,
                profile_image: user.profile_image || user.profileImage || user.image || null,
                age: user.age || null,
                gender: user.gender || null,
                is_online: Boolean(user.is_online),
                photo_count: user.photo_count || user.photoCount || user.picture_count || 0,
                preferred_gender: preferredGender,
                preferred_age_min: preferredAgeMin,
                preferred_age_max: preferredAgeMax,
                seeking_gender: seekingGender,
                seeking_age_min: seekingAgeMin,
                seeking_age_max: seekingAgeMax
            };
        },

        extractCityFromLocation(location) {
            if (!location || typeof location !== 'string') {
                return '';
            }
            return location.split(',')[0].trim();
        },

        extractCountryFromLocation(location) {
            if (!location || typeof location !== 'string') {
                return '';
            }
            const parts = location.split(',');
            if (parts.length < 2) {
                return '';
            }
            return parts.slice(1).join(',').trim();
        },

        buildMetaRow(icon, text) {
            if (!text) {
                return '';
            }
            return `
                <div class="activity-card-meta-row">
                    <i class="${icon}"></i>
                    <span>${this.escapeHtml(text)}</span>
                </div>
            `;
        },

        buildMetaNote(text) {
            if (!text) {
                return '';
            }
            return `<div class="activity-card-meta-note">${this.escapeHtml(text)}</div>`;
        },
        
        // Setup event listeners
        setupEventListeners() {
            const messagesHeaderTitle = document.querySelector('.messages-section .section-header h3');
            if (messagesHeaderTitle) {
                messagesHeaderTitle.setAttribute('role', 'button');
                messagesHeaderTitle.setAttribute('tabindex', '0');
                messagesHeaderTitle.style.cursor = 'pointer';

                const messagesToggleIcon = messagesHeaderTitle.querySelector('.messages-toggle-icon');
                if (messagesToggleIcon) {
                    messagesToggleIcon.setAttribute('role', 'button');
                    messagesToggleIcon.setAttribute('tabindex', '0');
                    messagesToggleIcon.style.cursor = 'pointer';

                    const toggleMessagesFromPlusIcon = (event) => {
                        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                            return;
                        }

                        event.preventDefault();
                        event.stopPropagation();
                        this.toggleSection('messages');
                    };

                    messagesToggleIcon.addEventListener('click', toggleMessagesFromPlusIcon);
                    messagesToggleIcon.addEventListener('keydown', toggleMessagesFromPlusIcon);
                }

                const toggleMessagesFromHeader = (event) => {
                    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }

                    if (event.target.closest('.messages-toggle-icon')) {
                        return;
                    }

                    event.preventDefault();
                    event.stopPropagation();
                    this.toggleSection('messages');
                };

                messagesHeaderTitle.addEventListener('click', toggleMessagesFromHeader);
                messagesHeaderTitle.addEventListener('keydown', toggleMessagesFromHeader);
            }

            // Tab switching
            document.querySelectorAll('.activity-tab').forEach(tab => {
                tab.addEventListener('click', (e) => this.switchTab(e.currentTarget));
            });

            // Section toggles
            document.querySelectorAll('.section-toggle-btn').forEach((button) => {
                button.addEventListener('click', (e) => {
                    const sectionName = e.currentTarget.dataset.sectionToggle;
                    this.toggleSection(sectionName);
                });
            });

            document.querySelectorAll('.section-header[data-section-toggle-target]').forEach((header) => {
                const sectionName = header.dataset.sectionToggleTarget;
                if (!sectionName) {
                    return;
                }

                const handleHeaderInteraction = (event) => {
                    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') {
                        return;
                    }

                    if (event.target.closest('.section-toggle-btn') || event.target.closest('.activity-ghost-btn')) {
                        return;
                    }

                    event.preventDefault();
                    this.toggleSection(sectionName);
                };

                header.addEventListener('click', handleHeaderInteraction);
                header.addEventListener('keydown', handleHeaderInteraction);
            });
            
            // Modal event listeners are handled by the external modal JS
            // Delegate events for dynamic content
            document.addEventListener('click', (e) => {
                if (e.target.closest('.view-profile-btn')) {
                    const userId = e.target.closest('.view-profile-btn').dataset.userId;
                    this.viewProfile(userId);
                }
                
                if (e.target.closest('.reply-message-btn')) {
                    // Reply button now navigates to talk.html - let the link handle it
                    // No need to prevent default or call openChat
                    return;
                }
                
                if (e.target.closest('.remove-favorite-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const button = e.target.closest('.remove-favorite-btn');
                    const userId = button?.dataset.userId;
                    if (userId) {
                        this.removeFavorite(userId);
                    }
                    return;
                }

                if (e.target.closest('.unlike-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const button = e.target.closest('.unlike-btn');
                    const userId = button?.dataset.userId;
                    if (userId) {
                        this.unlikeUser(userId);
                    }
                    return;
                }

                if (e.target.closest('.unblock-user-btn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    const button = e.target.closest('.unblock-user-btn');
                    const userId = button?.dataset.userId;
                    const userName = button?.dataset.userName || 'this user';
                    if (userId) {
                        this.showUnblockConfirm(userId, userName);
                    }
                    return;
                }
                
                
                if (e.target.closest('.view-all-viewers-btn')) {
                    this.viewAllViewers();
                }
                
                if (e.target.closest('.view-all-who-liked-me-btn')) {
                    this.viewAllWhoLikedMe();
                }
                
                if (e.target.closest('.view-all-who-i-like-btn')) {
                    this.viewAllWhoILike();
                }
                
                if (e.target.closest('.default-view-who-i-like-btn')) {
                    this.loadWhoILike();
                }
                
                if (e.target.closest('.view-all-favorites-btn')) {
                    this.viewAllFavorites();
                }
                
                if (e.target.closest('.default-view-favorites-btn')) {
                    this.loadFavorites();
                }

                const cardWrapper = e.target.closest('.activity-card-wrapper');
                if (cardWrapper && !e.target.closest('.activity-card-actions') && !e.target.closest('.uc-card')) {
                    const userId = cardWrapper.dataset.userId;
                    if (userId) {
                        this.viewProfile(userId);
                    }
                }
                
                // Modal action buttons
                if (e.target.closest('.modal-like-btn')) {
                    e.preventDefault();
                    this.likeProfileInModal();
                }
                
                if (e.target.closest('.modal-favourite-btn')) {
                    e.preventDefault();
                    this.favouriteProfileInModal();
                }
                
                if (e.target.closest('.modal-message-btn')) {
                    e.preventDefault();
                    this.messageProfileInModal();
                }
                
                if (e.target.closest('.modal-block-btn')) {
                    e.preventDefault();
                    this.blockProfileInModal();
                }
                
                if (e.target.closest('.modal-report-btn')) {
                    e.preventDefault();
                    this.reportProfileInModal();
                }
            });
        },

        applyActiveTabState() {
            const activeTab = document.querySelector('.activity-tab.active') || document.querySelector('.activity-tab');
            if (activeTab) {
                this.switchTab(activeTab);
            }
        },
        
        // Switch tabs
        switchTab(tabElement) {
            const tab = tabElement.dataset.tab;
            const isAllTabDesktopView = this.isDesktopView && tab === 'all';
            const sectionsToShow = isAllTabDesktopView
                ? this.desktopSectionOrder
                : (this.tabVisibilityMap[tab] || this.tabVisibilityMap.all);
            const uniqueSections = Array.from(new Set(sectionsToShow));
            this.currentFilter = tab;

            document.querySelectorAll('.activity-tab').forEach((button) => {
                button.classList.remove('active');
                button.setAttribute('aria-selected', 'false');
            });

            tabElement.classList.add('active');
            tabElement.setAttribute('aria-selected', 'true');

            document.querySelectorAll('.activity-section').forEach((section) => {
                const sectionName = section.dataset.section;
                const shouldShow = uniqueSections.includes(sectionName);
                section.classList.toggle('is-hidden', !shouldShow);
            });

            uniqueSections.forEach((section) => this.triggerLazyLoad(section));
        },
        
        // Actions
        viewProfile(userId) {
            // Use external modal JS function
            if (window.openProfileModal) {
                window.openProfileModal(userId);
            } else {
                console.error('openProfileModal not available. Make sure user-profile-modal.js is loaded.');
            }
        },
        
        likeProfileInModal() {
            if (window.ProfileModalActions) {
                window.ProfileModalActions.likeProfileInModal();
            } else {
                console.error('ProfileModalActions not loaded');
            }
        },
        
        favouriteProfileInModal() {
            if (window.ProfileModalActions) {
                window.ProfileModalActions.favouriteProfileInModal();
            } else {
                console.error('ProfileModalActions not loaded');
            }
        },
        
        messageProfileInModal() {
            const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
            if (!currentProfileUserId) return;
            
            // Get real_name from modal
            const real_nameElement = document.getElementById('modal-profile-real_name');
            const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'User';
            
            if (!real_name || real_name === 'Unknown User') {
                this.showToast('Profile data not loaded correctly. Please refresh the page.', 'error');
                return;
            }
            
            // Close modal first
            if (window.closeProfileModal) {
                window.closeProfileModal();
            }
            
            // Open universal message modal with the profile real_name
            if (typeof openUniversalMessageModal === 'function') {
                openUniversalMessageModal(real_name, false, null,
                    // Success callback
                    (data) => {
                        this.showToast('Message sent successfully', 'success');
                    },
                    // Error callback
                    (error) => {
                        // Handle error silently or show toast if needed
                    }
                );
            } else {
                // Fallback to openChat if universal modal not available
                this.openChat(currentProfileUserId, real_name);
            }
        },
        
        async blockProfileInModal() {
            const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
            if (!currentProfileUserId) return;
            
            if (!this.currentUserId) {
                this.showToast('Please log in to block users', 'error');
                return;
            }
            
            // Check email verification before blocking
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                window.showVerificationMessage();
                return; // Don't proceed with block action
            }
            
            const real_nameElement = document.getElementById('modal-profile-real_name');
            const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : 'this user';
            
            // Show custom confirmation dialog
            document.getElementById('blockUsername').textContent = real_name;
            document.getElementById('blockConfirmModal').style.display = 'flex';
            
            // Store context for confirmBlock function
            window.pendingBlockUserId = currentProfileUserId;
            window.pendingBlockContext = 'activity';
        },
        
        executeBlock() {
            const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
            if (!currentProfileUserId) {
                this.showToast('No profile selected', 'error');
                return;
            }
            
            // Send block request
            fetch(`/api/users/${currentProfileUserId}/block`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-User-ID': this.currentUserId,
                    'Authorization': `Bearer ${getSessionToken()}`
                },
                body: JSON.stringify({
                    reason: 'Blocked from activity page'
                })
            }).then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                if (data.success) {
                    this.showToast('User blocked successfully', 'success');
                    if (window.closeProfileModal) {
                        window.closeProfileModal();
                    }
                    // Refresh the page to remove blocked user from lists
                    setTimeout(() => location.reload(), 1000);
                } else {
                    throw new Error(data.error || 'Failed to block user');
                }
            }).catch(error => {
                console.error('Error blocking user:', error);
                const errorMessage = error.message && error.message.includes('HTTP error') 
                    ? 'Network error. Please check your connection and try again.' 
                    : 'Failed to block user. Please try again.';
                this.showToast(errorMessage, 'error');
            });
        },
        
        async reportProfileInModal() {
            const currentProfileUserId = window.getCurrentProfileUserId ? window.getCurrentProfileUserId() : null;
            if (!currentProfileUserId) return;
            
            if (!this.currentUserId) {
                this.showToast('Please log in to report users', 'error');
                return;
            }
            
            // Check email verification before reporting
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                window.showVerificationMessage();
                return; // Don't proceed with report action
            }
            
            // Get real_name from modal
            const real_nameElement = document.getElementById('modal-profile-real_name');
            const real_name = real_nameElement ? real_nameElement.textContent.trim().split(' ')[0] : `User ${currentProfileUserId}`;
            
            // Open report modal
            if (typeof openReportModal === 'function') {
                openReportModal(currentProfileUserId, real_name);
            } else {
                console.error('openReportModal function not found. Make sure user-report-modal is included.');
                this.showToast('Report functionality is not available. Please refresh the page.', 'error');
            }
        },
        
        openChat(userId, real_name) {
            console.log('🔍 openChat called with:', { userId, real_name });
            
            // Navigate to talk page with session token and user ID
            const sessionToken = getSessionToken();
            if (sessionToken) {
                window.location.href = `/talk?token=${sessionToken}&user=${userId}`;
            } else {
                console.error('❌ Session token not available');
                this.showToast('Session expired. Please log in again.', 'error');
            }
        },

        navigateToTalk() {
            const firstMessage = Array.isArray(this.latestMessages) && this.latestMessages.length > 0
                ? this.latestMessages[0]
                : null;
            const senderId = firstMessage
                ? (firstMessage.sender_id || firstMessage.senderId || firstMessage.user_id || null)
                : null;
            const sessionToken = getSessionToken();

            if (sessionToken) {
                if (senderId) {
                    window.location.href = `/talk?token=${encodeURIComponent(sessionToken)}&user=${encodeURIComponent(senderId)}`;
                    return;
                }

                window.location.href = `/talk?token=${encodeURIComponent(sessionToken)}`;
                return;
            }

            if (senderId) {
                window.location.href = `/talk?user=${encodeURIComponent(senderId)}`;
                return;
            }

            window.location.href = '/talk';
        },
        
        async removeFavorite(userId) {
            try {
                const response = await fetch(`/api/favorites/${userId}`, {
                    method: 'DELETE',
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                
                const data = await response.json();
                if (data.success) {
                    this.showToast(data.message || 'Removed from favorites', 'success');
                    // Check if we're in "View All" mode (default view button is visible)
                    const defaultViewSection = document.querySelector('.favorites-default-view');
                    const isViewAllMode = defaultViewSection && defaultViewSection.style.display === 'inline-block';
                    
                    if (isViewAllMode) {
                        // Reload all favorites to preserve "View All" view
                        await this.viewAllFavorites();
                    } else {
                        // Reload default view (6 items)
                    await this.loadFavorites();
                    }
                } else {
                    this.showToast(data.error || 'Failed to remove favorite', 'error');
                }
            } catch (error) {
                console.error('Error removing favorite:', error);
                this.showToast('Failed to remove favorite', 'error');
            }
        },

        async unlikeUser(userId) {
            try {
                const response = await fetch(`/api/likes/${userId}`, {
                    method: 'DELETE',
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                
                const data = await response.json();
                if (data.success) {
                    this.showToast(data.message || 'User unliked', 'success');
                    // Check if we're in "View All" mode (default view button is visible)
                    const defaultViewSection = document.querySelector('.who-i-like-default-view');
                    const isViewAllMode = defaultViewSection && defaultViewSection.style.display === 'inline-block';
                    
                    if (isViewAllMode) {
                        // Reload all who I like to preserve "View All" view
                        await this.viewAllWhoILike();
                    } else {
                        // Reload default view (6 items)
                    await this.loadWhoILike();
                    }
                } else {
                    this.showToast(data.error || 'Failed to unlike user', 'error');
                }
            } catch (error) {
                console.error('Error unliking user:', error);
                this.showToast('Failed to unlike user', 'error');
            }
        },
        
        async showUnblockConfirm(userId, real_name) {
            // Check email verification before unblocking
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                window.showVerificationMessage();
                return; // Don't proceed with unblock action
            }
            
            this.pendingUnblockUserId = userId;
            document.getElementById('unblockUsername').textContent = real_name;
            document.getElementById('unblockConfirmModal').style.display = 'flex';
        },
        
        async unblockUser(userId) {
            try {
                const response = await fetch(`/api/users/${userId}/block`, {
                    method: 'DELETE',
                    headers: {
                        'X-User-ID': this.currentUserId,
                        'Authorization': `Bearer ${getSessionToken()}`
                    }
                });
                
                const data = await response.json();
                if (data.success) {
                    const restoreInfo = data.restored || {};
                    let message = 'User unblocked successfully';
                    if (restoreInfo.favorites || restoreInfo.likes) {
                        message += '. Previous favorites/likes have been restored.';
                    }
                    this.showToast(message, 'success');
                    
                    // Refresh all relevant sections after unblock
                    await Promise.all([
                        this.loadBlockedUsers(),
                        this.loadViewers(), // Refresh "Who Viewed Me" to show unblocked user
                        this.loadWhoLikedMe(), // Refresh "Who Liked Me" in case they liked before blocking
                        this.loadFavorites() // Refresh favorites if they were restored
                    ]);
                    
                    // Trigger conversation list refresh in talk.html if it's open
                    // This ensures the unblocked user reappears in the chat partners list
                    if (window.loadConversations && typeof window.loadConversations === 'function') {
                        // talk.html is open, refresh conversations
                        window.loadConversations();
                    } else {
                        // Use custom event to notify talk.html if it's in another tab/window
                        window.dispatchEvent(new CustomEvent('userUnblocked', { 
                            detail: { unblockedUserId: userId } 
                        }));
                    }
                } else {
                    // Handle rate limiting or other errors
                    if (data.code === 'RATE_LIMIT_EXCEEDED') {
                        this.showToast(data.error || 'Too many unblock actions. Please wait before trying again.', 'warning');
                    } else {
                        this.showToast(data.error || 'Failed to unblock user', 'error');
                    }
                }
            } catch (error) {
                console.error('Error unblocking user:', error);
                this.showToast('Failed to unblock user', 'error');
            }
        },
        
        async likeUser(userId, displayName = '') {
            const resolvedName = (typeof displayName === 'string' && displayName.trim()) || this.resolveProfileDisplayName(userId);

            if (!this.currentUserId) {
                this.showToast('Please log in to like users', 'error');
                return;
            }

            try {
                const response = await fetch('/api/likes', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'X-User-ID': this.currentUserId
                    },
                    body: JSON.stringify({ userId })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    this.showToast(`You liked ${resolvedName}`, 'like');
                    return;
                }

                if (data.alreadyExists || data.message?.toLowerCase()?.includes('already')) {
                    this.showToast(`You already liked ${resolvedName}`, 'like');
                    return;
                }

                const fallbackMessage = data.message || data.error || `Failed to like ${resolvedName}`;
                this.showToast(fallbackMessage, 'error');
            } catch (error) {
                console.error('Error liking user:', error);
                this.showToast(error?.message || `Failed to like ${resolvedName}`, 'error');
            }
        },

        async favoriteUser(userId, displayName = '') {
            const resolvedName = (typeof displayName === 'string' && displayName.trim()) || this.resolveProfileDisplayName(userId);

            if (!this.currentUserId) {
                this.showToast('Please log in to add favourites', 'error');
                return;
            }

            try {
                const response = await fetch('/api/favorites', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-User-ID': this.currentUserId
                    },
                    body: JSON.stringify({ userId })
                });

                const data = await response.json();

                if (data.success) {
                    this.showToast(`${resolvedName} added to favourites`, 'favorite');
                    return;
                }

                if (data.alreadyExists || data.message?.toLowerCase()?.includes('already')) {
                    this.showToast(`${resolvedName} is already in your favourites`, 'favorite');
                    return;
                }

                const fallbackMessage = data.message || data.error || `Failed to add ${resolvedName} to favourites`;
                this.showToast(fallbackMessage, 'error');
            } catch (error) {
                console.error('Error adding favorite:', error);
                this.showToast(error?.message || `Failed to add ${resolvedName} to favourites`, 'error');
            }
        },
        
        toggleSection(sectionName, forceExpand) {
            if (!sectionName) {
                return;
            }

            const section = document.querySelector(`[data-section="${sectionName}"]`);
            if (!section) {
                return;
            }

            const shouldExpand = typeof forceExpand === 'boolean'
                ? forceExpand
                : section.classList.contains('is-collapsed');

            this.setSectionExpansion(section, shouldExpand);
            if (shouldExpand) {
                this.triggerLazyLoad(sectionName);
            }
        },

        async viewAllViewers() {
            // Load and display all viewers on the current page
            try {
                const response = await fetch('/api/activity/viewers?limit=100', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderViewers(data.viewers);
                    // Hide the "View All" button since we're now showing all
                    const viewAllSection = document.querySelector('.viewers-view-all');
                    if (viewAllSection) {
                        viewAllSection.style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('❌ Error loading all viewers:', error);
            }
        },
        
        async viewAllWhoLikedMe() {
            // Load and display all who liked me on the current page
            try {
                const response = await fetch('/api/activity/who-liked-me?limit=100', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderWhoLikedMe(data.users);
                    // Hide the "View All" button since we're now showing all
                    const viewAllSection = document.querySelector('.who-liked-me-view-all');
                    if (viewAllSection) {
                        viewAllSection.style.display = 'none';
                    }
                }
            } catch (error) {
                console.error('❌ Error loading all who liked me:', error);
            }
        },
        
        async viewAllWhoILike() {
            // Load and display all who I like on the current page
            try {
                const response = await fetch('/api/activity/who-i-like?limit=100', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderWhoILike(data.users);
                    // Hide "View All" button and show "Default View" toggle
                    const viewAllSection = document.querySelector('.who-i-like-view-all');
                    const defaultViewSection = document.querySelector('.who-i-like-default-view');
                    if (viewAllSection) {
                        viewAllSection.style.display = 'none';
                    }
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'inline-block';
                    }
                }
            } catch (error) {
                console.error('❌ Error loading all who I like:', error);
            }
        },
        
        async viewAllFavorites() {
            // Load and display all favorites on the current page
            try {
                const response = await fetch('/api/activity/favorites?limit=100', {
                    headers: {
                        'X-User-ID': this.currentUserId
                    }
                });
                const data = await response.json();
                
                if (data.success) {
                    this.renderFavorites(data.favorites);
                    // Hide "View All" button and show "Default View" toggle
                    const viewAllSection = document.querySelector('.favorites-view-all');
                    const defaultViewSection = document.querySelector('.favorites-default-view');
                    if (viewAllSection) {
                        viewAllSection.style.display = 'none';
                    }
                    if (defaultViewSection) {
                        defaultViewSection.style.display = 'inline-block';
                    }
                }
            } catch (error) {
                console.error('❌ Error loading all favorites:', error);
            }
        },
        
        // Utility functions
        escapeHtml(text) {
            if (text === null || text === undefined || text === '') {
                return 'Unknown User';
            }
            // Convert to string if not already
            const textStr = String(text);
            const div = document.createElement('div');
            div.textContent = textStr;
            return div.innerHTML;
        },
        
        truncateText(text, maxLength) {
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        },
        
        formatTime(timestamp) {
            if (!timestamp) return 'Unknown';
            
            const date = new Date(timestamp);
            const now = new Date();
            const diff = Math.floor((now - date) / 1000); // seconds
            
            if (diff < 60) return 'Just now';
            if (diff < 3600) {
                const minutes = Math.floor(diff / 60);
                return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
            }
            if (diff < 86400) {
                const hours = Math.floor(diff / 3600);
                return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
            }
            if (diff < 604800) {
                const days = Math.floor(diff / 86400);
                return `${days} day${days !== 1 ? 's' : ''} ago`;
            }
            if (diff < 2592000) {
                const weeks = Math.floor(diff / 604800);
                return `${weeks} week${weeks !== 1 ? 's' : ''} ago`;
            }
            
            // For older dates, show formatted date and time
            return date.toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
                hour: 'numeric',
                minute: '2-digit'
            });
        },
        
        showError(selector, message) {
            const container = document.querySelector(selector);
            if (container) {
                container.innerHTML = `<p class="error-message-text">${message}</p>`;
            }
        },
        
        showToast(message, type = 'info', actionText = null, actionCallback = null) {
            showNotification(message, type);
        }
    };
    
    // Expose global functions for inline handlers
    // Note: closeProfileModal and openProfileModal are now provided by external modal JS
    window.viewProfile = (userId) => ActivityManager.viewProfile(userId);
    window.ActivityManager = ActivityManager;
    window.closeUnblockConfirm = closeUnblockConfirm;
    window.confirmUnblock = confirmUnblock;
    
    // Expose quick action functions for user-card component compatibility (results.html pattern)
    window.likeProfile = async (profileId, username) => {
        
        // Check email verification before allowing like action
        if (window.checkEmailVerificationStatus) {
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                if (window.showVerificationMessage) {
                    window.showVerificationMessage();
                }
                return; // Don't proceed with like action
            }
        }
        
        await ActivityManager.likeUser(profileId, username);
    };
    
    window.messageProfile = (username, profileId) => {
        if (typeof openUniversalMessageModal === 'function') {
            openUniversalMessageModal(username, false, null);
        } else {
            console.warn('Universal message modal not available');
        }
    };
    
    window.addToFavourite = async (profileId, username = '') => {
        
        // Check email verification before allowing favorite action
        if (window.checkEmailVerificationStatus) {
            const isVerified = await window.checkEmailVerificationStatus();
            if (!isVerified) {
                if (window.showVerificationMessage) {
                    window.showVerificationMessage();
                }
                return; // Don't proceed with favorite action
            }
        }
        
        await ActivityManager.favoriteUser(profileId, username);
    };
    
    // Override getCurrentUserId for modal if needed
    if (window.UserProfileModal) {
        window.UserProfileModal.setGetCurrentUserId(() => ActivityManager.currentUserId);
        window.UserProfileModal.setGetSessionToken(getSessionToken);
    }
    
    // Load ProfileModalActions module after ActivityManager is initialized
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadProfileModalActions);
    } else {
        loadProfileModalActions();
    }
    
    // Global functions for block confirmation dialog
    window.closeBlockConfirm = function() {
        document.getElementById('blockConfirmModal').style.display = 'none';
        window.pendingBlockUserId = null;
        window.pendingBlockContext = null;
    };
    
    window.confirmBlock = function() {
        if (window.pendingBlockUserId && window.pendingBlockContext === 'activity') {
            ActivityManager.executeBlock();
        }
        closeBlockConfirm();
    };
    
    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ActivityManager.init());
    } else {
        ActivityManager.init();
    }
})();



