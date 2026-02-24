/**
 * DropdownManager - Consolidated dropdown population for profile-edit.html
 * Replaces 40+ repetitive dropdown population functions with a single configurable system
 */

class DropdownManager {
    constructor() {
        this.config = {
            // Section types: 'aboutMe' or 'preferences'
            skipValues: {
                aboutMe: ['Not important', 'It\'s complicated', 'It\'s Complicated', 'Its complicated', 'Its Complicated', 'It is complicated', 'It Is Complicated', 'Other'],
                preferences: ['Prefer not to say', 'It\'s complicated', 'It\'s Complicated', 'Its complicated', 'Its Complicated', 'It is complicated', 'It Is Complicated', 'Other']
            }
        };
    }

    /**
     * Populate a simple name-based dropdown
     * @param {Object} config - Configuration object
     * @param {string} config.selectId - ID of the select element
     * @param {string} config.dataKey - Key in data object (e.g., 'bodyTypes')
     * @param {Object} config.data - Full data object from API
     * @param {string} config.currentValueId - ID of hidden input with current value
     * @param {string} config.section - 'aboutMe' or 'preferences'
     * @param {Function} config.valueMapper - Optional function to map values
     */
    populateSimpleDropdown({ selectId, dataKey, data, currentValueId, section, valueMapper, skipValues: fieldSkipValues }) {
        const select = document.getElementById(selectId);
        if (!select || !data[dataKey]) return;

        const currentValueInput = document.getElementById(currentValueId);
        const currentValue = currentValueInput?.value?.trim() || '';
        // Also check for ID-based current value (for fields like number_of_children)
        // Try multiple patterns to find the ID input
        let currentValueIdInput = document.getElementById(currentValueId + '-id');
        if (!currentValueIdInput) {
            currentValueIdInput = document.getElementById(currentValueId.replace('-name', '-id'));
        }
        if (!currentValueIdInput) {
            const baseId = currentValueId.replace('current-', '');
            currentValueIdInput = document.getElementById('current-' + baseId + '-id');
        }
        const currentValueIdValue = currentValueIdInput?.value?.trim() || '';
        const skipValues = [
            ...((this.config.skipValues && this.config.skipValues[section]) || []),
            ...(Array.isArray(fieldSkipValues) ? fieldSkipValues : [])
        ];

        // Clear existing options (keep first if it's a placeholder)
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            select.appendChild(firstOption);
        }

        let foundMatch = false;
        data[dataKey].forEach(item => {
            const itemName = item.name || item.display_name || item.label || '';
            const itemNameLower = itemName.toLowerCase().trim();
            const itemId = item.id || item.value || '';
            
            // Skip excluded values (case-insensitive check)
            // Special handling for "It's complicated" variations
            const shouldSkip = skipValues.some(skip => {
                const skipLower = skip.toLowerCase().trim();
                // For "complicated" entries, check if item contains "complicated"
                if (skipLower.includes('complicated')) {
                    return itemNameLower.includes('complicated');
                }
                // For "other", exact match (case-insensitive)
                if (skipLower === 'other') {
                    return itemNameLower === 'other';
                }
                // For other entries, exact match
                return itemNameLower === skipLower;
            });
            
            if (shouldSkip) return;

            const option = document.createElement('option');
            // Use ID as value if available (for proper database matching), otherwise use name
            // For number_of_children and similar ID-based fields, use ID as value
            // Check if this is a field that should use IDs (like number_of_children)
            const useIdAsValue = selectId.includes('number-of-children') || selectId.includes('number_of_children');
            const optionValue = valueMapper ? valueMapper(item) : (useIdAsValue && itemId ? String(itemId) : itemName);
            option.value = optionValue;
            option.textContent = itemName;
            
            // Store ID as data attribute for reference
            if (itemId) {
                option.dataset.itemId = String(itemId);
            }
            
            // Add description as title if available
            if (item.description) {
                option.title = item.description;
            }
            
            // Set selected if matches current value (check both ID and name)
            // For number-of-children fields, prioritize ID matching to avoid ambiguity
            const isNumberField = selectId.includes('number-of-children') || selectId.includes('number_of_children');
            
            let shouldSelect = false;
            
            if (isNumberField) {
                // For number fields, prioritize ID matching to avoid name conflicts (e.g., "1" vs "1 child")
                const matchesId = currentValueIdValue && itemId && String(itemId) === String(currentValueIdValue);
                const matchesValueAsId = currentValueIdValue && optionValue && String(optionValue) === String(currentValueIdValue);
                shouldSelect = matchesId || matchesValueAsId;
                
                // Fallback to name/value match only if no ID is available
                if (!shouldSelect && !currentValueIdValue) {
                    const matchesValue = currentValue && optionValue && String(optionValue) === String(currentValue);
                    const matchesName = currentValue && itemName && itemName.toLowerCase() === currentValue.toLowerCase();
                    shouldSelect = matchesValue || matchesName;
                }
            } else {
                // For other fields, use flexible matching
                const matchesId = currentValueIdValue && itemId && String(itemId) === String(currentValueIdValue);
                const matchesName = currentValue && itemName && itemName.toLowerCase() === currentValue.toLowerCase();
                const matchesValue = currentValue && optionValue && optionValue.toLowerCase() === currentValue.toLowerCase();
                const matchesValueAsId = currentValueIdValue && optionValue && String(optionValue) === String(currentValueIdValue);
                shouldSelect = matchesId || matchesName || matchesValue || matchesValueAsId;
            }
            
            if (shouldSelect) {
                option.selected = true;
                foundMatch = true;
            }
            
            select.appendChild(option);
        });
        
        // If no match found and currentValue is 'Not specified' or empty, ensure placeholder is shown
        if (!foundMatch && (currentValue === 'Not specified' || currentValue === '' || !currentValue)) {
            // Placeholder option should remain visible (already added above)
            if (select.options.length > 0 && select.options[0].value === '') {
                select.options[0].selected = false; // Don't auto-select placeholder
            }
        }
    }

    /**
     * Populate a reference-based dropdown (height/weight with ID matching)
     * @param {Object} config - Configuration object
     * @param {string} config.selectId - ID of the select element
     * @param {string} config.dataKey - Key in data object (e.g., 'heights')
     * @param {Object} config.data - Full data object from API
     * @param {string} config.currentRefId - ID of hidden input with reference ID
     * @param {string} config.currentValue - ID of hidden input with current value (cm/kg)
     * @param {string} config.section - 'aboutMe' or 'preferences'
     * @param {Function} config.displayFormatter - Function to format display text
     */
    populateReferenceDropdown({ selectId, dataKey, data, currentRefId, currentValue, section, displayFormatter }) {
        const select = document.getElementById(selectId);
        if (!select || !data[dataKey]) return;

        const refIdInput = document.getElementById(currentRefId);
        const valueInput = document.getElementById(currentValue);
        const currentRefIdValue = refIdInput?.value?.trim() || '';
        const currentValueValue = valueInput?.value?.trim() || '';
        
        const skipValues = this.config.skipValues[section] || [];
        const isValidId = currentRefIdValue && 
                         currentRefIdValue !== '' && 
                         currentRefIdValue !== 'undefined' && 
                         currentRefIdValue !== 'null' &&
                         !isNaN(currentRefIdValue);
        const isValidValue = currentValueValue && 
                            currentValueValue !== '' && 
                            currentValueValue !== 'undefined' && 
                            currentValueValue !== 'null' &&
                            !isNaN(currentValueValue);

        // Clear existing options
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            select.appendChild(firstOption);
        }

        let found = false;
        data[dataKey].forEach(item => {
            const displayText = item.display_text || '';
            const displayTextLower = displayText.toLowerCase();
            
            // Skip excluded values (case-insensitive check)
            if (skipValues.includes(displayText) || 
                skipValues.some(skip => skip.toLowerCase() === displayTextLower)) return;

            const option = document.createElement('option');
            option.value = item.id;
            
            // Format display text
            if (displayFormatter) {
                option.textContent = displayFormatter(item);
            } else if (displayText) {
                option.textContent = displayText;
            } else if (item.height_cm !== null && item.height_cm !== undefined) {
                option.textContent = `${item.height_cm} cm`;
            } else if (item.weight_kg !== null && item.weight_kg !== undefined) {
                option.textContent = `${item.weight_kg} kg`;
            } else {
                option.textContent = 'N/A';
            }

            // Set selected if matches
            if (!found) {
                if (isValidId && item.id == currentRefIdValue) {
                    option.selected = true;
                    found = true;
                } else if (isValidValue && !isValidId) {
                    if (item.height_cm != null && item.height_cm == currentValueValue) {
                        option.selected = true;
                        found = true;
                    } else if (item.weight_kg != null && item.weight_kg == currentValueValue) {
                        option.selected = true;
                        found = true;
                    }
                }
            }

            select.appendChild(option);
        });

        // Explicitly set value if we have a valid ID
        if (isValidId && currentRefIdValue) {
            select.value = String(currentRefIdValue);
        }
    }

    /**
     * Populate gender dropdown with special mapping
     */
    populateGenderDropdown(selectId, data, currentValueId, section) {
        const select = document.getElementById(selectId);
        if (!select || !data.genders) return;

        const currentValueInput = document.getElementById(currentValueId);
        const currentGenderRaw = currentValueInput?.value?.trim() || '';
        
        // Map current value to lowercase for comparison (handle 'M'/'F', 'Male'/'Female', 'male'/'female')
        const normalizeGender = (gender) => {
            const genderLower = (gender || '').toLowerCase().trim();
            if (genderLower === 'm' || genderLower === 'male') return 'male';
            if (genderLower === 'f' || genderLower === 'female') return 'female';
            return genderLower; // Return as-is if not recognized
        };
        
        const currentGenderNormalized = normalizeGender(currentGenderRaw);
        const skipValues = this.config.skipValues[section] || [];

        // Clear existing options
        const firstOption = select.options[0];
        select.innerHTML = '';
        if (firstOption && firstOption.value === '') {
            select.appendChild(firstOption);
        }

        data.genders.forEach(gender => {
            if (skipValues.includes(gender.name)) return;
            
            // Map API gender name ('Male'/'Female') to lowercase value ('male'/'female')
            const genderValue = normalizeGender(gender.name);
            const genderDisplay = gender.name; // Keep display as 'Male'/'Female'
            
            const option = document.createElement('option');
            option.value = genderValue; // Use lowercase for form submission
            option.textContent = genderDisplay; // Display capitalized
            if (genderValue === currentGenderNormalized) {
                option.selected = true;
            }
            select.appendChild(option);
        });
    }

    /**
     * Populate all dropdowns from configuration
     * @param {Object} data - Full data object from API
     * @param {Array} fieldConfigs - Array of field configuration objects
     */
    populateAllDropdowns(data, fieldConfigs) {
        fieldConfigs.forEach(config => {
            if (config.type === 'simple') {
                this.populateSimpleDropdown({
                    selectId: config.selectId,
                    dataKey: config.dataKey,
                    data: data,
                    currentValueId: config.currentValueId,
                    section: config.section,
                    valueMapper: config.valueMapper,
                    skipValues: config.skipValues
                });
            } else if (config.type === 'reference') {
                this.populateReferenceDropdown({
                    selectId: config.selectId,
                    dataKey: config.dataKey,
                    data: data,
                    currentRefId: config.currentRefId,
                    currentValue: config.currentValue,
                    section: config.section,
                    displayFormatter: config.displayFormatter
                });
            } else if (config.type === 'gender') {
                this.populateGenderDropdown(
                    config.selectId,
                    data,
                    config.currentValueId,
                    config.section
                );
            }
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DropdownManager;
} else {
    window.DropdownManager = DropdownManager;
}




