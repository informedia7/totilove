/**
 * Stats Count Calculator
 * Calculates and displays user profile completion percentage and photo count
 * with accurate field validation and scoring system
 */

class StatsCount {
    constructor() {
        this.completionBadge = null;
        this.percentageElement = null;
        this.labelElement = null;
        this.photoCountElement = null;
        // Initialize cache
        this.cache = {
            photos: null,
            completion: null,
            userId: null,
            timestamp: null,
            cacheDuration: 5 * 60 * 1000
        };
        this.init();
    }

    init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.setupElements());
        } else {
            this.setupElements();
        }
    }

    setupElements() {
        this.completionBadge = document.getElementById('profile-completion-badge');
        this.percentageElement = document.getElementById('completion-percentage');
        this.labelElement = document.getElementById('completion-label');
        this.photoCountElement = document.getElementById('photo-count');
    }

    /**
     * Calculate profile completion percentage from backend API
     * Based on empty columns in user_attributes and user_preferences database tables
     */
    async calculateCompletion() {
        const user = window.currentUser || {};
        const userId = user.id;

        if (!userId) {
            return {
                percentage: 0,
                totalScore: 0,
                maxScore: 0,
                completedFields: 0,
                totalFields: 0
            };
        }

        try {
            // Fetch completion percentage from backend API
            const response = await fetch(`/api/users/${userId}/profile-completion`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();
            const percentageValue = typeof data.percentage === 'number'
                ? data.percentage
                : (typeof data.completion === 'number' ? data.completion : null);
            
            if (data.success && percentageValue !== null) {
                return {
                    percentage: percentageValue,
                    totalScore: percentageValue,
                    maxScore: 100,
                    completedFields: percentageValue,
                    totalFields: 100
                };
            } else {
                throw new Error('Invalid response from server');
            }
        } catch (error) {
            console.error('Error fetching profile completion:', error);
            // Fallback to 0 if API call fails
            return {
                percentage: 0,
                totalScore: 0,
                maxScore: 100,
                completedFields: 0,
                totalFields: 100
            };
        }
    }

    /**
     * Calculate photo count from user's profile images by fetching from API
     */
    async calculatePhotoCount() {
        const user = window.currentUser || {};
        const userId = user.id;

        if (!userId) {
            return 0;
        }

        try {
            // Fetch photo count from API
            const response = await fetch(`/api/user/${userId}/images`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                console.warn('Failed to fetch photo count:', response.status);
                return 0;
            }

            const result = await response.json();
            
            if (result && result.success && result.images && Array.isArray(result.images)) {
                return result.images.length;
            }
            
            // Fallback to count field if images array not present
            if (result && result.count !== undefined) {
                return result.count;
            }
            
            return 0;
        } catch (error) {
            console.error('Error calculating photo count:', error);
            return 0;
        }
    }

    /**
     * Get field value from various sources
     * Now handles all profile fields including detailed attributes and preferences
     */
    getFieldValue(fieldName) {
        const user = window.currentUser || {};

        switch (fieldName) {
            // Basic Information
            case 'real_name':
                return user.real_name || user.name || '';
            case 'email':
                return user.email || '';
            case 'age':
                return user.age || user.userAge || 0;
            case 'gender':
                return user.gender || user.userGender || '';
            case 'location':
                return user.location || user.userLocation || '';
            case 'profilePhoto':
                return this.hasProfilePhoto();
            case 'bio':
                return user.bio || user.about || user.description || user.aboutMe || '';
            case 'interests':
                return user.interests || user.hobbies || '';
            
            // Physical Attributes
            case 'height':
                return user.height || '';
            case 'bodyType':
                return user.bodyType || '';
            case 'eyeColor':
                return user.eyeColor || '';
            case 'hairColor':
                return user.hairColor || '';
            case 'ethnicity':
                return user.ethnicity || '';
            
            // Background & Lifestyle
            case 'religion':
                return user.religion || '';
            case 'education':
                return user.education || '';
            case 'occupation':
                return user.occupation || '';
            case 'smoking':
                return user.smoking || '';
            case 'drinking':
                return user.drinking || '';
            case 'exercise':
                return user.exercise || '';
            case 'children':
                return user.children || '';
            
            // Preferences (What I'm Looking For)
            case 'preferredAgeMin':
                return user.preferredAgeMin || user.ageMin || '';
            case 'preferredAgeMax':
                return user.preferredAgeMax || user.ageMax || '';
            case 'preferredGender':
                return user.preferredGender || '';
            case 'preferredDistance':
                return user.preferredDistance || user.locationRadius || '';
            case 'preferredHeight':
                return user.preferredHeight || '';
            case 'preferredBodyType':
                return user.preferredBodyType || '';
            case 'preferredEducation':
                return user.preferredEducation || '';
            case 'preferredReligion':
                return user.preferredReligion || '';
            case 'preferredSmoking':
                return user.preferredSmoking || '';
            case 'preferredDrinking':
                return user.preferredDrinking || '';
            case 'preferredChildren':
                return user.preferredChildren || '';
            
            default:
                return '';
        }
    }

    /**
     * Check if user has profile photo
     */
    hasProfilePhoto() {
        const avatarElement = document.getElementById('avatar');
        if (avatarElement) {
            const img = avatarElement.querySelector('img');
            if (img && img.src && !img.src.includes('default') && !img.src.includes('placeholder')) {
                return true;
            }
        }
        return false;
    }

    /**
     * Validate email format
     */
    isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Update the completion badge display
     */
    updateDisplay(completionData) {
        if (!this.percentageElement || !this.completionBadge) return;

        const { percentage } = completionData;

        // Update percentage text
        this.percentageElement.textContent = percentage + '%';

        // Update label text based on completion
        this.updateLabelText(percentage);
    }

    /**
     * Update the photo count display
     */
    updatePhotoCount(photoCount) {
        if (!this.photoCountElement) return;
        this.photoCountElement.textContent = photoCount;
    }

    /**
     * Update label text based on completion percentage
     * Updated for comprehensive profile completion calculation
     */
    updateLabelText(percentage) {
        if (!this.labelElement) return;

        let labelText;
        if (percentage >= 100) {
            labelText = 'Complete!';
        } else if (percentage >= 80) {
            labelText = 'Excellent';
        } else if (percentage >= 60) {
            labelText = 'Good';
        } else if (percentage >= 40) {
            labelText = 'Fair';
        } else if (percentage >= 20) {
            labelText = 'Basic';
        } else {
            labelText = 'Minimal';
        }

        this.labelElement.textContent = labelText;
    }

    /**
     * Calculate and update completion display (with caching)
     */
    async calculateAndUpdate() {
        const userId = window.currentUser?.id;
        const now = Date.now();
        const cache = this.cache;
        
        // Check if cache is valid for this user
        const isCacheValid = cache.userId === userId && 
                            cache.timestamp && 
                            (now - cache.timestamp) < cache.cacheDuration;
        
        let completionData, photoCount;
        
        // Use cached values if available and valid
        if (isCacheValid && cache.completion && cache.photos !== null) {
            completionData = cache.completion;
            photoCount = cache.photos;
        } else {
            // Fetch fresh data
            completionData = await this.calculateCompletion();
            photoCount = await this.calculatePhotoCount();
            
            // Update cache
            cache.completion = completionData;
            cache.photos = photoCount;
            cache.userId = userId;
            cache.timestamp = now;
        }

        // Update completion display
        this.updateDisplay(completionData);

        // Update photo count
        this.updatePhotoCount(photoCount);

        return {
            completion: completionData,
            photoCount: photoCount
        };
    }

    /**
     * Force refresh of completion calculation
     */
    async refresh() {
        return await this.calculateAndUpdate();
    }

    /**
     * Get detailed completion breakdown
     */
    getCompletionBreakdown() {
        const user = window.currentUser || {};
        const breakdown = {
            real_name: {
                value: this.getFieldValue('real_name'),
                completed: this.isUsernameComplete(),
                weight: 15
            },
            email: {
                value: this.getFieldValue('email'),
                completed: this.isValidEmail(this.getFieldValue('email')),
                weight: 15
            },
            age: {
                value: this.getFieldValue('age'),
                completed: this.getFieldValue('age') >= 18,
                weight: 10
            },
            gender: {
                value: this.getFieldValue('gender'),
                completed: this.getFieldValue('gender').length > 0,
                weight: 10
            },
            location: {
                value: this.getFieldValue('location'),
                completed: this.getFieldValue('location').length > 0,
                weight: 15
            },
            profilePhoto: {
                value: this.hasProfilePhoto(),
                completed: this.hasProfilePhoto(),
                weight: 20
            },
            bio: {
                value: this.getFieldValue('bio'),
                completed: this.getFieldValue('bio').length >= 10,
                weight: 10
            },
            interests: {
                value: this.getFieldValue('interests'),
                completed: Array.isArray(this.getFieldValue('interests')) && this.getFieldValue('interests').length > 0,
                weight: 5
            }
        };

        return breakdown;
    }

    /**
     * Check if real_name is complete
     */
    isUsernameComplete() {
        const real_name = this.getFieldValue('real_name');
        return real_name && real_name.trim().length >= 3;
    }
}

// Initialize the calculator when the script loads
const statsCount = new StatsCount();

// Make it globally accessible
window.statsCount = statsCount;

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StatsCount;
}
