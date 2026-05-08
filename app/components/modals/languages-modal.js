// Languages Modal JavaScript
(function() {
    'use strict';
    
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    function init() {
        // Only initialize if modals exist on the page
        const languagesModal = document.getElementById('languages-modal');
        const languageDetailModal = document.getElementById('language-detail-modal');
        
        if (!languagesModal || !languageDetailModal) {
            return; // Modals not on this page
        }
        
        // These will be set by the parent page
        if (window.LanguagesModalManager) {
            window.LanguagesModalManager.init();
        }
    }
    
    // Languages Modal Manager - to be initialized from profile-edit.html
    window.LanguagesModalManager = {
        languagesData: { languages: [], fluencyLevels: [] },
        userLanguages: [],
        currentEditingLanguageIndex: -1,
        
        init: function() {
            const self = this;
            
            // Get modal elements
            self.languagesModal = document.getElementById('languages-modal');
            self.languageDetailModal = document.getElementById('language-detail-modal');
            self.manageLanguagesBtn = document.getElementById('manage-languages-btn');
            self.closeLanguagesModal = document.getElementById('close-languages-modal');
            self.saveLanguagesBtn = document.getElementById('save-languages-btn');
            self.cancelLanguagesBtn = document.getElementById('cancel-languages-btn');
            self.closeLanguageDetailModal = document.getElementById('close-language-detail-modal');
            self.saveLanguageDetailBtn = document.getElementById('save-language-detail-btn');
            self.cancelLanguageDetailBtn = document.getElementById('cancel-language-detail-btn');
            self.languageDetailTitle = document.getElementById('language-detail-title');
            self.unselectAllLanguagesBtn = document.getElementById('unselect-all-languages-btn');
            
            if (!self.languagesModal || !self.languageDetailModal) {
                console.warn('Language modals not found on page');
                return;
            }
            
            // Event handlers
            if (self.manageLanguagesBtn) {
                self.manageLanguagesBtn.addEventListener('click', () => self.openLanguagesModal());
            }
            if (self.closeLanguagesModal) {
                self.closeLanguagesModal.addEventListener('click', () => self.closeLanguagesModalFunc());
            }
            if (self.cancelLanguagesBtn) {
                self.cancelLanguagesBtn.addEventListener('click', () => self.closeLanguagesModalFunc());
            }
            if (self.closeLanguageDetailModal) {
                self.closeLanguageDetailModal.addEventListener('click', () => self.closeLanguageDetailModalFunc());
            }
            if (self.cancelLanguageDetailBtn) {
                self.cancelLanguageDetailBtn.addEventListener('click', () => self.closeLanguageDetailModalFunc());
            }
            if (self.saveLanguagesBtn) {
                self.saveLanguagesBtn.addEventListener('click', () => self.saveLanguages());
            }
            if (self.saveLanguageDetailBtn) {
                self.saveLanguageDetailBtn.addEventListener('click', () => self.saveLanguageDetail());
            }
            if (self.unselectAllLanguagesBtn) {
                self.unselectAllLanguagesBtn.addEventListener('click', () => self.unselectAllLanguages());
            }
            
            // Close modals on outside click
            self.languagesModal.addEventListener('click', function(e) {
                if (e.target === self.languagesModal) {
                    self.closeLanguagesModalFunc();
                }
            });
            
            self.languageDetailModal.addEventListener('click', function(e) {
                if (e.target === self.languageDetailModal) {
                    self.closeLanguageDetailModalFunc();
                }
            });
        },
        
        // Load user's current languages (optimized)
        loadUserLanguages: async function() {
            const self = this;
            try {
                // Get session token from multiple sources (URL, cookies, hidden input)
                function getSessionToken() {
                    // Try URL first
                    const urlParams = new URLSearchParams(window.location.search);
                    let sessionToken = urlParams.get('token');
                    
                    // If not in URL, try cookies
                    if (!sessionToken) {
                        const cookies = document.cookie.split(';');
                        for (let cookie of cookies) {
                            const trimmed = cookie.trim();
                            const equalIndex = trimmed.indexOf('=');
                            if (equalIndex === -1) continue;

                            const name = trimmed.substring(0, equalIndex).trim();
                            const value = trimmed.substring(equalIndex + 1).trim();

                            if (name === 'sessionToken' || name === 'session') {
                                sessionToken = decodeURIComponent(value);
                                break;
                            }
                        }
                    }
                    
                    // Try hidden input as fallback
                    if (!sessionToken) {
                        const hiddenTokenInput = document.querySelector('input[name="sessionToken"]');
                        if (hiddenTokenInput && hiddenTokenInput.value) {
                            sessionToken = hiddenTokenInput.value;
                        }
                    }
                    
                    return sessionToken;
                }
                
                const sessionToken = getSessionToken();
                const userId = document.querySelector('input[name="userId"]')?.value;
                
                if (!userId) return;
                
                // Use Promise.race to add timeout protection
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 10000)
                );
                
                // Try using sessionManager.apiRequest if available, otherwise use fetch
                let response;
                if (window.sessionManager && typeof window.sessionManager.apiRequest === 'function') {
                    response = await Promise.race([
                        window.sessionManager.apiRequest(`/api/profile/languages?userId=${userId}`, {
                            method: 'GET'
                        }),
                        timeoutPromise
                    ]);
                } else {
                    // Fallback to direct fetch with credentials
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    
                    if (sessionToken) {
                        headers['Authorization'] = `Bearer ${sessionToken}`;
                        headers['X-Session-Token'] = sessionToken;
                    }
                    
                    response = await Promise.race([
                        fetch(`/api/profile/languages?userId=${userId}`, {
                            method: 'GET',
                            headers: headers,
                            credentials: 'same-origin'
                        }),
                        timeoutPromise
                    ]);
                }
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.languages) {
                        self.userLanguages = result.languages;
                        self.updateCurrentLanguagesDisplay();
                    }
                }
            } catch (error) {
                console.error('Failed to load user languages:', error);
                // Don't block UI if languages fail to load
            }
        },
        
        // Update current languages display (optimized)
        updateCurrentLanguagesDisplay: function() {
            const self = this;
            const currentLanguagesDisplay = document.getElementById('current-languages-display');
            if (!currentLanguagesDisplay) return;
            
            if (self.userLanguages.length === 0) {
                currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">No languages added</span>';
                return;
            }
            
            // Create a Map for faster language lookup
            const languagesMap = new Map();
            if (self.languagesData.languages) {
                self.languagesData.languages.forEach(lang => {
                    languagesMap.set(lang.id, lang);
                });
            }
            
            // Get flag image URL function (same as profile-full.html)
            function getFlagImageUrl(isoCode) {
                if (!isoCode) return null;
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
            
            const languagesHtml = self.userLanguages.map((lang, index) => {
                const language = languagesMap.get(lang.language_id);
                const languageName = language?.name || 'Unknown';
                const isoCode = language?.iso_code || '';
                const flagImageUrl = getFlagImageUrl(isoCode);
                const isPrimary = lang.is_primary ? ' <span class="primary-badge">Primary</span>' : '';
                
                // Map language ISO codes to country codes for CSS flag classes
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
                const languageToCssClass = {
                    'en': 'us', 'zh': 'cn', 'da': 'dk', 'el': 'gr', 'he': 'he',
                    'ja': 'ja', 'ko': 'ko', 'ar': 'ar', 'hi': 'hi', 'uk': 'ua'
                };
                const countryCode = languageToCountry[isoCode.toLowerCase()] || isoCode.toLowerCase();
                const languageCodeForCss = languageToCssClass[isoCode.toLowerCase()] || isoCode.toLowerCase() || countryCode;
                
                // Create flag icon
                let flagIconHtml = '';
                if (flagImageUrl) {
                    flagIconHtml = `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="background-image: url('${flagImageUrl}'); background-size: 24px 18px; background-position: center; background-repeat: no-repeat; width: 24px; height: 18px; display: inline-block; border-radius: 3px;"></span>`;
                } else {
                    flagIconHtml = `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="background-color: #e1e5e9;"></span>`;
                }
                
                return `<span class="language-badge" 
                             data-language-index="${index}" 
                             data-language-id="${lang.language_id}" 
                             data-iso-code="${isoCode.toLowerCase()}">
                    <span class="language-content">
                        ${flagIconHtml}
                        <span class="language-name">${languageName}</span>${isPrimary}
                    </span>
                </span>`;
            }).join('');
            
            currentLanguagesDisplay.innerHTML = `<div class="languages-badges-container">${languagesHtml}</div>`;
            
            // Use event delegation for better performance (single listener instead of many)
            const badgesContainer = currentLanguagesDisplay.querySelector('.languages-badges-container');
            if (badgesContainer) {
                badgesContainer.addEventListener('click', function(e) {
                    const badge = e.target.closest('.language-badge');
                    if (badge) {
                        const languageIndex = parseInt(badge.dataset.languageIndex);
                        const language = self.userLanguages[languageIndex];
                        if (language) {
                            self.openLanguageDetailModal(language, languageIndex);
                        }
                    }
                });
            }
        },
        
        // Open languages modal (optimized)
        openLanguagesModal: function() {
            const self = this;
            if (self.languagesModal) {
                self.languagesModal.style.display = 'flex';
                // Only render if not already rendered or if languages data changed
                const checkboxList = document.getElementById('languages-checkbox-list');
                if (!checkboxList || !checkboxList.querySelector('.languages-checkbox-container')) {
                    self.renderLanguagesSelect();
                }
            }
        },
        
        // Close languages modal
        closeLanguagesModalFunc: function() {
            const self = this;
            if (self.languagesModal) {
                self.languagesModal.style.display = 'none';
                // Reload user languages to reset any unsaved changes
                self.loadUserLanguages();
            }
        },
        
        // Render languages checkbox list (optimized)
        renderLanguagesSelect: function() {
            const self = this;
            const checkboxList = document.getElementById('languages-checkbox-list');
            if (!checkboxList) return;
            
            checkboxList.innerHTML = '';
            
            if (!self.languagesData.languages || self.languagesData.languages.length === 0) {
                checkboxList.innerHTML = '<p class="no-languages-msg">No languages available. Please contact support.</p>';
                return;
            }
            
            // Create a Set for faster lookup of selected languages
            const selectedLanguageIds = new Set(self.userLanguages.map(ul => ul.language_id));
            
            // Create checkbox container
            const checkboxContainer = document.createElement('div');
            checkboxContainer.className = 'languages-checkbox-container';
            
            // Use DocumentFragment for batch DOM operations (much faster)
            const fragment = document.createDocumentFragment();
            
            // Build HTML string for all checkboxes at once (faster than individual creates)
            const languagesHtml = self.languagesData.languages.map(lang => {
                const isSelected = selectedLanguageIds.has(lang.id);
                const nativeName = lang.native_name && lang.native_name !== lang.name ? ` (${lang.native_name})` : '';
                return `
                    <label class="language-checkbox-item">
                        <input type="checkbox" class="language-checkbox" 
                               value="${lang.id}" 
                               data-language-id="${lang.id}"
                               ${isSelected ? 'checked' : ''}>
                        <span class="checkbox-label">${lang.name}${nativeName}</span>
                    </label>
                `;
            }).join('');
            
            checkboxContainer.innerHTML = languagesHtml;
            fragment.appendChild(checkboxContainer);
            checkboxList.appendChild(fragment);
            
            // Use event delegation for better performance (single listener instead of many)
            checkboxContainer.addEventListener('change', function(e) {
                if (e.target.classList.contains('language-checkbox')) {
                    const languageId = parseInt(e.target.value);
                    
                    if (e.target.checked) {
                        // Add language if not already in userLanguages
                        if (!selectedLanguageIds.has(languageId)) {
                            selectedLanguageIds.add(languageId);
                            self.userLanguages.push({
                                id: null,
                                language_id: languageId,
                                fluency_level_id: '',
                                is_primary: false,
                                can_read: false,
                                can_write: false,
                                can_speak: false,
                                can_understand: false
                            });
                        }
                    } else {
                        // Remove language from userLanguages
                        selectedLanguageIds.delete(languageId);
                        const index = self.userLanguages.findIndex(ul => ul.language_id == languageId);
                        if (index !== -1) {
                            self.userLanguages.splice(index, 1);
                        }
                    }
                }
            });
        },
        
        // Unselect all languages
        unselectAllLanguages: function() {
            const self = this;
            const checkboxes = document.querySelectorAll('.language-checkbox');
            
            // Uncheck all checkboxes
            checkboxes.forEach(checkbox => {
                checkbox.checked = false;
            });
            
            // Clear userLanguages array
            self.userLanguages = [];
        },
        
        // Save languages
        saveLanguages: async function() {
            const self = this;
            // Get all checked checkboxes
            const checkedBoxes = document.querySelectorAll('.language-checkbox:checked');
            
            // Validate - at least one language must be selected
            if (checkedBoxes.length === 0) {
                if (window.showNotification) {
                    window.showNotification('Please select at least one language', 'error');
                }
                const checkboxList = document.getElementById('languages-checkbox-list');
                if (checkboxList) {
                    checkboxList.style.border = '2px solid #dc3545';
                    checkboxList.style.borderRadius = '8px';
                    checkboxList.style.padding = '1rem';
                }
                return;
            }
            
            // Reset border if validation passes
            const checkboxList = document.getElementById('languages-checkbox-list');
            if (checkboxList) {
                checkboxList.style.border = '';
                checkboxList.style.padding = '';
            }
            
            // Show loading state
            if (self.saveLanguagesBtn) {
                self.saveLanguagesBtn.disabled = true;
                self.saveLanguagesBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }
            
            try {
                // Get selected language IDs from checkboxes
                const selectedLanguageIds = Array.from(checkedBoxes).map(cb => parseInt(cb.value));
                
                // Prepare languages data - set default values for all selected languages
                const languages = selectedLanguageIds.map(languageId => {
                    // Check if this language already exists in userLanguages
                    const existingLang = self.userLanguages.find(ul => ul.language_id == languageId);
                    
                    return {
                        id: existingLang?.id || null,
                        language_id: languageId,
                        fluency_level_id: existingLang?.fluency_level_id || null,
                        is_primary: existingLang?.is_primary || (selectedLanguageIds.length === 1), // Auto-set as primary if only one
                        can_read: existingLang?.can_read || true, // Default to true
                        can_write: existingLang?.can_write || true,
                        can_speak: existingLang?.can_speak || true,
                        can_understand: existingLang?.can_understand || true
                    };
                });
                
                // Get userId
                const userId = document.querySelector('input[name="userId"]')?.value;
                if (!userId) {
                    throw new Error('User ID not found');
                }
                
                // Send update request
                const response = await window.sessionManager.apiRequest('/api/profile/languages', {
                    method: 'POST',
                    body: JSON.stringify({ userId, languages })
                });
                
                if (!response.ok) {
                    const text = await response.text().catch(() => null);
                    throw new Error(text || `Server returned ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    if (window.showNotification) {
                        window.showNotification('Languages updated successfully!', 'success');
                    }
                    // Reload user languages to get updated data
                    await self.loadUserLanguages();
                    
                    // Sync with LanguageMultiSelectManager if it exists
                    if (window.languagesManager) {
                        window.languagesManager.setUserLanguages(self.userLanguages);
                    }
                    
                    // Close modal after a short delay
                    setTimeout(() => {
                        self.closeLanguagesModalFunc();
                    }, 1000);
                } else {
                    throw new Error(result.error || 'Failed to update languages');
                }
                
            } catch (error) {
                if (window.showNotification) {
                    window.showNotification(error.message || 'Failed to update languages. Please try again.', 'error');
                }
            } finally {
                // Reset button state
                if (self.saveLanguagesBtn) {
                    self.saveLanguagesBtn.disabled = false;
                    self.saveLanguagesBtn.innerHTML = '<i class="fas fa-save"></i> Save Languages';
                }
            }
        },
        
        // Open language detail modal
        openLanguageDetailModal: function(language, languageIndex) {
            const self = this;
            self.currentEditingLanguageIndex = languageIndex;
            
            // Get language name
            const languageData = self.languagesData.languages.find(l => l.id == language.language_id);
            const languageName = languageData?.name || 'Unknown Language';
            if (self.languageDetailTitle) {
                self.languageDetailTitle.textContent = `${languageName} Details`;
            }
            
            // Set form values
            document.getElementById('detail-language-id').value = language.language_id;
            document.getElementById('detail-language-index').value = languageIndex;
            document.getElementById('detail-is-primary').checked = language.is_primary || false;
            document.getElementById('detail-can-read').checked = language.can_read || false;
            document.getElementById('detail-can-write').checked = language.can_write || false;
            document.getElementById('detail-can-speak').checked = language.can_speak || false;
            document.getElementById('detail-can-understand').checked = language.can_understand || false;
            
            // Populate fluency level select
            const fluencySelect = document.getElementById('detail-fluency-level');
            if (fluencySelect) {
                fluencySelect.innerHTML = '<option value="">Select fluency level (optional)</option>';
                
                if (self.languagesData.fluencyLevels) {
                    self.languagesData.fluencyLevels.forEach(fluency => {
                        const option = document.createElement('option');
                        option.value = fluency.id;
                        option.textContent = fluency.name + (fluency.description ? ` - ${fluency.description}` : '');
                        if (fluency.id == language.fluency_level_id) {
                            option.selected = true;
                        }
                        fluencySelect.appendChild(option);
                    });
                }
            }
            
            // Show modal
            if (self.languageDetailModal) {
                self.languageDetailModal.style.display = 'flex';
            }
        },
        
        // Close language detail modal
        closeLanguageDetailModalFunc: function() {
            const self = this;
            if (self.languageDetailModal) {
                self.languageDetailModal.style.display = 'none';
            }
            self.currentEditingLanguageIndex = -1;
        },
        
        // Save language detail
        saveLanguageDetail: async function() {
            const self = this;
            const languageIndex = parseInt(document.getElementById('detail-language-index').value);
            if (languageIndex < 0 || languageIndex >= self.userLanguages.length) {
                if (window.showNotification) {
                    window.showNotification('Invalid language selection', 'error');
                }
                return;
            }
            
            // Validate at least one skill is checked
            const canRead = document.getElementById('detail-can-read').checked;
            const canWrite = document.getElementById('detail-can-write').checked;
            const canSpeak = document.getElementById('detail-can-speak').checked;
            const canUnderstand = document.getElementById('detail-can-understand').checked;
            
            if (!canRead && !canWrite && !canSpeak && !canUnderstand) {
                if (window.showNotification) {
                    window.showNotification('Please select at least one skill', 'error');
                }
                return;
            }
            
            // Show loading state
            if (self.saveLanguageDetailBtn) {
                self.saveLanguageDetailBtn.disabled = true;
                self.saveLanguageDetailBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
            }
            
            try {
                // Update userLanguages array
                const language = self.userLanguages[languageIndex];
                language.fluency_level_id = document.getElementById('detail-fluency-level').value ? parseInt(document.getElementById('detail-fluency-level').value) : null;
                language.is_primary = document.getElementById('detail-is-primary').checked;
                language.can_read = canRead;
                language.can_write = canWrite;
                language.can_speak = canSpeak;
                language.can_understand = canUnderstand;
                
                // If this is set as primary, unset others
                if (language.is_primary) {
                    self.userLanguages.forEach((lang, idx) => {
                        if (idx !== languageIndex) {
                            lang.is_primary = false;
                        }
                    });
                }
                
                // Get userId
                const userId = document.querySelector('input[name="userId"]')?.value;
                if (!userId) {
                    throw new Error('User ID not found');
                }
                
                // Send update request
                const response = await window.sessionManager.apiRequest('/api/profile/languages', {
                    method: 'POST',
                    body: JSON.stringify({ userId, languages: self.userLanguages })
                });
                
                if (!response.ok) {
                    const text = await response.text().catch(() => null);
                    throw new Error(text || `Server returned ${response.status}`);
                }
                
                const result = await response.json();
                
                if (result.success) {
                    if (window.showNotification) {
                        window.showNotification('Language details updated successfully!', 'success');
                    }
                    // Reload user languages to get updated data
                    await self.loadUserLanguages();
                    
                    // Sync with LanguageMultiSelectManager if it exists
                    if (window.languagesManager) {
                        window.languagesManager.setUserLanguages(self.userLanguages);
                    }
                    
                    // Close modal after a short delay
                    setTimeout(() => {
                        self.closeLanguageDetailModalFunc();
                    }, 1000);
                } else {
                    throw new Error(result.error || 'Failed to update language details');
                }
                
            } catch (error) {
                if (window.showNotification) {
                    window.showNotification(error.message || 'Failed to update language details. Please try again.', 'error');
                }
            } finally {
                // Reset button state
                if (self.saveLanguageDetailBtn) {
                    self.saveLanguageDetailBtn.disabled = false;
                    self.saveLanguageDetailBtn.innerHTML = '<i class="fas fa-save"></i> Save Details';
                }
            }
        }
    };
})();






























