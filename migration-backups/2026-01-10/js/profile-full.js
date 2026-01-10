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
    
    // Load and display user languages with flags
    async function loadUserLanguages() {
        try {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionToken = urlParams.get('token');
            
            if (!sessionToken) {
                return;
            }
            
            // Load lookup data first to get languages list
            const lookupResponse = await fetch(`/api/profile/lookup-data?sessionToken=${sessionToken}`);
            const lookupResult = await lookupResponse.json();
            
            if (!lookupResult.success || !lookupResult.data) {
                return;
            }
            
            const languagesData = {
                languages: lookupResult.data.languages || []
            };
            
            // Load user's languages
            const response = await fetch(`/api/profile/languages?token=${sessionToken}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${sessionToken}`,
                    'X-Session-Token': sessionToken
                }
            });
            
            if (!response.ok) {
                return;
            }
            
            const result = await response.json();
            const currentLanguagesDisplay = document.getElementById('current-languages-display');
            
            if (result.success && result.languages && result.languages.length > 0) {
                displayLanguages(result.languages, languagesData);
            } else {
                if (currentLanguagesDisplay) {
                    currentLanguagesDisplay.innerHTML = '<span class="no-languages-text">No languages added</span>';
                }
            }
        } catch (error) {
            console.error('Error loading user languages:', error);
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
        
        const languagesHtml = userLanguages.map((lang, index) => {
            const language = languagesMap.get(lang.language_id);
            const languageName = language?.name || lang.language_name || 'Unknown';
            const isoCode = language?.iso_code || lang.iso_code || '';
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
            
            return `<span class="language-badge">
                <span class="language-content">
                    ${flagIconHtml}
                    <span class="language-name">${languageName}</span>${isPrimary}
                </span>
            </span>`;
        }).join('');
        
        currentLanguagesDisplay.innerHTML = `<div class="languages-badges-container">${languagesHtml}</div>`;
    }
    
    // Initialize on page load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            calculateStarSignAndZodiac();
            // Small delay to ensure all template variables are replaced
            setTimeout(highlightFilledFields, 100);
            loadUserLanguages();
        });
    } else {
        calculateStarSignAndZodiac();
        setTimeout(highlightFilledFields, 100);
        loadUserLanguages();
    }
})();



