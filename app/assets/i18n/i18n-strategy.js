/**
 * TOTILOVE I18N IMPLEMENTATION STRATEGY
 * ====================================
 * 
 * Based on your existing 25+ language database system,
 * here's the optimal implementation approach.
 */

class TotiloveI18n {
    constructor() {
        this.currentLanguage = this.detectUserLanguage();
        this.supportedLanguages = this.getSupportedLanguages();
        this.translations = {};
        this.dateFormats = {};
        this.numberFormats = {};
    }

    /**
     * PHASE 1: IMMEDIATE SETUP
     * Set up core i18n infrastructure
     */
    async initializeI18n() {
        // Load user's preferred languages from database
        await this.loadUserLanguages();
        
        // Load translation files
        await this.loadTranslations(this.currentLanguage);
        
        // Set up number/date formatting
        this.setupFormatting();
        
        // Apply initial translations
        this.translatePage();
    }

    /**
     * DETECT USER LANGUAGE PREFERENCE
     * Priority: User Profile > Browser > Geolocation > Default
     */
    detectUserLanguage() {
        // 1. Check user profile (if logged in)
        const userLanguage = this.getUserProfileLanguage();
        if (userLanguage) return userLanguage;

        // 2. Check browser language
        const browserLang = navigator.language.split('-')[0];
        if (this.isSupported(browserLang)) return browserLang;

        // 3. Default to English
        return 'en';
    }

    /**
     * GET SUPPORTED LANGUAGES FROM YOUR DATABASE
     * Starting with 4 primary languages: English, Vietnamese, Thai, Chinese
     */
    getSupportedLanguages() {
        return [
            { code: 'en', name: 'English', native: 'English', flag: '🇺🇸' },
            { code: 'vi', name: 'Vietnamese', native: 'Tiếng Việt', flag: '��' },
            { code: 'th', name: 'Thai', native: 'ไทย', flag: '🇹�' },
            { code: 'zh', name: 'Chinese', native: '中文', flag: '🇨🇳' }
        ];
    }

    /**
     * TRANSLATION FUNCTION
     * t('key', params) - main translation function
     */
    t(key, params = {}) {
        let translation = this.getNestedTranslation(key);
        
        // Handle missing translations
        if (!translation) {
            console.warn(`Missing translation: ${key} for language: ${this.currentLanguage}`);
            return key; // Return key as fallback
        }

        // Handle parameter substitution
        return this.substituteParams(translation, params);
    }

    /**
     * LOAD TRANSLATIONS DYNAMICALLY
     * Only load what you need, when you need it
     */
    async loadTranslations(languageCode) {
        try {
            const response = await fetch(`/i18n/${languageCode}.json`);
            this.translations[languageCode] = await response.json();
        } catch (error) {
            console.error(`Failed to load translations for ${languageCode}:`, error);
            // Fallback to English if available
            if (languageCode !== 'en') {
                await this.loadTranslations('en');
            }
        }
    }

    /**
     * PAGE TRANSLATION
     * Automatically translate elements with data-i18n attributes
     */
    translatePage() {
        document.querySelectorAll('[data-i18n]').forEach(element => {
            const key = element.getAttribute('data-i18n');
            const translation = this.t(key);
            
            if (element.tagName === 'INPUT' && element.type === 'submit') {
                element.value = translation;
            } else if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                element.placeholder = translation;
            } else {
                element.textContent = translation;
            }
        });
    }

    /**
     * LANGUAGE SWITCHING
     * Smooth transition between languages
     */
    async switchLanguage(newLanguageCode) {
        if (!this.isSupported(newLanguageCode)) {
            console.error(`Unsupported language: ${newLanguageCode}`);
            return;
        }

        // Load new translations if not already loaded
        if (!this.translations[newLanguageCode]) {
            await this.loadTranslations(newLanguageCode);
        }

        // Update current language
        this.currentLanguage = newLanguageCode;
        
        // Save to user preferences
        await this.saveUserLanguagePreference(newLanguageCode);
        
        // Re-translate page
        this.translatePage();
        
        // Update formatting
        this.setupFormatting();
        
        // Trigger custom event for other components
        document.dispatchEvent(new CustomEvent('languageChanged', {
            detail: { language: newLanguageCode }
        }));
    }

    /**
     * HELPER METHODS
     */
    getNestedTranslation(key) {
        return key.split('.').reduce((obj, k) => obj && obj[k], 
            this.translations[this.currentLanguage]);
    }

    substituteParams(text, params) {
        return text.replace(/\{\{(\w+)\}\}/g, (match, key) => 
            params[key] || match);
    }

    isSupported(languageCode) {
        return this.supportedLanguages.some(lang => lang.code === languageCode);
    }

    async getUserProfileLanguage() {
        // Integrate with your user system
        try {
            const response = await fetch('/api/user/language-preference');
            const data = await response.json();
            return data.language;
        } catch {
            return null;
        }
    }

    async saveUserLanguagePreference(languageCode) {
        try {
            await fetch('/api/user/language-preference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ language: languageCode })
            });
        } catch (error) {
            console.error('Failed to save language preference:', error);
        }
    }

    setupFormatting() {
        // Set up Intl formatters for current language
        this.dateFormatter = new Intl.DateTimeFormat(this.currentLanguage);
        this.numberFormatter = new Intl.NumberFormat(this.currentLanguage);
        this.currencyFormatter = new Intl.NumberFormat(this.currentLanguage, {
            style: 'currency',
            currency: this.getCurrencyForLanguage(this.currentLanguage)
        });
    }

    getCurrencyForLanguage(lang) {
        const currencyMap = {
            'en': 'USD', 'vi': 'VND', 'th': 'THB', 'zh': 'CNY'
        };
        return currencyMap[lang] || 'USD';
    }
}

/**
 * IMPLEMENTATION PRIORITIES FOR YOUR DATING APP
 */
const IMPLEMENTATION_PHASES = {
    "Phase 1 - Core Infrastructure (Week 1)": [
        "Set up i18n framework",
        "Create base translation files (EN, ES, FR)",
        "Implement language detection",
        "Add language switcher to navbar"
    ],
    
    "Phase 2 - Authentication & Registration (Week 2)": [
        "Translate login/register forms",
        "Add language selection to registration",
        "Implement error message translations",
        "Multi-language email templates"
    ],
    
    "Phase 3 - Profile & Matching (Week 3-4)": [
        "Translate profile creation forms",
        "Implement language preference matching",
        "Multi-language interest categories",
        "Cultural preference options"
    ],
    
    "Phase 4 - Messaging & Chat (Week 5-6)": [
        "Multi-language chat interface",
        "Translation hints for messages",
        "Language learning features",
        "Cultural communication tips"
    ],
    
    "Phase 5 - Expansion (Week 7+)": [
        "Add remaining languages",
        "Regional customizations",
        "Cultural event suggestions",
        "Advanced language matching"
    ]
};

// Initialize i18n system
const totiloveI18n = new TotiloveI18n();

// Export for use throughout app
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { TotiloveI18n, IMPLEMENTATION_PHASES };
} else {
    window.TotiloveI18n = TotiloveI18n;
    window.i18n = totiloveI18n;
}
