/**
 * UserCard Component (Modernized)
 * 
 * Refactored to extend BaseComponent
 * Maintains backward compatibility with original UserCard
 * Migration Phase 2: Week 6-7
 */

import { BaseComponent } from './BaseComponent.js';
import { escapeHtml } from '../core/utils.js';

const DEFAULT_IMAGES = {
    male: '/assets/images/default_profile_male.svg',
    female: '/assets/images/default_profile_female.svg',
    default: '/assets/images/default_profile_male.svg'
};

const INTEREST_ICONS = {
    travel: 'fa-plane',
    music: 'fa-music',
    yoga: 'fa-child',
    photography: 'fa-camera',
    art: 'fa-palette',
    reading: 'fa-book',
    dancing: 'fa-music',
    sports: 'fa-futbol',
    gaming: 'fa-gamepad',
    movies: 'fa-film',
    nature: 'fa-leaf',
    fitness: 'fa-dumbbell',
    cooking: 'fa-utensils',
    hiking: 'fa-hiking',
    technology: 'fa-laptop',
    cycling: 'fa-bicycle',
    skiing: 'fa-skiing',
    coffee: 'fa-coffee',
    books: 'fa-book',
    food: 'fa-hamburger'
};

const COUNTRY_ABBREVIATIONS = {
    'United States': 'USA',
    'United Kingdom': 'UK',
    'Canada': 'CAN',
    'Australia': 'AUS'
};

/**
 * UserCard Component
 * Extends BaseComponent for lifecycle management and event handling
 */
export class UserCard extends BaseComponent {
    /**
     * @param {Object} config - Component configuration
     */
    constructor(config = {}) {
        super({
            autoInit: false, // We'll call init manually after setup
            ...config
        });
        
        // Merge config with defaults
        this.config = {
            lazyLoad: true,
            faceDetection: false,
            quickActions: true,
            skeletonLoading: true,
            ...this.config,
            ...config
        };
        
        // Component state
        this.faceDetector = null;
        this.imageObserver = null;
        this.processedImages = new WeakSet();
        this.queue = new Set();
        this.isProcessing = false;
        
        // Touch handling
        this.touchStartX = 0;
        this.touchStartY = 0;
        this.touchStartTime = 0;
        this.touchTarget = null;
        
        // Initialize
        this.init();
    }
    
    /**
     * Initialize component
     * Override BaseComponent.init
     */
    async init() {
        await super.init();
        
        if (this.config.faceDetection) {
            await this.initFaceDetection();
        }
        
        if (this.config.lazyLoad) {
            this.initLazyLoading();
        }
        
        this.setupEventDelegation();
    }
    
    /**
     * Lifecycle hook: Called after initialization
     */
    async onInit() {
        // Component-specific initialization
        this.log('UserCard initialized');
    }
    
    /**
     * Lifecycle hook: Cleanup on destroy
     */
    onDestroy() {
        if (this.imageObserver) {
            this.imageObserver.disconnect();
        }
        
        if (this.faceDetector && typeof this.faceDetector.dispose === 'function') {
            this.faceDetector.dispose();
        }
        
        this.queue.clear();
        this.processedImages = new WeakSet();
        
        this.log('UserCard destroyed');
    }
    
    // ===== RENDER FUNCTIONS =====
    
    /**
     * Render user card HTML
     * @param {Object} profile - User profile data
     * @param {number} columns - Number of columns in grid
     * @returns {string} HTML string
     */
    render(profile, columns = 3) {
        const safeProfile = this.sanitizeProfile(profile);
        
        return `
            <div class="uc-card" 
                 data-columns="${columns}"
                 data-profile-id="${safeProfile.id}"
                 tabindex="0"
                 role="article"
                 aria-label="Profile of ${safeProfile.name}">
              
              ${this.renderImageContainer(safeProfile, columns)}
              ${this.renderInfoSection(safeProfile)}
              
            </div>
        `;
    }
    
    /**
     * Render image container
     */
    renderImageContainer(profile, columns) {
        const imageUrl = this.getImageUrl(profile);
        const defaultImage = this.getDefaultImage(profile.gender);
        const badges = this.renderBadges(profile);
        const finalImageUrl = imageUrl || defaultImage || DEFAULT_IMAGES.male;
        
        return `
            <div class="uc-image-container" 
                 data-columns="${columns}"
                 data-profile-id="${profile.id}">
              
              <img class="uc-avatar uc-loading" 
                   src="${finalImageUrl}"
                   data-default="${defaultImage || DEFAULT_IMAGES.male}"
                   alt="${profile.name}"
                   loading="lazy"
                   width="300"
                   height="375">
              
              <div class="uc-avatar-fallback">
                <i class="fas fa-user"></i>
              </div>
              
              ${badges}
              ${this.config.quickActions ? this.renderQuickActions(profile.id, profile.username || profile.real_name || profile.name || '') : ''}
              
            </div>
        `;
    }
    
    /**
     * Render badges
     */
    renderBadges(profile) {
        const badges = [];
        
        if (profile.is_online) {
            badges.push('<div class="uc-badge uc-badge-online" title="Online Now"></div>');
        }
        
        if (profile.is_new_match) {
            badges.push('<div class="uc-badge uc-badge-new" title="New Match"><i class="fas fa-bolt"></i> NEW</div>');
        }
        
        if (profile.match_score >= 80) {
            badges.push(`<div class="uc-badge uc-badge-compatibility" title="${profile.match_score}% Match">
                <i class="fas fa-heart"></i> ${profile.match_score}%
            </div>`);
        }
        
        if (profile.is_verified) {
            badges.push('<div class="uc-badge uc-badge-verified" title="Verified Profile"><i class="fas fa-check"></i></div>');
        }
        
        if (profile.photo_count > 1) {
            badges.push(`<div class="uc-badge uc-badge-photos" title="${profile.photo_count} photos">
                <i class="fas fa-camera"></i> ${profile.photo_count}
            </div>`);
        }
        
        return badges.join('\n');
    }
    
    /**
     * Render quick actions overlay
     */
    renderQuickActions(profileId, username) {
        return `
            <div class="uc-quick-actions">
                <button class="uc-quick-action uc-quick-action-like" 
                        data-action="like"
                        data-profile-id="${profileId}"
                        aria-label="Like ${username}"
                        title="Like">
                    <i class="fas fa-heart"></i>
                </button>
                <button class="uc-quick-action uc-quick-action-message" 
                        data-action="message"
                        data-profile-id="${profileId}"
                        aria-label="Message ${username}"
                        title="Message">
                    <i class="fas fa-comment"></i>
                </button>
                <button class="uc-quick-action uc-quick-action-favorite" 
                        data-action="favorite"
                        data-profile-id="${profileId}"
                        aria-label="Favorite ${username}"
                        title="Favorite">
                    <i class="fas fa-star"></i>
                </button>
            </div>
        `;
    }
    
    /**
     * Render info section
     */
    renderInfoSection(profile) {
        return `
            <div class="uc-info">
                ${this.renderName(profile)}
                ${this.renderLocation(profile)}
                ${profile.seeking_gender ? this.renderSeeking(profile) : ''}
                ${profile.interests?.length ? this.renderInterests(profile.interests) : ''}
                ${profile.about ? this.renderAbout(profile.about) : ''}
            </div>
        `;
    }
    
    /**
     * Render name with age
     */
    renderName(profile) {
        const genderIcon = this.renderGenderIcon(profile.gender);
        const ageBadge = profile.age ? `<span class="uc-age">${profile.age}</span>` : '';
        
        return `
            <h3 class="uc-name">
                ${profile.name}
                ${genderIcon}
                ${ageBadge}
            </h3>
        `;
    }
    
    /**
     * Render gender icon
     */
    renderGenderIcon(gender) {
        if (!gender) return '';
        const genderLower = gender.toLowerCase();
        const icon = genderLower.includes('female') ? 'fa-venus' : 'fa-mars';
        const className = genderLower.includes('female') ? 'uc-gender-female' : 'uc-gender-male';
        
        return `<i class="fas ${icon} uc-gender-icon ${className}"></i>`;
    }
    
    /**
     * Render location
     */
    renderLocation(profile) {
        const locationParts = [];
        if (profile.city) locationParts.push(profile.city);
        if (profile.country) {
            const country = COUNTRY_ABBREVIATIONS[profile.country] || profile.country;
            locationParts.push(country);
        }
        
        const location = locationParts.length ? locationParts.join(', ') : 'Location not specified';
        
        return `
            <div class="uc-location">
                <i class="fas fa-map-marker-alt"></i>
                <span>${location}</span>
            </div>
        `;
    }
    
    /**
     * Render seeking info
     */
    renderSeeking(profile) {
        const genderMap = {
            'male': 'Male',
            'female': 'Female',
            'm': 'Male',
            'f': 'Female'
        };
        
        const seekingGenderRaw = profile.seeking_gender || profile.preferred_gender || '';
        const seekingGender = genderMap[seekingGenderRaw?.toLowerCase()] || seekingGenderRaw || 'Anyone';
        const ageMin = profile.seeking_age_min || profile.age_min || 18;
        const ageMax = profile.seeking_age_max || profile.age_max || 99;
        
        return `
            <div class="uc-seeking">
                Seeking: ${seekingGender}, ${ageMin}-${ageMax}
            </div>
        `;
    }
    
    /**
     * Render interests
     */
    renderInterests(interests) {
        const topInterests = interests.slice(0, 3);
        
        return `
            <div class="uc-interests">
                ${topInterests.map(interest => {
                    const icon = INTEREST_ICONS[interest.name?.toLowerCase()] || 'fa-star';
                    return `
                        <span class="uc-interest">
                            <i class="fas ${icon}"></i>
                            ${interest.name}
                        </span>
                    `;
                }).join('\n')}
            </div>
        `;
    }
    
    /**
     * Render about text
     */
    renderAbout(about) {
        return `<p class="uc-about">${about}</p>`;
    }
    
    // ===== UTILITY FUNCTIONS =====
    
    /**
     * Sanitize profile data
     */
    sanitizeProfile(profile) {
        return {
            id: profile.id || 0,
            name: escapeHtml(profile.real_name || profile.name || `User${profile.id || 0}`),
            username: escapeHtml(profile.username || profile.real_name || profile.name || ''),
            age: profile.age || 0,
            gender: profile.gender || null,
            city: profile.city_name || profile.city || '',
            country: profile.country_name || profile.country || '',
            about: escapeHtml(profile.about || ''),
            interests: Array.isArray(profile.interests) ? profile.interests : [],
            is_online: !!profile.is_online,
            is_new_match: !!profile.is_new_match,
            is_verified: !!profile.is_verified,
            match_score: profile.match_score || profile.compatibility_score || 0,
            photo_count: profile.photo_count || 0,
            seeking_gender: profile.preferred_gender || '',
            seeking_age_min: profile.age_min || 0,
            seeking_age_max: profile.age_max || 0,
            can_block: !!profile.has_received_messages,
            can_report: !!profile.has_received_messages,
            profile_image: profile.profile_image || profile.profileImage || profile.image || null,
            ...profile
        };
    }
    
    /**
     * Get image URL
     */
    getImageUrl(profile) {
        const profileImage = profile.profile_image || profile.profileImage || profile.image || null;
        
        if (!profileImage || profileImage === 'null' || profileImage === 'undefined' || profileImage === '') {
            return this.getDefaultImage(profile.gender);
        }
        
        if (profileImage.startsWith('http://') || profileImage.startsWith('https://')) {
            return profileImage;
        }
        
        if (profileImage.startsWith('/')) {
            return profileImage;
        }
        
        if (profileImage.includes('/uploads/profile_images/')) {
            return profileImage.startsWith('/') ? profileImage : `/${profileImage}`;
        }
        
        return `/uploads/profile_images/${profileImage}`;
    }
    
    /**
     * Get default image by gender
     */
    getDefaultImage(gender) {
        if (!gender) return DEFAULT_IMAGES.default;
        
        const genderLower = gender.toString().toLowerCase();
        if (genderLower.includes('female')) {
            return DEFAULT_IMAGES.female;
        }
        if (genderLower.includes('male')) {
            return DEFAULT_IMAGES.male;
        }
        
        return DEFAULT_IMAGES.default;
    }
    
    // ===== IMAGE LOADING =====
    
    /**
     * Initialize lazy loading
     */
    initLazyLoading() {
        this.imageObserver = this.createIntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    this.loadImage(img);
                    this.imageObserver.unobserve(img);
                }
            });
        }, {
            rootMargin: '50px',
            threshold: 0.01
        });
    }
    
    /**
     * Load image
     */
    loadImage(img) {
        if (!img.dataset.src) return;
        
        const src = img.dataset.src;
        img.classList.remove('uc-loaded');
        img.classList.add('uc-loading');
        
        const testImg = new Image();
        
        testImg.onload = () => {
            img.src = src;
            img.classList.remove('uc-loading');
            img.classList.add('uc-loaded');
            delete img.dataset.src;
            
            if (this.config.faceDetection && this.faceDetector) {
                this.queueFaceDetection(img);
            }
        };
        
        testImg.onerror = () => {
            img.src = img.dataset.default;
            img.classList.remove('uc-loading');
            img.classList.add('uc-loaded', 'error');
            delete img.dataset.src;
        };
        
        testImg.src = src;
    }
    
    // ===== FACE DETECTION =====
    
    /**
     * Initialize face detection
     */
    async initFaceDetection() {
        if (typeof FaceDetection === 'undefined') {
            this.warn('Face Detection not available');
            return;
        }
        
        try {
            this.faceDetector = await FaceDetection.createDetector(
                FaceDetection.SupportedModels.MediaPipeFaceDetector,
                {
                    runtime: 'mediapipe',
                    modelType: 'short',
                    maxFaces: 1,
                    detectorMode: 'accurate'
                }
            );
            
            this.log('Face detection initialized');
        } catch (error) {
            this.warn('Failed to initialize face detection:', error);
            this.config.faceDetection = false;
        }
    }
    
    /**
     * Queue face detection
     */
    async queueFaceDetection(img) {
        if (this.processedImages.has(img) || !this.faceDetector) {
            return;
        }
        
        this.queue.add(img);
        this.processQueue();
    }
    
    /**
     * Process face detection queue
     */
    async processQueue() {
        if (this.isProcessing || this.queue.size === 0) {
            return;
        }
        
        this.isProcessing = true;
        const img = Array.from(this.queue)[0];
        this.queue.delete(img);
        
        try {
            const faces = await this.faceDetector.estimateFaces(img);
            
            if (faces.length > 0) {
                const face = faces[0];
                const { x, y, width, height } = face.box;
                
                const centerX = (x + width / 2) / img.naturalWidth * 100;
                const centerY = (y + height / 2) / img.naturalHeight * 100;
                
                const adjustedX = Math.max(30, Math.min(centerX, 70));
                const adjustedY = Math.max(20, Math.min(centerY - 10, 50));
                
                img.style.setProperty('--face-x', adjustedX);
                img.style.setProperty('--face-y', adjustedY);
                
                this.saveFacePosition(img.dataset.profileId, adjustedX, adjustedY);
            }
            
            this.processedImages.add(img);
        } catch (error) {
            this.warn('Face detection failed:', error);
        } finally {
            this.isProcessing = false;
            
            if (this.queue.size > 0) {
                requestAnimationFrame(() => this.processQueue());
            }
        }
    }
    
    /**
     * Save face position to backend
     */
    async saveFacePosition(userId, x, y) {
        try {
            await fetch('/api/face-position', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, x, y })
            });
        } catch (error) {
            // Silent fail - optional feature
        }
    }
    
    // ===== EVENT HANDLING =====
    
    /**
     * Setup event delegation
     * Uses BaseComponent's event system
     */
    setupEventDelegation(container = document) {
        // Use BaseComponent's event delegation
        this.setupEventDelegation(container, {
            '.uc-card': this.handleCardClick.bind(this),
            '.uc-card': this.handleCardKeydown.bind(this),
            '.uc-image-container': this.handleTouchStart.bind(this),
            '.uc-image-container': this.handleTouchEnd.bind(this)
        });
        
        // Also setup direct event listeners for compatibility
        container.addEventListener('click', this.handleCardClick.bind(this));
        container.addEventListener('keydown', this.handleCardKeydown.bind(this));
        container.addEventListener('touchstart', this.handleTouchStart.bind(this));
        container.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    /**
     * Handle card click
     */
    handleCardClick(event) {
        const card = event.target.closest('.uc-card');
        if (!card) return;
        
        const profileId = card.dataset.profileId;
        
        const actionButton = event.target.closest('[data-action]');
        if (actionButton) {
            event.stopPropagation();
            this.handleAction(actionButton.dataset.action, profileId, card);
            return;
        }
        
        const quickAction = event.target.closest('.uc-quick-action');
        if (quickAction) {
            event.stopPropagation();
            this.handleAction(quickAction.dataset.action, profileId, card);
            return;
        }
        
        const imageContainer = event.target.closest('.uc-image-container');
        if (imageContainer) {
            if (window.innerWidth <= 768) {
                imageContainer.classList.toggle('uc-show-actions');
            }
            return;
        }
        
        this.viewProfile(profileId);
    }
    
    /**
     * Handle keyboard events
     */
    handleCardKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        
        const card = event.target.closest('.uc-card');
        if (!card) return;
        
        event.preventDefault();
        
        if (event.key === 'Enter') {
            this.viewProfile(card.dataset.profileId);
        }
    }
    
    /**
     * Handle touch start
     */
    handleTouchStart(event) {
        const imageContainer = event.target.closest('.uc-image-container');
        if (!imageContainer) return;
        
        this.touchStartX = event.touches[0].clientX;
        this.touchStartY = event.touches[0].clientY;
        this.touchStartTime = Date.now();
        this.touchTarget = imageContainer;
    }
    
    /**
     * Handle touch end
     */
    handleTouchEnd(event) {
        if (!this.touchTarget) return;
        
        const touchEndX = event.changedTouches[0].clientX;
        const touchEndY = event.changedTouches[0].clientY;
        const touchEndTime = Date.now();
        
        const deltaX = touchEndX - this.touchStartX;
        const deltaY = touchEndY - this.touchStartY;
        const duration = touchEndTime - this.touchStartTime;
        
        if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30 && duration < 300) {
            if (deltaX > 0) {
                this.handleAction('like', this.touchTarget.dataset.profileId);
            } else {
                this.nextImage(this.touchTarget);
            }
        }
        
        this.touchTarget = null;
    }
    
    /**
     * Handle action
     */
    handleAction(action, profileId, card) {
        const handlers = {
            like: () => this.likeProfile(profileId),
            message: () => this.messageProfile(profileId),
            favorite: () => this.favoriteProfile(profileId),
            block: () => this.blockProfile(profileId),
            report: () => this.reportProfile(profileId)
        };
        
        if (handlers[action]) {
            handlers[action]();
        }
        
        if (card) {
            this.showActionFeedback(card, action);
        }
    }
    
    /**
     * Show action feedback
     */
    showActionFeedback(card, action) {
        const feedback = document.createElement('div');
        feedback.className = `uc-action-feedback uc-action-${action}`;
        feedback.innerHTML = `<i class="fas fa-${this.getActionIcon(action)}"></i>`;
        
        card.appendChild(feedback);
        
        this.setTimeout(() => {
            feedback.remove();
        }, 1000);
    }
    
    /**
     * Get action icon
     */
    getActionIcon(action) {
        const icons = {
            like: 'heart',
            message: 'comment',
            favorite: 'star',
            block: 'ban',
            report: 'flag'
        };
        
        return icons[action] || 'check';
    }
    
    /**
     * Next image (placeholder)
     */
    nextImage(container) {
        this.log('Next image requested for', container.dataset.profileId);
    }
    
    // ===== ACTION HANDLERS =====
    
    /**
     * View profile
     */
    viewProfile(profileId) {
        this.emit('view-profile', { profileId });
    }
    
    /**
     * Like profile
     */
    likeProfile(profileId) {
        this.emit('like-profile', { profileId });
    }
    
    /**
     * Message profile
     */
    messageProfile(profileId) {
        this.emit('message-profile', { profileId });
    }
    
    /**
     * Favorite profile
     */
    favoriteProfile(profileId) {
        this.emit('favorite-profile', { profileId });
    }
    
    /**
     * Block profile
     */
    blockProfile(profileId) {
        this.emit('block-profile', { profileId });
    }
    
    /**
     * Report profile
     */
    reportProfile(profileId) {
        this.emit('report-profile', { profileId });
    }
    
    // ===== BULK RENDERING =====
    
    /**
     * Render grid of cards
     */
    renderGrid(profiles, columns = 3, container) {
        if (!container) return;
        
        if (this.config.skeletonLoading) {
            container.innerHTML = this.renderSkeletonCards(columns, 6);
        }
        
        this.setTimeout(() => {
            const cardsHtml = profiles.map(profile => 
                this.render(profile, columns)
            ).join('');
            
            container.innerHTML = cardsHtml;
            
            if (this.config.lazyLoad && this.imageObserver) {
                this.setupLazyLoadForContainer(container);
            }
        }, 100);
    }
    
    /**
     * Render skeleton cards
     */
    renderSkeletonCards(columns, count = 6) {
        return Array.from({ length: count }, () => `
            <div class="uc-card uc-skeleton" data-columns="${columns}">
                <div class="uc-image-container"></div>
                <div class="uc-info">
                    <h3 class="uc-name"></h3>
                    <div class="uc-location"></div>
                    <p class="uc-about"></p>
                </div>
            </div>
        `).join('');
    }
    
    /**
     * Setup lazy loading for container
     */
    setupLazyLoadForContainer(container) {
        const images = container.querySelectorAll('.uc-avatar[data-src]');
        images.forEach(img => {
            if (this.imageObserver) {
                this.imageObserver.observe(img);
            }
        });
    }
}


