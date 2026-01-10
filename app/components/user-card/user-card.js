// ===== USER CARD COMPONENT =====
// Modular, tree-shakeable ES6 module

const DEFAULT_IMAGES = {
    male: '/assets/images/default_profile_male.svg',
    female: '/assets/images/default_profile_female.svg',
    default: '/assets/images/default_profile_male.svg' // Fallback to male default if no default image exists
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
  
  class UserCard {
    constructor(config = {}) {
      this.config = {
        lazyLoad: true,
        faceDetection: false,
        quickActions: true,
        skeletonLoading: true,
        ...config
      };
      
      this.faceDetector = null;
      this.imageObserver = null;
      this.intersectionObserver = null;
      this.processedImages = new WeakSet();
      this.queue = new Set();
      this.isProcessing = false;
      
      this.init();
    }
    
    async init() {
      if (this.config.faceDetection) {
        await this.initFaceDetection();
      }
      
      if (this.config.lazyLoad) {
        this.initLazyLoading();
      }
      
      this.setupEventDelegation();
    }
    
    // ===== RENDER FUNCTIONS =====
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
    
    renderImageContainer(profile, columns) {
      const imageUrl = this.getImageUrl(profile);
      const defaultImage = this.getDefaultImage(profile.gender);
      const badges = this.renderBadges(profile);
      
      // Ensure we always have a valid image URL
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
    
    renderQuickActions(profileId, username = '') {
      const safeUsername = this.escapeHtml(username);
      return `
        <div class="uc-quick-actions">
          <button class="uc-quick-action uc-quick-action-like" 
                  data-action="like" 
                  data-profile-id="${profileId}"
                  data-username="${safeUsername}"
                  aria-label="Like profile">
            <i class="fas fa-heart"></i>
          </button>
          <button class="uc-quick-action uc-quick-action-message" 
                  data-action="message" 
                  data-profile-id="${profileId}"
                  data-username="${safeUsername}"
                  aria-label="Send message">
            <i class="fas fa-comment"></i>
          </button>
          <button class="uc-quick-action uc-quick-action-favorite" 
                  data-action="favorite" 
                  data-profile-id="${profileId}"
                  data-username="${safeUsername}"
                  aria-label="Add to favorites">
            <i class="fas fa-star"></i>
          </button>
        </div>
      `;
    }
    
    renderInfoSection(profile) {
      return `
        <div class="uc-info">
          ${this.renderName(profile)}
          ${this.renderLocation(profile)}
          ${(profile.seeking_gender || profile.preferred_gender) && (profile.seeking_age_min !== undefined || profile.age_min !== undefined) && (profile.seeking_age_max !== undefined || profile.age_max !== undefined) ? this.renderSeeking(profile) : ''}
          ${profile.interests?.length ? this.renderInterests(profile.interests) : ''}
          ${profile.about ? this.renderAbout(profile.about) : ''}
        </div>
      `;
    }
    
    renderName(profile) {
      const genderIcon = profile.gender ? this.renderGenderIcon(profile.gender) : '';
      const ageBadge = profile.age ? `<span class="uc-age">${profile.age}</span>` : '';
      
      return `
        <h3 class="uc-name">
          ${profile.name}
          ${genderIcon}
          ${ageBadge}
        </h3>
      `;
    }
    
    renderGenderIcon(gender) {
      const genderLower = gender.toLowerCase();
      const icon = genderLower.includes('female') ? 'fa-venus' : 'fa-mars';
      const className = genderLower.includes('female') ? 'uc-gender-female' : 'uc-gender-male';
      
      return `<i class="fas ${icon} uc-gender-icon ${className}"></i>`;
    }
    
    renderLocation(profile) {
      const locationParts = [];
      
      if (profile.city) locationParts.push(profile.city);
      if (profile.country) {
        locationParts.push(profile.country);
      }
      
      const location = locationParts.length ? locationParts.join(', ') : 'Location not specified';
      
      return `
        <div class="uc-location">
          <i class="fas fa-map-marker-alt"></i>
          <span>${location}</span>
        </div>
      `;
    }
    
    renderSeeking(profile) {
      const genderMap = {
        'male': 'Male',
        'female': 'Female',
        'm': 'Male',
        'f': 'Female'
      };
      
      // Get seeking gender from multiple possible fields
      const seekingGenderRaw = profile.seeking_gender || profile.preferred_gender || '';
      const seekingGender = genderMap[seekingGenderRaw?.toLowerCase()] || seekingGenderRaw || 'Anyone';
      
      // Get age range
      const ageMin = profile.seeking_age_min || profile.age_min || 18;
      const ageMax = profile.seeking_age_max || profile.age_max || 99;
      
      return `
        <div class="uc-seeking">
          Seeking: ${seekingGender}, ${ageMin}-${ageMax}
        </div>
      `;
    }
    
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
    
    renderAbout(about) {
      return `<p class="uc-about">${about}</p>`;
    }
    
    // ===== UTILITY FUNCTIONS =====
    sanitizeProfile(profile) {
      return {
        id: profile.id || 0,
        name: this.escapeHtml(profile.real_name || profile.name || `User${profile.id || 0}`),
        username: this.escapeHtml(profile.username || profile.real_name || profile.name || ''),
        age: profile.age || 0,
        gender: profile.gender || null,
        city: profile.city_name || profile.city || '',
        country: profile.country_name || profile.country || '',
        about: this.escapeHtml(profile.about || ''),
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
        profile_image: profile.profile_image || profile.profileImage || profile.image || null, // Preserve image field
        ...profile // Spread at end to override with original values
      };
    }
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
    
    getImageUrl(profile) {
      const profileImage = profile.profile_image || profile.profileImage || profile.image || null;
      
      if (!profileImage || profileImage === 'null' || profileImage === 'undefined' || profileImage === '') {
        return this.getDefaultImage(profile.gender);
      }
      
      // Already a full URL
      if (profileImage.startsWith('http://') || profileImage.startsWith('https://')) {
        return profileImage;
      }
      
      // Already has leading slash
      if (profileImage.startsWith('/')) {
        return profileImage;
      }
      
      // Relative path - construct full path
      if (profileImage.includes('/uploads/profile_images/')) {
        return profileImage.startsWith('/') ? profileImage : `/${profileImage}`;
      }
      
      // Just filename - add path
      return `/uploads/profile_images/${profileImage}`;
    }
    
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
    
    // ===== IMAGE LOADING & PROCESSING =====
    initLazyLoading() {
      this.intersectionObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            this.loadImage(img);
            this.intersectionObserver.unobserve(img);
          }
        });
      }, {
        rootMargin: '50px',
        threshold: 0.01
      });
    }
    
    loadImage(img) {
      if (!img.dataset.src) return;
      
      const src = img.dataset.src;
      
      // Show loading state
      img.classList.remove('uc-loaded');
      img.classList.add('uc-loading');
      
      // Create new image to test loading
      const testImg = new Image();
      
      testImg.onload = () => {
        img.src = src;
        img.classList.remove('uc-loading');
        img.classList.add('uc-loaded');
        delete img.dataset.src;
        
        // Process face detection if enabled
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
    async initFaceDetection() {
      if (typeof FaceDetection === 'undefined') {
        console.warn('Face Detection not available');
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
        
        console.log('Face detection initialized');
      } catch (error) {
        console.warn('Failed to initialize face detection:', error);
        this.config.faceDetection = false;
      }
    }
    
    async queueFaceDetection(img) {
      if (this.processedImages.has(img) || !this.faceDetector) {
        return;
      }
      
      this.queue.add(img);
      this.processQueue();
    }
    
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
          
          // Calculate center percentages
          const centerX = (x + width / 2) / img.naturalWidth * 100;
          const centerY = (y + height / 2) / img.naturalHeight * 100;
          
          // Adjust for optimal positioning
          const adjustedX = Math.max(30, Math.min(centerX, 70));
          const adjustedY = Math.max(20, Math.min(centerY - 10, 50));
          
          // Apply with CSS custom properties
          img.style.setProperty('--face-x', adjustedX);
          img.style.setProperty('--face-y', adjustedY);
          
          // Store for future use
          this.saveFacePosition(img.dataset.profileId, adjustedX, adjustedY);
        }
        
        this.processedImages.add(img);
      } catch (error) {
        console.debug('Face detection failed:', error);
      } finally {
        this.isProcessing = false;
        
        // Process next in queue
        if (this.queue.size > 0) {
          requestAnimationFrame(() => this.processQueue());
        }
      }
    }
    
    async saveFacePosition(userId, x, y) {
      // Optional: Save to backend
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
    setupEventDelegation(container = document) {
      // Single event listener for all card interactions
      container.addEventListener('click', this.handleCardClick.bind(this));
      container.addEventListener('keydown', this.handleCardKeydown.bind(this));
      container.addEventListener('touchstart', this.handleTouchStart.bind(this));
      container.addEventListener('touchend', this.handleTouchEnd.bind(this));
    }
    
    handleCardClick(event) {
      const card = event.target.closest('.uc-card');
      if (!card) return;
      
      const profileId = card.dataset.profileId;
      
      // Handle action buttons
      const actionButton = event.target.closest('[data-action]');
      if (actionButton) {
        event.stopPropagation();
        this.handleAction(actionButton.dataset.action, profileId, card);
        return;
      }
      
      // Handle quick actions
      const quickAction = event.target.closest('.uc-quick-action');
      if (quickAction) {
        event.stopPropagation();
        this.handleAction(quickAction.dataset.action, profileId, card);
        return;
      }
      
      // Handle image container actions
      const imageContainer = event.target.closest('.uc-image-container');
      if (imageContainer) {
        // Toggle quick actions on mobile
        if (window.innerWidth <= 768) {
          imageContainer.classList.toggle('uc-show-actions');
        }
        return;
      }
      
      // Default: view profile
      this.viewProfile(profileId);
    }
    
    handleCardKeydown(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      
      const card = event.target.closest('.uc-card');
      if (!card) return;
      
      event.preventDefault();
      
      if (event.key === 'Enter') {
        this.viewProfile(card.dataset.profileId);
      }
    }
    
    handleTouchStart(event) {
      const imageContainer = event.target.closest('.uc-image-container');
      if (!imageContainer) return;
      
      this.touchStartX = event.touches[0].clientX;
      this.touchStartY = event.touches[0].clientY;
      this.touchStartTime = Date.now();
      this.touchTarget = imageContainer;
    }
    
    handleTouchEnd(event) {
      if (!this.touchTarget) return;
      
      const touchEndX = event.changedTouches[0].clientX;
      const touchEndY = event.changedTouches[0].clientY;
      const touchEndTime = Date.now();
      
      const deltaX = touchEndX - this.touchStartX;
      const deltaY = touchEndY - this.touchStartY;
      const duration = touchEndTime - this.touchStartTime;
      
      // Check if it's a swipe
      if (Math.abs(deltaX) > 50 && Math.abs(deltaY) < 30 && duration < 300) {
        if (deltaX > 0) {
          // Swipe right - like
          this.handleAction('like', this.touchTarget.dataset.profileId);
        } else {
          // Swipe left - next image (if available)
          this.nextImage(this.touchTarget);
        }
      }
      
      this.touchTarget = null;
    }
    
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
      
      // Visual feedback
      if (card) {
        this.showActionFeedback(card, action);
      }
    }
    
    showActionFeedback(card, action) {
      const feedback = document.createElement('div');
      feedback.className = `uc-action-feedback uc-action-${action}`;
      feedback.innerHTML = `<i class="fas fa-${this.getActionIcon(action)}"></i>`;
      
      card.appendChild(feedback);
      
      setTimeout(() => {
        feedback.remove();
      }, 1000);
    }
    
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
    
    nextImage(container) {
      // Implement if multi-image support is needed
      console.log('Next image requested for', container.dataset.profileId);
    }
    
    // ===== ACTION HANDLERS =====
    viewProfile(profileId) {
      window.dispatchEvent(new CustomEvent('view-profile', { 
        detail: { profileId } 
      }));
    }
    
    likeProfile(profileId) {
      window.dispatchEvent(new CustomEvent('like-profile', { 
        detail: { profileId } 
      }));
    }
    
    messageProfile(profileId) {
      window.dispatchEvent(new CustomEvent('message-profile', { 
        detail: { profileId } 
      }));
    }
    
    favoriteProfile(profileId) {
      window.dispatchEvent(new CustomEvent('favorite-profile', { 
        detail: { profileId } 
      }));
    }
    
    blockProfile(profileId) {
      window.dispatchEvent(new CustomEvent('block-profile', { 
        detail: { profileId } 
      }));
    }
    
    reportProfile(profileId) {
      window.dispatchEvent(new CustomEvent('report-profile', { 
        detail: { profileId } 
      }));
    }
    
    // ===== BULK RENDERING =====
    renderGrid(profiles, columns = 3, container) {
      if (!container) return;
      
      // Show skeleton loading
      if (this.config.skeletonLoading) {
        container.innerHTML = this.renderSkeletonCards(columns, 6);
      }
      
      // Render actual cards with delay for perceived performance
      setTimeout(() => {
        const cardsHtml = profiles.map(profile => 
          this.render(profile, columns)
        ).join('');
        
        container.innerHTML = cardsHtml;
        
        // Setup lazy loading for new images
        if (this.config.lazyLoad) {
          this.setupLazyLoadForContainer(container);
        }
      }, 100);
    }
    
    renderSkeletonCards(columns, count = 6) {
      return Array.from({ length: count }, () => `
        <div class="uc-card uc-skeleton" data-columns="${columns}">
          <div class="uc-image-container"></div>
          <div class="uc-info">
            <h3 class="uc-name"></h3>
            <div class="uc-location"></div>
            <p class="uc-about"></p>
            <div class="uc-actions" data-columns="${columns}">
              ${Array.from({ length: 5 }, () => 
                '<span class="uc-action"></span>'
              ).join('')}
            </div>
          </div>
        </div>
      `).join('');
    }
    
    setupLazyLoadForContainer(container) {
      const images = container.querySelectorAll('.uc-avatar[data-src]');
      images.forEach(img => {
        this.intersectionObserver.observe(img);
      });
    }
    
    // ===== CLEANUP =====
    destroy() {
      if (this.intersectionObserver) {
        this.intersectionObserver.disconnect();
      }
      
      if (this.faceDetector) {
        this.faceDetector.dispose();
      }
      
      this.queue.clear();
      this.processedImages = new WeakSet();
    }
  }
  
  // ===== USAGE EXAMPLE =====
  /*
  // Initialize
  const userCard = new UserCard({
    lazyLoad: true,
    faceDetection: true,
    quickActions: true
  });
  
  // Render single card
  const profile = { id: 1, name: 'John', age: 30, ... };
  const cardHtml = userCard.render(profile, 4);
  
  // Render grid
  const profiles = [...];
  userCard.renderGrid(profiles, 4, document.getElementById('grid'));
  
  // Handle events
  window.addEventListener('like-profile', (e) => {
    console.log('Like profile:', e.detail.profileId);
  });
  
  // Cleanup when done
  // userCard.destroy();
  */
  
   // Provide global access
   if (typeof window !== 'undefined') {
     window.UserCard = UserCard;
     
     // Create singleton instance for backward compatibility
     const defaultUserCard = new UserCard({
       lazyLoad: false, // Disable lazy loading for immediate image display
       faceDetection: false,
       quickActions: true,
       skeletonLoading: true
     });
     
     // Legacy compatibility functions for existing code
     window.renderResultsUserCard = function(profile) {
       const columns = 4; // Default, can be overridden
       return defaultUserCard.render(profile, columns);
     };
     
     window.setupResultsUserCardEvents = function(grid) {
       if (!grid) return;
       
       // Setup event delegation on the grid
       defaultUserCard.setupEventDelegation(grid);
       
       // Setup lazy loading for images in this grid
       if (defaultUserCard.config.lazyLoad && defaultUserCard.intersectionObserver) {
         const images = grid.querySelectorAll('.uc-avatar[data-src]');
         images.forEach(img => {
           defaultUserCard.intersectionObserver.observe(img);
         });
       }
       
       // Setup image loading handlers
       setTimeout(() => {
         grid.querySelectorAll('.uc-avatar').forEach(img => {
           // Ensure image has a valid src
           if (!img.src || img.src === '' || img.src === window.location.href) {
             if (img.dataset.default) {
               img.src = img.dataset.default;
             } else {
               // No default image - show fallback
               img.style.display = 'none';
               const fallback = img.nextElementSibling;
               if (fallback && fallback.classList.contains('uc-avatar-fallback')) {
                 fallback.style.display = 'grid';
               }
               return;
             }
           }
           
           // Handle already loaded images
           if (img.complete && img.naturalWidth > 0) {
             img.classList.remove('uc-loading');
             img.classList.add('uc-loaded');
             // Hide fallback if image loaded successfully
             const fallback = img.nextElementSibling;
             if (fallback && fallback.classList.contains('uc-avatar-fallback')) {
               fallback.style.display = 'none';
             }
           } else {
             // Handle image load
             img.addEventListener('load', function() {
               this.classList.remove('uc-loading');
               this.classList.add('uc-loaded');
               // Hide fallback if image loaded successfully
               const fallback = this.nextElementSibling;
               if (fallback && fallback.classList.contains('uc-avatar-fallback')) {
                 fallback.style.display = 'none';
               }
             }, { once: true });
             
             // Handle image error - try default, then show fallback
             img.addEventListener('error', function() {
               this.classList.add('error');
               
               // Try default image first if available and different from current src
               const defaultSrc = this.dataset.default;
               if (defaultSrc && this.src !== defaultSrc && this.src !== window.location.href + defaultSrc) {
                 this.src = defaultSrc;
                 // Don't return - let it try to load default
                 return;
               }
               
               // Default also failed or not available - hide image and show fallback
               this.style.display = 'none';
               const fallback = this.nextElementSibling;
               if (fallback && fallback.classList.contains('uc-avatar-fallback')) {
                 fallback.style.display = 'grid';
               }
             }, { once: true });
           }
         });
         
         // Mobile: Tap-to-toggle quick actions
         const isMobileDevice = window.innerWidth <= 768 || ('ontouchstart' in window);
         let touchStartTime = 0;
         let touchStartContainer = null;
         
         // Handle taps/clicks on image container for quick actions
         const handleImageTap = (e) => {
           const container = e.target.closest('.uc-image-container');
           const isQuickAction = e.target.closest('.uc-quick-action');
           
           if (!container) {
             // Close any open quick actions when tapping/clicking outside
             grid.querySelectorAll('.uc-image-container.uc-show-actions').forEach(c => {
               c.classList.remove('uc-show-actions');
             });
             touchStartContainer = null;
             return;
           }
           
           // Don't toggle if clicking on quick action buttons
           if (isQuickAction) {
             touchStartContainer = null;
             return;
           }
           
           // Prevent double-toggling on mobile (touchstart + click)
           if (e.type === 'click' && isMobileDevice && touchStartContainer === container) {
             const timeSinceTouch = Date.now() - touchStartTime;
             if (timeSinceTouch < 500) {
               // Click happened soon after touchstart, ignore it
               touchStartContainer = null;
               return;
             }
           }
           
           // On mobile, toggle quick actions and prevent card click
           if (isMobileDevice) {
             e.stopPropagation(); // Prevent card click from firing
             container.classList.toggle('uc-show-actions');
             if (e.type === 'touchstart') {
               touchStartTime = Date.now();
               touchStartContainer = container;
             }
             return;
           }
           
           // On desktop, toggle on click (hover will also work)
           container.classList.toggle('uc-show-actions');
         };
         
         // Add event listeners with capture phase to fire before card click
         if (isMobileDevice) {
           // Mobile: Use touchstart for immediate response
           grid.addEventListener('touchstart', handleImageTap, { capture: true, passive: false });
         }
         // Always add click handler (works on all devices, including mobile as fallback)
         grid.addEventListener('click', handleImageTap, { capture: true });
         
         // View profile click handler
         grid.querySelectorAll('.uc-card').forEach(card => {
           card.addEventListener('click', function(e) {
             // Don't open profile if clicking on quick action buttons
             if (e.target.closest('.uc-quick-action')) {
               return;
             }
             
             // Don't open profile if clicking on image container on mobile (quick actions handle it)
             const isMobile = window.innerWidth <= 768 || ('ontouchstart' in window);
             if (isMobile && e.target.closest('.uc-image-container')) {
               // Quick actions toggle is handled above, don't open profile
               return;
             }
             
             const profileId = parseInt(this.dataset.profileId);
             if (window.viewProfile && profileId) {
               window.viewProfile(profileId);
             }
           });
           
           // Keyboard accessibility: Enter key to open profile
           card.addEventListener('keydown', function(e) {
             if (e.key === 'Enter' || e.key === ' ') {
               e.preventDefault();
               const profileId = parseInt(this.dataset.profileId);
               if (window.viewProfile && profileId) {
                 window.viewProfile(profileId);
               }
             }
           });
         });
         
         // Prevent accidental card clicks when clicking quick action buttons
         grid.querySelectorAll('.uc-quick-action').forEach(el => {
           el.addEventListener('click', (e) => {
             e.stopPropagation();
           });
         });
         
         // Quick action button handlers (hover overlay buttons only)
         grid.querySelectorAll('.uc-quick-action[data-action="message"]').forEach(btn => {
           btn.addEventListener('click', function(e) {
             e.stopPropagation();
             const username = this.dataset.username;
             if (window.messageProfile && username) {
               window.messageProfile(username);
             }
           });
         });
         
         grid.querySelectorAll('.uc-quick-action[data-action="like"]').forEach(btn => {
           btn.addEventListener('click', function(e) {
             e.stopPropagation();
             const profileId = parseInt(this.dataset.profileId);
             const username = this.dataset.username || '';
             if (window.likeProfile) {
               window.likeProfile(profileId, username);
             }
           });
         });
         
         grid.querySelectorAll('.uc-quick-action[data-action="favorite"]').forEach(btn => {
           btn.addEventListener('click', function(e) {
             e.stopPropagation();
             const profileId = parseInt(this.dataset.profileId);
             if (window.addToFavourite) {
               window.addToFavourite(profileId);
             }
           });
         });
       }, 100);
     };
   }