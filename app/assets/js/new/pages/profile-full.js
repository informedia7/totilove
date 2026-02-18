// Profile full page functionality
(function () {
    // Star sign and Chinese zodiac calculation
    function calculateStarSignAndZodiac() {
        const starEl = document.getElementById('star-sign-value');
        const chineseEl = document.getElementById('chinese-zodiac-value');
        if (!starEl || !chineseEl || typeof window.star_sign_zodiac_calculation !== 'function') return;

        const dob = starEl.dataset.dob || chineseEl.dataset.dob || '';
        if (!dob) return;

        const result = window.star_sign_zodiac_calculation(dob);
        starEl.textContent = result.starSign || 'Not specified';
        chineseEl.textContent = result.chineseZodiac || 'Not specified';
        
        // Apply green color to filled fields after star sign calculation
        highlightFilledFields();
    }
    
    // Function to highlight all non-empty fields in green and empty fields in red
    function highlightFilledFields() {
        const infoValues = document.querySelectorAll('.info-value');
        const aboutMeTexts = document.querySelectorAll('.about-me-text');
        const emptyValues = ['', 'Not specified', 'undefined', 'null'];
        
        // Highlight info values
        infoValues.forEach(valueEl => {
            const text = (valueEl.textContent || '').trim();
            const isEmpty = !text || 
                           emptyValues.includes(text) || 
                           text === 'Not specified' ||
                           text.toLowerCase().includes('not specified');
            
            if (isEmpty) {
                valueEl.classList.add('empty');
                valueEl.classList.remove('filled');
            } else {
                valueEl.classList.add('filled');
                valueEl.classList.remove('empty');
            }
        });
        
        // Highlight all About Me / Person I'm Looking For texts
        if (aboutMeTexts && aboutMeTexts.length > 0) {
            aboutMeTexts.forEach(textEl => {
                const text = (textEl.textContent || '').trim();
                const isEmpty = !text || 
                               emptyValues.includes(text);
                
                if (isEmpty) {
                    textEl.classList.add('empty');
                    textEl.classList.remove('filled');
                } else {
                    textEl.classList.add('filled');
                    textEl.classList.remove('empty');
                }
            });
        }
    }
    
    // Helper function to get session token from multiple sources
    function getSessionToken() {
        // Try URL params first
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) return urlToken;
        
        // Try cookies
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const trimmed = cookie.trim();
            const equalIndex = trimmed.indexOf('=');
            if (equalIndex === -1) continue;
            
            const name = trimmed.substring(0, equalIndex).trim();
            const value = trimmed.substring(equalIndex + 1).trim();
            
            if (name === 'sessionToken') {
                return decodeURIComponent(value);
            }
        }
        
        return null;
    }
    
    // Helper function to get userId from page
    function getUserId() {
        // Try to get from window object (set by template)
        if (window.currentUser && window.currentUser.id) {
            return window.currentUser.id;
        }
        
        // Try to get from URL params
        const urlParams = new URLSearchParams(window.location.search);
        const userId = urlParams.get('userId') || urlParams.get('user');
        if (userId) return userId;
        
        return null;
    }
    
    // Load and display user languages with flags
    async function loadUserLanguages() {
        const currentLanguagesDisplay = document.getElementById('current-languages-display');
        if (!currentLanguagesDisplay) {
            console.warn('Languages display element not found');
            return;
        }
        
        try {
            const sessionToken = getSessionToken();
            const userId = getUserId();
            
            if (!sessionToken && !userId) {
                console.warn('No session token or userId available');
                currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">Unable to load languages</span>';
                return;
            }
            
            // Build query params
            const queryParams = new URLSearchParams();
            if (sessionToken) {
                queryParams.append('token', sessionToken);
            }
            if (userId) {
                queryParams.append('userId', userId);
            }
            
            // Load lookup data first to get languages list (only if we have sessionToken)
            let languagesData = { languages: [] };
            if (sessionToken) {
                try {
                    const lookupUrl = `/api/profile/lookup-data?sessionToken=${sessionToken}`;
                    const lookupResponse = await fetch(lookupUrl, {
                        credentials: 'same-origin'
                    });
                    
                    if (lookupResponse.ok) {
                        const lookupResult = await lookupResponse.json();
                        if (lookupResult.success && lookupResult.data) {
                            languagesData = {
                                languages: lookupResult.data.languages || []
                            };
                        }
                    } else {
                        console.warn('Failed to load lookup data:', lookupResponse.status, lookupResponse.statusText);
                    }
                } catch (lookupError) {
                    console.warn('Failed to load lookup data:', lookupError);
                    // Continue anyway - we can still display languages without lookup data
                }
            }
            
            // Load user's languages
            const headers = {};
            if (sessionToken) {
                headers['Authorization'] = `Bearer ${sessionToken}`;
                headers['X-Session-Token'] = sessionToken;
            }
            
            const response = await fetch(`/api/profile/languages?${queryParams.toString()}`, {
                method: 'GET',
                headers: headers,
                credentials: 'same-origin'
            });
            
            if (!response.ok) {
                console.error('Failed to load languages:', response.status, response.statusText);
                currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">Unable to load languages</span>';
                return;
            }
            
            const result = await response.json();
            
            if (result.success && result.languages && result.languages.length > 0) {
                displayLanguages(result.languages, languagesData);
            } else {
                currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">No languages added</span>';
            }
        } catch (error) {
            console.error('Error loading user languages:', error);
            if (currentLanguagesDisplay) {
                currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">Error loading languages</span>';
            }
        }
    }
    
    // Display languages with flags (same as profile-edit.html)
    function displayLanguages(userLanguages, languagesData) {
        const currentLanguagesDisplay = document.getElementById('current-languages-display');
        if (!currentLanguagesDisplay) return;
        
        if (userLanguages.length === 0) {
            currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">No languages added</span>';
            return;
        }
        
        // Create a Map for faster language lookup
        const languagesMap = new Map();
        if (languagesData.languages) {
            languagesData.languages.forEach(lang => {
                languagesMap.set(lang.id, lang);
            });
        }
        
        // Get flag emoji function (fallback)
        function getFlagEmoji(isoCode) {
            if (!isoCode) return '';
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
        
        // Get flag image URL function
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
        
        // Map language names to ISO codes as fallback
        const languageNameToIsoCode = {
            'english': 'en', 'norwegian': 'no', 'japanese': 'ja', 'mandarin chinese': 'zh', 'chinese': 'zh',
            'polish': 'pl', 'russian': 'ru', 'vietnamese': 'vi', 'spanish': 'es', 'french': 'fr',
            'german': 'de', 'italian': 'it', 'portuguese': 'pt', 'arabic': 'ar', 'hindi': 'hi',
            'thai': 'th', 'turkish': 'tr', 'dutch': 'nl', 'swedish': 'sv', 'danish': 'da',
            'finnish': 'fi', 'greek': 'el', 'hebrew': 'he', 'czech': 'cs', 'hungarian': 'hu',
            'romanian': 'ro', 'bulgarian': 'bg', 'croatian': 'hr', 'slovak': 'sk', 'slovenian': 'sl',
            'ukrainian': 'uk', 'bengali': 'bn', 'urdu': 'ur', 'persian': 'fa', 'indonesian': 'id',
            'malay': 'ms', 'tagalog': 'tl', 'swahili': 'sw', 'afrikaans': 'af', 'catalan': 'ca',
            'basque': 'eu', 'irish': 'ga', 'welsh': 'cy', 'maltese': 'mt', 'icelandic': 'is',
            'latvian': 'lv', 'lithuanian': 'lt', 'estonian': 'et', 'macedonian': 'mk', 'albanian': 'sq',
            'serbian': 'sr', 'bosnian': 'bs', 'montenegrin': 'me', 'georgian': 'ka', 'armenian': 'hy',
            'azerbaijani': 'az', 'kazakh': 'kk', 'uzbek': 'uz', 'mongolian': 'mn', 'burmese': 'my',
            'khmer': 'km', 'lao': 'lo', 'nepali': 'ne', 'sinhala': 'si', 'tamil': 'ta', 'telugu': 'te',
            'malayalam': 'ml', 'kannada': 'kn', 'gujarati': 'gu', 'punjabi': 'pa', 'marathi': 'mr',
            'oriya': 'or', 'assamese': 'as', 'amharic': 'am', 'yoruba': 'yo', 'igbo': 'ig',
            'hausa': 'ha', 'zulu': 'zu', 'xhosa': 'xh', 'esperanto': 'eo', 'latin': 'la',
            'corsican': 'co', 'scottish gaelic': 'gd', 'breton': 'br', 'frisian': 'fy',
            'luxembourgish': 'lb', 'romansh': 'rm', 'manx': 'gv', 'cornish': 'kw', 'korean': 'ko'
        };
        
        const languagesHtml = userLanguages.map((lang, index) => {
            const language = languagesMap.get(lang.language_id);
            const languageName = language?.name || lang.language_name || 'Unknown';
            // Get ISO code from multiple sources: lookup data, API response, or fallback mapping
            let isoCode = language?.iso_code || lang.iso_code || '';
            
            // Fallback: try to get ISO code from language name mapping
            if (!isoCode && languageName) {
                const nameLower = languageName.toLowerCase().trim();
                isoCode = languageNameToIsoCode[nameLower] || '';
            }
            
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
                'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it', 'pt': 'pt',
                'ru': 'ru', 'zh': 'zh', 'ja': 'ja', 'ko': 'ko', 'ar': 'ar', 'hi': 'hi', 'uk': 'ua'
            };
            const countryCode = languageToCountry[isoCode.toLowerCase()] || isoCode.toLowerCase();
            const languageCodeForCss = languageToCssClass[isoCode.toLowerCase()] || isoCode.toLowerCase() || countryCode;
            
            // Create flag icon (matching profile-edit style)
            let flagIconHtml = '';
            if (flagImageUrl && isoCode) {
                flagIconHtml = `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="background-image: url('${flagImageUrl}'); background-size: 24px 18px; background-position: center; background-repeat: no-repeat; width: 24px; height: 18px; display: inline-block; border-radius: 3px; flex-shrink: 0; background-color: #e1e5e9;"></span>`;
            } else if (isoCode) {
                // Try to use flag emoji as fallback if image not available
                const flagEmoji = getFlagEmoji(isoCode);
                if (flagEmoji) {
                    flagIconHtml = `<span class="language-flag-icon" style="font-size: 18px; width: 24px; height: 18px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0;">${flagEmoji}</span>`;
                } else {
                    flagIconHtml = `<span class="language-flag-icon flag-icon flag-${languageCodeForCss}" style="width: 24px; height: 18px; display: inline-block; border-radius: 3px; flex-shrink: 0; background-color: #e1e5e9;"></span>`;
                }
            } else {
                flagIconHtml = `<span class="language-flag-icon" style="width: 24px; height: 18px; display: inline-block; border-radius: 3px; flex-shrink: 0; background-color: #e1e5e9;"></span>`;
            }
            
            return `<span class="language-badge" style="background: #f5f5f5; color: #333; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.9rem; display: inline-flex; align-items: center; gap: 0.5rem; border: 1px solid #e1e5e9; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1); margin-right: 0.5rem; margin-bottom: 0.5rem;">
                <span class="language-content" style="display: flex; align-items: center; gap: 0.5rem;">
                    ${flagIconHtml}
                    <span class="language-name">${languageName}</span>${isPrimary}
                </span>
            </span>`;
        }).join('');
        
        currentLanguagesDisplay.innerHTML = `<div class="languages-badges-container" style="display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start;">${languagesHtml}</div>`;
    }

    // Mobile-only buttons should slide cards into view
    function initMobileTabNavigation() {
        const tabGroup = document.querySelector('.mobile-card-tab-group');
        const cardContainer = document.querySelector('.profile-cards-container');
        if (!tabGroup || !cardContainer) return;

        const tabs = Array.from(tabGroup.querySelectorAll('.mobile-card-tab'));
        const portraitMatcher = window.matchMedia('(max-width: 480px) and (orientation: portrait)');

        function setActiveTab(activeTab) {
            tabs.forEach(tab => tab.classList.toggle('active', tab === activeTab));
        }

        function scrollToCard(cardEl) {
            if (!cardEl) return;
            if (portraitMatcher.matches) {
                const scrollOptions = {
                    left: cardEl.offsetLeft,
                    behavior: 'smooth'
                };
                if (typeof cardContainer.scrollTo === 'function') {
                    cardContainer.scrollTo(scrollOptions);
                } else {
                    cardContainer.scrollLeft = cardEl.offsetLeft;
                }
            } else {
                cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        tabs.forEach(tab => {
            tab.addEventListener('click', event => {
                event.preventDefault();
                const targetId = (tab.getAttribute('href') || '').replace('#', '');
                const targetCard = targetId ? document.getElementById(targetId) : null;
                scrollToCard(targetCard);
                setActiveTab(tab);
            });
        });

        let scrollTimeoutId = null;
        cardContainer.addEventListener('scroll', () => {
            if (!portraitMatcher.matches) return;
            if (scrollTimeoutId) {
                clearTimeout(scrollTimeoutId);
            }

            scrollTimeoutId = setTimeout(() => {
                const containerCenter = cardContainer.scrollLeft + (cardContainer.clientWidth / 2);
                let closestTab = null;
                let smallestDistance = Number.POSITIVE_INFINITY;

                tabs.forEach(tab => {
                    const targetId = (tab.getAttribute('href') || '').replace('#', '');
                    const targetCard = targetId ? document.getElementById(targetId) : null;
                    if (!targetCard) return;

                    const cardCenter = targetCard.offsetLeft + (targetCard.offsetWidth / 2);
                    const distance = Math.abs(containerCenter - cardCenter);
                    if (distance < smallestDistance) {
                        smallestDistance = distance;
                        closestTab = tab;
                    }
                });

                if (closestTab) {
                    setActiveTab(closestTab);
                }
            }, 100);
        });
    }
    
    // Initialize on page load
    function initialize() {
        calculateStarSignAndZodiac();
        // Small delay to ensure all template variables are replaced
        setTimeout(highlightFilledFields, 100);
        // Load languages with a slight delay to ensure DOM is ready
        setTimeout(loadUserLanguages, 200);
        initMobileTabNavigation();
    }
    
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM already loaded, but wait a bit for template rendering
        setTimeout(initialize, 100);
    }
})();



