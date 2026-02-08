/**
 * Debug script to identify the "Unexpected identifier 'Region'" error
 * This script will:
 * 1. Check all script tags for syntax errors
 * 2. Check template variables for unquoted values
 * 3. Check API responses for unexpected properties
 * 4. Log all findings to console
 */

(function() {
    'use strict';
    
    // 1. Check all script tags
    const scripts = document.querySelectorAll('script');
    scripts.forEach((script, index) => {
        if (script.src) {
            // Script loaded
        } else if (script.innerHTML) {
            const content = script.innerHTML;
            if (content.includes('Region') || content.includes('region')) {
                // Inline script contains Region
            }
        }
    });
    
    // 2. Check all hidden inputs with template variables
    const hiddenInputs = document.querySelectorAll('input[type="hidden"][id^="current-"]');
    hiddenInputs.forEach(input => {
        const value = input.value;
        if (value && (value.includes('Region') || value === 'Region')) {
            // Hidden input has Region value
        }
    });
    
    // 3. Check for unquoted template variables in HTML
    const htmlContent = document.documentElement.outerHTML;
    const regionMatches = htmlContent.match(/Region[^"']/g);
    if (regionMatches) {
        // Found potential unquoted Region references
    }
    
    // 4. Check API responses when states are loaded
    const originalFetch = window.fetch;
    window.fetch = function(...args) {
        const url = args[0];
        if (typeof url === 'string' && (url.includes('/api/states') || url.includes('/api/cities'))) {
            return originalFetch.apply(this, args)
                .then(response => {
                    const clonedResponse = response.clone();
                    clonedResponse.json().then(data => {
                        if (data.states) {
                            data.states.forEach((state, index) => {
                                if (state.Region || state.region || state.name === 'Region') {
                                    // State has Region property
                                }
                            });
                        }
                        if (data.cities) {
                            data.cities.forEach((city, index) => {
                                if (city.Region || city.region || city.name === 'Region') {
                                    // City has Region property
                                }
                            });
                        }
                    }).catch(err => {
                        // Error parsing API response
                    });
                    return response;
                });
        }
        return originalFetch.apply(this, args);
    };
    
    // 5. Check for JavaScript syntax errors
    window.addEventListener('error', function(event) {
        if (event.message && event.message.includes('Region')) {
            // JavaScript Error detected
        }
    }, true);
    
    // 6. Check template variables in the page
    const templateVars = {
        countryId: document.getElementById('current-country-id')?.value,
        stateId: document.getElementById('current-state-id')?.value,
        cityId: document.getElementById('current-city-id')?.value
    };
    
    // 7. Try to find the exact line causing the error
    const allLines = document.documentElement.outerHTML.split('\n');
    if (allLines[16]) { // Line 17 (0-indexed is 16)
        if (allLines[16].includes('Region')) {
            // Line 17 contains Region
        }
    }
})();














