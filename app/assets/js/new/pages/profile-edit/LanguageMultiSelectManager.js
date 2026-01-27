/**
 * LanguageMultiSelectManager - Manages languages using MultiSelectManager pattern
 * But retains the modal UI - clicking badges opens detail modal
 */

class LanguageMultiSelectManager {
    constructor(config) {
        this.config = {
            languagesData: config.languagesData || [],
            userLanguages: config.userLanguages || [],
            maxSelections: config.maxSelections || 10,
            selectId: config.selectId || 'languages-select',
            containerId: config.containerId || 'selected-languages',
            countSpanId: config.countSpanId || 'selected-languages-count',
            notificationFunction: null
        };
        
        this.languagesMap = new Map();
        this.init();
    }

    /**
     * Initialize the manager
     */
    init() {
        // Build languages map for quick lookup
        if (this.config.languagesData && this.config.languagesData.length > 0) {
            this.config.languagesData.forEach(lang => {
                this.languagesMap.set(lang.id, lang);
            });
        }
        
        // Set up inline language selection (similar to inline form)
        const select = document.getElementById(this.config.selectId);
        const selectLabel = document.getElementById('select-language-label');
        const inlineContainer = document.getElementById('inline-language-select-container');
        
        if (select && selectLabel && inlineContainer) {
            // Hide the select element
            select.style.display = 'none';
            
            // Show inline language list when clicking label
            selectLabel.addEventListener('click', () => {
                this.showInlineLanguageList(inlineContainer);
            });
        }
    }

    /**
     * Set the notification function
     */
    setNotificationFunction(fn) {
        this.config.notificationFunction = fn;
    }

    /**
     * Show a notification
     */
    showNotification(message, type = 'info') {
        if (this.config.notificationFunction) {
            this.config.notificationFunction(message, type);
        }
    }

    /**
     * Set languages data
     */
    setLanguagesData(languagesData) {
        this.config.languagesData = languagesData || [];
        this.languagesMap.clear();
        if (this.config.languagesData.length > 0) {
            this.config.languagesData.forEach(lang => {
                this.languagesMap.set(lang.id, lang);
            });
        }
    }

    /**
     * Set user languages
     */
    setUserLanguages(userLanguages) {
        this.config.userLanguages = userLanguages || [];
        // Reorder: primary language first
        this.reorderLanguages();
        this.updateDisplay();
        this.updateCount();
    }
    
    /**
     * Load items into the select dropdown
     */
    loadItems(items) {
        this.config.languagesData = items || [];
        this.languagesMap.clear();
        if (this.config.languagesData.length > 0) {
            this.config.languagesData.forEach(lang => {
                this.languagesMap.set(lang.id, lang);
            });
        }
        
        const select = document.getElementById(this.config.selectId);
        if (!select) return;
        
        // Clear existing options (keep first if it's a placeholder)
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            select.appendChild(firstOption);
        }
        
        this.config.languagesData.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id != null ? String(lang.id) : (lang.value || lang.name || '');
            
            // Get flag emoji for the language
            const isoCode = (lang.iso_code || '').toLowerCase().trim();
            const flagEmoji = this.getFlagEmoji(isoCode);
            
            // Format display text with native name if available
            let displayText = lang.name || lang.value || '';
            if (lang.native_name && lang.native_name !== lang.name) {
                displayText = `${lang.name} (${lang.native_name})`;
            }
            
            // Add flag emoji at the beginning (left side) - ensure emoji is set
            if (flagEmoji) {
                option.textContent = `${flagEmoji} ${displayText}`;
            } else {
                // If no emoji found, just show the language name (don't show country codes)
                option.textContent = displayText;
            }
            option.dataset.id = String(lang.id || '');
            option.dataset.isoCode = isoCode; // Store ISO code for debugging
            select.appendChild(option);
        });
    }
    
    /**
     * Update count display
     */
    updateCount() {
        const countSpan = document.getElementById(this.config.countSpanId);
        if (countSpan) {
            countSpan.textContent = this.config.userLanguages.length;
        }
    }

    /**
     * Add a language
     */
    addLanguage(languageId) {
        if (!languageId) return false;

        // Check if already selected
        if (this.config.userLanguages.find(ul => ul.language_id == languageId)) {
            this.showNotification('This language is already selected', 'info');
            return false;
        }

        // Check max selections
        if (this.config.userLanguages.length >= this.config.maxSelections) {
            this.showNotification(`Maximum ${this.config.maxSelections} languages can be selected`, 'error');
            return false;
        }

        // Add language (default to speaking skill enabled)
        this.config.userLanguages.push({
            id: null,
            language_id: languageId,
            fluency_level_id: '',
            is_primary: false,
            can_read: false,
            can_write: false,
            can_speak: true, // Default to speaking enabled
            can_understand: false
        });

        this.updateDisplay();
        
        // Save to database
        this.saveLanguagesToDatabase();
        
        return true;
    }

    /**
     * Remove a language
     */
    removeLanguage(languageId) {
        const languageIdNum = typeof languageId === 'string' ? parseInt(languageId) : languageId;
        const index = this.config.userLanguages.findIndex(ul => ul.language_id == languageIdNum);
        if (index !== -1) {
            this.config.userLanguages.splice(index, 1);
            this.updateDisplay();
            
            // Sync with LanguagesModalManager if it exists
            if (window.LanguagesModalManager) {
                window.LanguagesModalManager.userLanguages = this.config.userLanguages;
            }
            
            // Save to database
            this.saveLanguagesToDatabase();
            
            return true;
        }
        return false;
    }

    /**
     * Get flag emoji from language ISO code
     */
    getFlagEmoji(isoCode) {
        if (!isoCode) return '';
        
        // Map language ISO codes to flag emojis
        const languageFlags = {
            'en': '🇺🇸', 'es': '🇪🇸', 'fr': '🇫🇷', 'de': '🇩🇪', 'it': '🇮🇹', 'pt': '🇵🇹',
            'ru': '🇷🇺', 'zh': '🇨🇳', 'ja': '🇯🇵', 'ko': '🇰🇷', 'ar': '🇸🇦', 'hi': '🇮🇳',
            'vi': '🇻🇳', 'th': '🇹🇭', 'tr': '🇹🇷', 'pl': '🇵🇱', 'nl': '🇳🇱', 'sv': '🇸🇪',
            'no': '🇳🇴', 'da': '🇩🇰', 'fi': '🇫🇮', 'el': '🇬🇷', 'he': '🇮🇱', 'cs': '🇨🇿',
            'hu': '🇭🇺', 'ro': '🇷🇴', 'bg': '🇧🇬', 'hr': '🇭🇷', 'sk': '🇸🇰', 'sl': '🇸🇮',
            'uk': '🇺🇦', 'bn': '🇧🇩', 'ur': '🇵🇰', 'fa': '🇮🇷', 'id': '🇮🇩', 'ms': '🇲🇾',
            'tl': '🇵🇭', 'sw': '🇰🇪', 'af': '🇿🇦', 'ca': '🇪🇸', 'eu': '🇪🇸', 'ga': '🇮🇪',
            'cy': '🇬🇧', 'mt': '🇲🇹', 'is': '🇮🇸', 'lv': '🇱🇻', 'lt': '🇱🇹', 'et': '🇪🇪',
            'mk': '🇲🇰', 'sq': '🇦🇱', 'sr': '🇷🇸', 'bs': '🇧🇦', 'me': '🇲🇪', 'ka': '🇬🇪',
            'hy': '🇦🇲', 'az': '🇦🇿', 'kk': '🇰🇿', 'uz': '🇺🇿', 'mn': '🇲🇳', 'my': '🇲🇲',
            'km': '🇰🇭', 'lo': '🇱🇦', 'ne': '🇳🇵', 'si': '🇱🇰', 'ta': '🇮🇳', 'te': '🇮🇳',
            'ml': '🇮🇳', 'kn': '🇮🇳', 'gu': '🇮🇳', 'pa': '🇮🇳', 'mr': '🇮🇳', 'or': '🇮🇳',
            'as': '🇮🇳', 'am': '🇪🇹', 'yo': '🇳🇬', 'ig': '🇳🇬', 'ha': '🇳🇬', 'zu': '🇿🇦',
            'xh': '🇿🇦', 'eo': '🌍', 'la': '🇻🇦', 'co': '🇫🇷', 'gd': '🇬🇧', 'br': '🇫🇷',
            'fy': '🇳🇱', 'lb': '🇱🇺', 'rm': '🇨🇭', 'gv': '🇮🇲', 'kw': '🇬🇧'
        };
        
        return languageFlags[isoCode.toLowerCase()] || '';
    }

    /**
     * Get flag image URL for a language ISO code
     */
    getFlagImageUrl(isoCode) {
        if (!isoCode) return null;
        
        // Map language ISO codes to country ISO codes for flag images
        const languageToCountry = {
            'en': 'us', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
            'ru': 'ru', 'zh': 'cn', 'ja': 'jp', 'ko': 'kr', 'ar': 'sa', 'hi': 'in',
            'vi': 'vn', 'th': 'th', 'tr': 'tr', 'pl': 'pl', 'nl': 'nl', 'sv': 'se',
            'no': 'no', 'da': 'dk', 'fi': 'fi', 'el': 'gr', 'he': 'il', 'cs': 'cz',
            'hu': 'hu', 'ro': 'ro', 'bg': 'bg', 'hr': 'hr', 'sk': 'sk', 'sl': 'si',
            'uk': 'ua', 'bn': 'bd', 'ur': 'pk', 'fa': 'ir', 'id': 'id', 'ms': 'my',
            'tl': 'ph', 'sw': 'ke', 'af': 'za', 'ca': 'es', 'eu': 'es', 'ga': 'ie',
            'cy': 'gb', 'mt': 'mt', 'is': 'is', 'lv': 'lv', 'lt': 'lt', 'et': 'ee',
            'mk': 'mk', 'sq': 'al', 'sr': 'rs', 'bs': 'ba', 'me': 'me', 'ka': 'ge',
            'hy': 'am', 'az': 'az', 'kk': 'kz', 'uz': 'uz', 'mn': 'mn', 'my': 'mm',
            'km': 'kh', 'lo': 'la', 'ne': 'np', 'si': 'lk', 'ta': 'in', 'te': 'in',
            'ml': 'in', 'kn': 'in', 'gu': 'in', 'pa': 'in', 'mr': 'in', 'or': 'in',
            'as': 'in', 'am': 'et', 'yo': 'ng', 'ig': 'ng', 'ha': 'ng', 'zu': 'za',
            'xh': 'za', 'eo': null, 'la': 'va', 'co': 'fr', 'gd': 'gb', 'br': 'fr',
            'fy': 'nl', 'lb': 'lu', 'rm': 'ch', 'gv': 'im', 'kw': 'gb'
        };
        
        const countryCode = languageToCountry[isoCode.toLowerCase()];
        if (!countryCode) return null;
        return `/assets/images/flags/${countryCode}.png`;
    }

    /**
     * Map language ISO codes to country codes for CSS flag classes
     */
    getCountryCode(isoCode) {
        const languageToCountry = {
            'en': 'us', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
            'ru': 'ru', 'zh': 'cn', 'ja': 'jp', 'ko': 'kr', 'ar': 'sa', 'hi': 'in',
            'vi': 'vn', 'th': 'th', 'tr': 'tr', 'pl': 'pl', 'nl': 'nl', 'sv': 'se',
            'no': 'no', 'da': 'dk', 'fi': 'fi', 'el': 'gr', 'he': 'il', 'cs': 'cz',
            'hu': 'hu', 'ro': 'ro', 'bg': 'bg', 'hr': 'hr', 'sk': 'sk', 'sl': 'si',
            'uk': 'ua', 'bn': 'bd', 'ur': 'pk', 'fa': 'ir', 'id': 'id', 'ms': 'my',
            'tl': 'ph', 'sw': 'ke', 'af': 'za', 'ca': 'es', 'eu': 'es', 'ga': 'ie',
            'cy': 'gb', 'mt': 'mt', 'is': 'is', 'lv': 'lv', 'lt': 'lt', 'et': 'ee',
            'mk': 'mk', 'sq': 'al', 'sr': 'rs', 'bs': 'ba', 'me': 'me', 'ka': 'ge',
            'hy': 'am', 'az': 'az', 'kk': 'kz', 'uz': 'uz', 'mn': 'mn', 'my': 'mm',
            'km': 'kh', 'lo': 'la', 'ne': 'np', 'si': 'lk', 'ta': 'in', 'te': 'in',
            'ml': 'in', 'kn': 'in', 'gu': 'in', 'pa': 'in', 'mr': 'in', 'or': 'in',
            'as': 'in', 'am': 'et', 'yo': 'ng', 'ig': 'ng', 'ha': 'ng', 'zu': 'za',
            'xh': 'za', 'eo': null, 'la': 'va', 'co': 'fr', 'gd': 'gb', 'br': 'fr',
            'fy': 'nl', 'lb': 'lu', 'rm': 'ch', 'gv': 'im', 'kw': 'gb'
        };
        return languageToCountry[isoCode.toLowerCase()] || isoCode.toLowerCase();
    }

    /**
     * Get language CSS class for flags
     */
    getLanguageCssClass(isoCode) {
        const languageToCssClass = {
            'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
            'ru': 'ru', 'zh': 'zh', 'ja': 'ja', 'ko': 'ko', 'ar': 'ar', 'hi': 'hi', 'uk': 'ua'
        };
        const countryCode = this.getCountryCode(isoCode);
        return languageToCssClass[isoCode.toLowerCase()] || isoCode.toLowerCase() || countryCode;
    }

    /**
     * Generate flag icon HTML (reusable method to avoid duplication)
     * @param {string} isoCode - Language ISO code
     * @param {boolean} withMargin - Whether to add margin-right
     * @returns {string} Flag icon HTML
     */
    generateFlagIconHtml(isoCode, withMargin = false) {
        const flagImageUrl = this.getFlagImageUrl(isoCode);
        const languageCodeForCss = this.getLanguageCssClass(isoCode);
        const marginStyle = withMargin ? 'margin-right: 0.5rem;' : '';
        
        if (flagImageUrl) {
            return `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="background-image: url('${flagImageUrl}'); background-size: 24px 18px; background-position: center; background-repeat: no-repeat; width: 24px; height: 18px; display: inline-block; border-radius: 3px; flex-shrink: 0; background-color: #e1e5e9; ${marginStyle}"></span>`;
        } else {
            return `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="width: 24px; height: 18px; display: inline-block; border-radius: 3px; flex-shrink: 0; background-color: #e1e5e9; ${marginStyle}"></span>`;
        }
    }

    /**
     * Reorder languages: primary language first, then others
     */
    reorderLanguages() {
        // Sort: primary languages first, then others
        this.config.userLanguages.sort((a, b) => {
            if (a.is_primary && !b.is_primary) return -1;
            if (!a.is_primary && b.is_primary) return 1;
            return 0; // Keep original order for non-primary languages
        });
    }

    /**
     * Update the display of selected languages
     */
    updateDisplay() {
        const container = document.getElementById(this.config.containerId);
        if (!container) return;

        container.innerHTML = '';

        if (this.config.userLanguages.length === 0) {
            this.updateCount();
            return; // Don't show "No languages" message, just empty
        }

        // Ensure primary language is first before displaying
        this.reorderLanguages();

        this.config.userLanguages.forEach((userLang, index) => {
            const language = this.languagesMap.get(userLang.language_id);
            if (!language) return;

            const languageName = language.name || 'Unknown';
            const isoCode = language.iso_code || '';
            const isPrimary = userLang.is_primary ? ' <span class="primary-badge">Primary</span>' : '';

            // Create flag icon using helper method
            const flagIconHtml = this.generateFlagIconHtml(isoCode);

            // Create badge with click handler to open detail modal and remove button
            const badge = document.createElement('span');
            badge.style.cssText = 'background: #f5f5f5; color: #333; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; border: 1px solid #e1e5e9; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); cursor: pointer; transition: all 0.3s ease;';
            badge.className = 'language-badge';
            badge.dataset.languageIndex = index;
            badge.dataset.languageId = userLang.language_id;
            badge.dataset.isoCode = isoCode.toLowerCase();
            
            const removeValue = userLang.language_id;
            const escapedValue = String(removeValue).replace(/'/g, "\\'");
            
            badge.innerHTML = `
                <span class="language-content" style="display: flex; align-items: center; gap: 0.5rem;">
                    ${flagIconHtml}
                    <span class="language-name">${languageName}</span>${isPrimary}
                </span>
                <span style="cursor: pointer; font-weight: bold; margin-left: 0.5rem; color: #dc3545; font-size: 1.2rem;" onclick="event.stopPropagation(); window.removeLanguage('${escapedValue}')">×</span>
            `;

            // Add click handler to show inline form (but not when clicking remove button)
            badge.addEventListener('click', (e) => {
                if (!e.target.closest('span[onclick]')) {
                    this.showInlineLanguageForm(userLang, index, badge);
                }
            });

            container.appendChild(badge);
        });
        
        this.updateCount();
    }

    /**
     * Show inline language detail form instead of modal
     */
    showInlineLanguageForm(userLanguage, languageIndex, badge) {
        // Remove any existing inline form
        const existingForm = document.querySelector('.inline-language-form');
        if (existingForm) {
            existingForm.remove();
        }
        
        const language = this.languagesMap.get(userLanguage.language_id);
        if (!language) return;
        
        // Create inline form container
        const formContainer = document.createElement('div');
        formContainer.className = 'inline-language-form';
        formContainer.style.cssText = 'background: white; border: 1px solid #ddd; border-radius: 8px; padding: 1.5rem; margin-top: 0.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
        formContainer.dataset.languageIndex = languageIndex;
        formContainer.dataset.languageId = userLanguage.language_id;
        
        // Get language name
        const langName = language.name || 'Unknown';
        const isoCode = language.iso_code || '';
        
        // Create flag icon using helper method (with margin for form header)
        const flagIconHtml = this.generateFlagIconHtml(isoCode, true);
        
        // Create form HTML
        formContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding: 1rem 1.5rem; margin: -1.5rem -1.5rem 1rem -1.5rem; background: #f5f5f5; border-radius: 8px 8px 0 0; border-bottom: 1px solid #e1e5e9;">
                <h4 style="margin: 0; font-size: 1.1rem; color: #333; display: flex; align-items: center; font-weight: 600;">${flagIconHtml}${langName} Details</h4>
                <button type="button" class="close-inline-form" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; transition: opacity 0.3s ease;">×</button>
            </div>
            <form class="language-detail-inline-form">
                <input type="hidden" class="detail-language-id" value="${userLanguage.language_id}">
                <input type="hidden" class="detail-language-index" value="${languageIndex}">
                
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #555;">Fluency Level:</label>
                    <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
                        <select class="detail-fluency-level" style="flex: 1; max-width: 250px; padding: 0.5rem; border: 1px solid #ddd; border-radius: 6px;">
                            <option value="">Select fluency level (optional)</option>
                        </select>
                        <label style="display: flex; align-items: center; gap: 0.5rem; margin: 0; white-space: nowrap; cursor: pointer;">
                            <input type="checkbox" class="detail-is-primary" ${userLanguage.is_primary ? 'checked' : ''}>
                            Set as Primary Language
                        </label>
                    </div>
                </div>
                
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display: block; margin-bottom: 0.5rem; font-weight: 600; color: #555;">Skills: * <span style="font-weight: normal; color: #666; font-size: 0.9rem;">(Select at least one)</span></label>
                    <div style="display: flex; gap: 1.5rem; flex-wrap: wrap;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" class="detail-can-read" data-skill="read" ${userLanguage.can_read ? 'checked' : ''}>
                            <span>Reading</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" class="detail-can-write" data-skill="write" ${userLanguage.can_write ? 'checked' : ''}>
                            <span>Writing</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" class="detail-can-speak" data-skill="speak" ${userLanguage.can_speak ? 'checked' : ''}>
                            <span>Speaking</span>
                        </label>
                        <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                            <input type="checkbox" class="detail-can-understand" data-skill="understand" ${userLanguage.can_understand ? 'checked' : ''}>
                            <span>Understanding</span>
                        </label>
                    </div>
                </div>
                
                <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1.5rem; padding-top: 1rem; border-top: 1px solid #eee;">
                    <button type="button" class="cancel-inline-form" style="padding: 0.5rem 1rem; border: 1px solid #ddd; border-radius: 6px; background: white; cursor: pointer; color: #333;">Cancel</button>
                    <button type="button" class="save-inline-form" style="padding: 0.5rem 1rem; border: none; border-radius: 6px; background: #667eea; color: white; cursor: pointer;">Save Details</button>
                </div>
            </form>
        `;
        
        // Insert form after badge
        badge.parentNode.insertBefore(formContainer, badge.nextSibling);
        
        // Load fluency levels
        this.loadFluencyLevels(formContainer);
        
        // Set current values
        const fluencySelect = formContainer.querySelector('.detail-fluency-level');
        if (fluencySelect && userLanguage.fluency_level_id) {
            fluencySelect.value = userLanguage.fluency_level_id;
        }
        
        // Close button handler
        formContainer.querySelector('.close-inline-form').addEventListener('click', () => {
            formContainer.remove();
        });
        
        // Cancel button handler
        formContainer.querySelector('.cancel-inline-form').addEventListener('click', () => {
            formContainer.remove();
        });
        
        // Save button handler
        formContainer.querySelector('.save-inline-form').addEventListener('click', async () => {
            const saveBtn = formContainer.querySelector('.save-inline-form');
            const originalText = saveBtn.textContent;
            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';
            try {
                await this.saveInlineLanguageForm(formContainer, languageIndex);
            } catch (error) {
                console.error('Error saving language form:', error);
            } finally {
                saveBtn.disabled = false;
                saveBtn.textContent = originalText;
            }
        });
        
        // Close when clicking outside the form
        const outsideClickHandler = (e) => {
            // Don't close if clicking on the badge that opened it or inside the form
            if (!formContainer.contains(e.target) && !badge.contains(e.target)) {
                formContainer.remove();
                document.removeEventListener('click', outsideClickHandler);
            }
        };
        
        // Add the event listener after a small delay to avoid immediate closure
        setTimeout(() => {
            document.addEventListener('click', outsideClickHandler);
        }, 100);
    }
    
    /**
     * Load fluency levels into select
     */
    loadFluencyLevels(formContainer) {
        const select = formContainer.querySelector('.detail-fluency-level');
        if (!select) return;
        
        // Get fluency levels from LanguagesModalManager if available
        if (window.LanguagesModalManager && 
            window.LanguagesModalManager.languagesData && 
            window.LanguagesModalManager.languagesData.fluencyLevels && 
            window.LanguagesModalManager.languagesData.fluencyLevels.length > 0) {
            
            window.LanguagesModalManager.languagesData.fluencyLevels.forEach(level => {
                const option = document.createElement('option');
                option.value = level.id;
                option.textContent = level.name;
                select.appendChild(option);
            });
        } else {
            // Try to get from profile-edit-init if LanguagesModalManager not ready
            // Wait a bit and try again
            setTimeout(() => {
                if (window.LanguagesModalManager && 
                    window.LanguagesModalManager.languagesData && 
                    window.LanguagesModalManager.languagesData.fluencyLevels) {
                    const select = formContainer.querySelector('.detail-fluency-level');
                    if (select && select.options.length === 1) { // Only placeholder
                        window.LanguagesModalManager.languagesData.fluencyLevels.forEach(level => {
                            const option = document.createElement('option');
                            option.value = level.id;
                            option.textContent = level.name;
                            select.appendChild(option);
                        });
                    }
                }
            }, 500);
        }
    }
    
    /**
     * Save inline language form
     */
    async saveInlineLanguageForm(formContainer, languageIndex) {
        const fluencySelect = formContainer.querySelector('.detail-fluency-level');
        const isPrimary = formContainer.querySelector('.detail-is-primary').checked;
        const canRead = formContainer.querySelector('.detail-can-read').checked;
        const canWrite = formContainer.querySelector('.detail-can-write').checked;
        const canSpeak = formContainer.querySelector('.detail-can-speak').checked;
        const canUnderstand = formContainer.querySelector('.detail-can-understand').checked;
        
        // Validate at least one skill is selected
        if (!canRead && !canWrite && !canSpeak && !canUnderstand) {
            if (this.config.notificationFunction) {
                this.config.notificationFunction('Please select at least one skill', 'error');
            }
            return;
        }
        
        // Update user language
        if (this.config.userLanguages[languageIndex]) {
            // Convert empty string to null for fluency_level_id
            const fluencyLevelId = fluencySelect.value && fluencySelect.value.trim() !== '' 
                ? fluencySelect.value 
                : null;
            
            this.config.userLanguages[languageIndex].fluency_level_id = fluencyLevelId;
            this.config.userLanguages[languageIndex].is_primary = isPrimary;
            this.config.userLanguages[languageIndex].can_read = canRead;
            this.config.userLanguages[languageIndex].can_write = canWrite;
            this.config.userLanguages[languageIndex].can_speak = canSpeak;
            this.config.userLanguages[languageIndex].can_understand = canUnderstand;
            
            // If set as primary, unset others and reorder
            if (isPrimary) {
                this.config.userLanguages.forEach((ul, idx) => {
                    if (idx !== languageIndex) {
                        ul.is_primary = false;
                    }
                });
                // Reorder: primary language first
                this.reorderLanguages();
            }
            
            // Update display
            this.updateDisplay();
            
            // Sync with LanguagesModalManager if it exists
            if (window.LanguagesModalManager) {
                window.LanguagesModalManager.userLanguages = this.config.userLanguages;
            }
            
            // Save to database (await to ensure it completes)
            const saveSuccess = await this.saveLanguagesToDatabase();
            
            // Only remove form if save was successful
            if (saveSuccess !== false) {
                formContainer.remove();
            }
        } else {
            // Remove form even if language index not found
            formContainer.remove();
        }
    }
    
    /**
     * Save languages to database via API
     * @returns {Promise<boolean>} Returns true if successful, false if failed
     */
    async saveLanguagesToDatabase() {
        try {
            // Get userId
            const userId = document.querySelector('input[name="userId"]')?.value;
            if (!userId) {
                console.error('User ID not found');
                if (this.config.notificationFunction) {
                    this.config.notificationFunction('User ID not found', 'error');
                }
                return false;
            }
            
            // Prepare languages data for API
            const languages = this.config.userLanguages.map(ul => ({
                id: ul.id || null,
                language_id: parseInt(ul.language_id),
                fluency_level_id: (ul.fluency_level_id && ul.fluency_level_id !== '' && ul.fluency_level_id !== 'null') 
                    ? parseInt(ul.fluency_level_id) 
                    : null,
                is_primary: ul.is_primary || false,
                can_read: ul.can_read || false,
                can_write: ul.can_write || false,
                can_speak: ul.can_speak || false,
                can_understand: ul.can_understand || false
            }));
            
            // Get session token (check cookies first, then URL, then localStorage)
            function getSessionToken() {
                // Try cookie first (where CSRF stores it)
                const cookies = document.cookie.split(';');
                for (let cookie of cookies) {
                    const trimmed = cookie.trim();
                    const equalIndex = trimmed.indexOf('=');
                    if (equalIndex === -1) continue;

                    const name = trimmed.substring(0, equalIndex).trim();
                    const value = trimmed.substring(equalIndex + 1).trim();

                    if (name === 'sessionToken' || name === 'session') {
                        return decodeURIComponent(value);
                    }
                }

                // Fallback to URL
                const urlParams = new URLSearchParams(window.location.search);
                const urlToken = urlParams.get('token');
                if (urlToken) {
                    return urlToken;
                }

                return null;
            }
            
            const sessionToken = getSessionToken();
            
            // Build headers (conditionally include token if found)
            const headers = {
                'Content-Type': 'application/json'
            };
            
            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`;
                headers['X-Session-Token'] = sessionToken;
            }
            
            // Send update request (with credentials to send cookies)
            const response = await fetch('/api/profile/languages', {
                method: 'POST',
                headers: headers,
                credentials: 'same-origin',
                body: JSON.stringify({ userId, languages })
            });
            
            if (!response.ok) {
                const errorText = await response.text().catch(() => null);
                throw new Error(errorText || `Server returned ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Show success message
                if (this.config.notificationFunction) {
                    this.config.notificationFunction('Language details saved successfully', 'success');
                }
                return true;
            } else {
                throw new Error(result.error || 'Failed to save languages');
            }
        } catch (error) {
            if (this.config.notificationFunction) {
                this.config.notificationFunction('Failed to save languages: ' + (error.message || error), 'error');
            }
            return false;
        }
    }
    
    /**
     * Open language detail modal (kept for compatibility)
     */
    openLanguageDetailModal(userLanguage, languageIndex) {
        // Find the badge and show inline form instead
        const badges = document.querySelectorAll('.language-badge');
        badges.forEach(badge => {
            if (parseInt(badge.dataset.languageIndex) === languageIndex) {
                this.showInlineLanguageForm(userLanguage, languageIndex, badge);
            }
        });
    }

    /**
     * Get selected languages
     */
    getSelectedLanguages() {
        return this.config.userLanguages;
    }

    /**
     * Create custom dropdown following the example pattern
     */
    createCustomDropdown(select) {
        // Create wrapper
        const wrapper = document.createElement('div');
        wrapper.className = 'language-dropdown';
        wrapper.style.cssText = 'position: relative; width: auto; max-width: 200px; min-width: 150px;';
        select.parentNode.replaceChild(wrapper, select);
        wrapper.appendChild(select);
        
        // Hide native select
        select.style.cssText = 'position: absolute; opacity: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none;';
        
        // Create button (selected country style)
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'selected-language';
        button.style.cssText = 'width: 100%; padding: 12px 14px; border-radius: 10px; border: 1px solid #ccc; background: #fff; cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 15px; box-shadow: 0 3px 10px rgba(0,0,0,0.08); box-sizing: border-box;';
        button.innerHTML = '<span class="flag-span"></span><span class="text-span">Select a language...</span><span style="margin-left: auto; font-size: 14px; color: #666;">▾</span>';
        wrapper.appendChild(button);
        
        // Create dropdown list
        const list = document.createElement('ul');
        list.className = 'language-list';
        list.style.cssText = 'display: none; position: absolute; top: 110%; left: 0; width: 100%; background: #fff; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); list-style: none; padding: 6px 0; margin: 0; z-index: 1000; max-height: 360px; overflow-y: auto;';
        wrapper.appendChild(list);
        
        // Store references
        this.customButton = button;
        this.customList = list;
        this.customWrapper = wrapper;
        
        // Update button display
        this.updateCustomButton = () => {
            const opt = select.options[select.selectedIndex];
            const flagSpan = button.querySelector('.flag-span');
            const textSpan = button.querySelector('.text-span');
            
            if (opt && opt.value) {
                const lang = this.languagesMap.get(parseInt(opt.value));
                if (lang) {
                    const flagUrl = this.getFlagImageUrl(lang.iso_code);
                    if (flagUrl) {
                        flagSpan.style.cssText = 'width: 22px; height: 16px; border-radius: 3px; background-image: url(\'' + flagUrl + '\'); background-size: 22px 16px; background-position: center; background-repeat: no-repeat; display: inline-block;';
                    } else {
                        flagSpan.style.cssText = '';
                    }
                    textSpan.textContent = lang.native_name && lang.native_name !== lang.name ? `${lang.name} (${lang.native_name})` : lang.name;
                } else {
                    flagSpan.style.cssText = '';
                    textSpan.textContent = opt.textContent;
                }
            } else {
                flagSpan.style.cssText = '';
                textSpan.textContent = 'Select a language...';
            }
        };
        
        // Populate list - show ALL languages from languagesData
        const populateList = () => {
            list.innerHTML = '';
            
            // Use languagesData directly to ensure all languages are shown
            const languagesToShow = this.config.languagesData || [];
            
            languagesToShow.forEach(lang => {
                if (!lang || !lang.id) return;
                
                const li = document.createElement('li');
                li.dataset.value = lang.id;
                li.style.cssText = 'padding: 10px 14px; cursor: pointer; display: flex; align-items: center; gap: 12px; font-size: 14px;';
                
                const flagUrl = this.getFlagImageUrl(lang.iso_code);
                const flagHtml = flagUrl ? 
                    '<span style="width: 22px; height: 16px; border-radius: 3px; background-image: url(\'' + flagUrl + '\'); background-size: 22px 16px; background-position: center; background-repeat: no-repeat; display: inline-block;"></span>' : 
                    '';
                
                const displayText = lang.native_name && lang.native_name !== lang.name ? 
                    `${lang.name} (${lang.native_name})` : lang.name;
                
                li.innerHTML = flagHtml + ' ' + displayText;
                
                li.addEventListener('mouseenter', () => li.style.background = '#f1f3f7');
                li.addEventListener('mouseleave', () => li.style.background = 'transparent');
                li.addEventListener('click', (e) => {
                    e.stopPropagation();
                    select.value = lang.id;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    list.classList.remove('show');
                });
                
                list.appendChild(li);
            });
        };
        
        // Toggle dropdown
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            if (list.classList.contains('show')) {
                list.classList.remove('show');
            } else {
                populateList();
                list.classList.add('show');
            }
        });
        
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                list.classList.remove('show');
            }
        });
        
        // Update on select change
        select.addEventListener('change', () => {
            if (this.updateCustomButton) {
                this.updateCustomButton();
            }
        });
    }

    /**
     * Show inline language selection list (just flags like badges)
     */
    showInlineLanguageList(container, forceOpen = false) {
        // Toggle: if container is visible and not forcing open, hide it
        if (!forceOpen && (container.style.display === 'block' || container.style.display === '')) {
            container.style.display = 'none';
            return;
        }
        
        // Remove any existing inline list from other containers
        const existingList = document.querySelector('.inline-language-select-list');
        if (existingList && existingList.parentElement !== container) {
            existingList.remove();
        }
        
        // Create inline language list container
        const listContainer = document.createElement('div');
        listContainer.className = 'inline-language-select-list';
        listContainer.style.cssText = 'background: white; border: 1px solid #ddd; border-radius: 8px; padding: 1rem; margin-top: 0.5rem; box-shadow: 0 2px 8px rgba(0,0,0,0.1);';
        
        // Header
        listContainer.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; padding: 1rem; margin: -1rem -1rem 1rem -1rem; background: #f5f5f5; border-radius: 8px 8px 0 0; border-bottom: 1px solid #e1e5e9;">
                <h4 style="margin: 0; font-size: 1rem; color: #333; font-weight: 600;">Select Language</h4>
                <button type="button" class="close-inline-language-list" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; color: #666; padding: 0; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center;">×</button>
            </div>
            <div class="language-flags-list" style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <!-- Language flags will be populated here -->
            </div>
        `;
        
        const flagsContainer = listContainer.querySelector('.language-flags-list');
        const languagesToShow = this.config.languagesData || [];
        
        // Populate languages as flags only (like badges)
        languagesToShow.forEach(lang => {
            if (!lang || !lang.id) return;
            
            const isSelected = this.config.userLanguages.some(ul => ul.language_id === lang.id);
            
            const flagBadge = document.createElement('span');
            flagBadge.className = 'language-flag-select';
            flagBadge.style.cssText = 'background: #f5f5f5; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; display: flex; align-items: center; gap: 0.5rem; border: 1px solid #e1e5e9; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); cursor: pointer; transition: all 0.3s ease;';
            flagBadge.dataset.languageId = lang.id;
            
            // Set selected/unselected colors - green for selected
            if (isSelected) {
                flagBadge.style.borderColor = '#28a745';
                flagBadge.style.background = '#d4edda';
                flagBadge.style.boxShadow = '0 2px 6px rgba(40, 167, 69, 0.3)';
            }
            
            const languageName = lang.name || 'Unknown';
            const isoCode = lang.iso_code || '';
            
            // Create flag icon using helper method
            const flagIconHtml = this.generateFlagIconHtml(isoCode);
            
            flagBadge.innerHTML = `
                <span class="language-content" style="display: flex; align-items: center; gap: 0.5rem;">
                    ${flagIconHtml}
                    <span class="language-name">${languageName}</span>
                </span>
            `;
            
            // Click handler to toggle selection
            flagBadge.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                if (isSelected) {
                    this.removeLanguage(lang.id);
                } else {
                    if (this.config.userLanguages.length >= this.config.maxSelections) {
                        if (this.config.notificationFunction) {
                            this.config.notificationFunction(`Maximum ${this.config.maxSelections} languages can be selected`, 'error');
                        }
                        return;
                    }
                    this.addLanguage(lang.id);
                }
                // Update display without closing (forceOpen = true)
                this.showInlineLanguageList(container, true);
            });
            
            flagsContainer.appendChild(flagBadge);
        });
        
        container.innerHTML = '';
        container.appendChild(listContainer);
        container.style.display = 'block';
        
        // Close button handler
        listContainer.querySelector('.close-inline-language-list').addEventListener('click', () => {
            container.style.display = 'none';
        });
        
        // Close when clicking outside the container
        const outsideClickHandler = (e) => {
            const selectLabel = document.getElementById('select-language-label');
            // Don't close if clicking on the button or inside the container
            if (!container.contains(e.target) && e.target !== selectLabel && !selectLabel.contains(e.target)) {
                container.style.display = 'none';
                document.removeEventListener('click', outsideClickHandler);
            }
        };
        
        // Add the event listener after a small delay to avoid immediate closure
        setTimeout(() => {
            document.addEventListener('click', outsideClickHandler);
        }, 100);
    }

    /**
     * Clear all selections
     */
    clear() {
        this.config.userLanguages = [];
        this.updateDisplay();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LanguageMultiSelectManager;
} else {
    window.LanguageMultiSelectManager = LanguageMultiSelectManager;
}
