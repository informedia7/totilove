/**
 * Form Configuration - Field mappings for profile-edit.html
 * Used by DropdownManager to populate all dropdowns
 */

const FORM_FIELD_CONFIG = {
    aboutMe: [
        // Gender - special handling
        {
            type: 'gender',
            selectId: 'gender-edit',
            dataKey: 'genders',
            currentValueId: 'current-gender',
            section: 'aboutMe'
        },
        // Simple dropdowns
        {
            type: 'simple',
            selectId: 'body-type',
            dataKey: 'bodyTypes',
            currentValueId: 'current-body-type',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'eye-color',
            dataKey: 'eyeColors',
            currentValueId: 'current-eye-color',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'hair-color',
            dataKey: 'hairColors',
            currentValueId: 'current-hair-color',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'ethnicity',
            dataKey: 'ethnicities',
            currentValueId: 'current-ethnicity',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'religion',
            dataKey: 'religions',
            currentValueId: 'current-religion',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'education',
            dataKey: 'educationLevels',
            currentValueId: 'current-education',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'occupation',
            dataKey: 'occupationCategories',
            currentValueId: 'current-occupation',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'income',
            dataKey: 'incomeRanges',
            currentValueId: 'current-income',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'marital-status',
            dataKey: 'maritalStatuses',
            currentValueId: 'current-marital-status',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'lifestyle',
            dataKey: 'lifestylePreferences',
            currentValueId: 'current-lifestyle',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'body-art',
            dataKey: 'bodyArt',
            currentValueId: 'current-body-art',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'english-ability',
            dataKey: 'englishAbility',
            currentValueId: 'current-english-ability',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'relocation',
            dataKey: 'relocationPreferences',
            currentValueId: 'current-relocation',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'smoking',
            dataKey: 'smokingPreferences',
            currentValueId: 'current-smoking',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'drinking',
            dataKey: 'drinkingPreferences',
            currentValueId: 'current-drinking',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'exercise',
            dataKey: 'exerciseHabits',
            currentValueId: 'current-exercise',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'living-situation',
            dataKey: 'livingSituations',
            currentValueId: 'current-living-situation',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'have-children',
            dataKey: 'haveChildrenStatuses',
            currentValueId: 'current-have-children',
            section: 'aboutMe'
        },
        {
            type: 'simple',
            selectId: 'number-of-children',
            dataKey: 'numberOfChildren',
            currentValueId: 'current-number-of-children',
            section: 'aboutMe'
        },
        // Reference dropdowns (height/weight)
        {
            type: 'reference',
            selectId: 'height-select',
            dataKey: 'heights',
            currentRefId: 'current-height-reference-id',
            currentValue: 'current-height-cm',
            section: 'aboutMe',
            displayFormatter: (item) => {
                if (item.display_text) return item.display_text;
                if (item.height_cm !== null && item.height_cm !== undefined) {
                    return `${item.height_cm} cm`;
                }
                return 'N/A';
            }
        },
        {
            type: 'reference',
            selectId: 'weight-kg',
            dataKey: 'weights',
            currentRefId: 'current-weight-reference-id',
            currentValue: 'current-weight-kg',
            section: 'aboutMe',
            displayFormatter: (item) => {
                if (item.display_text) return item.display_text;
                if (item.weight_kg !== null && item.weight_kg !== undefined) {
                    return `${item.weight_kg} kg`;
                }
                return 'N/A';
            }
        }
    ],
    preferences: [
        // Simple dropdowns
        {
            type: 'simple',
            selectId: 'preferred-gender',
            dataKey: 'genders',
            currentValueId: 'current-preferred-gender',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-body-type',
            dataKey: 'bodyTypes',
            currentValueId: 'current-preferred-body-type',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-eye-color',
            dataKey: 'eyeColors',
            currentValueId: 'current-preferred-eye-color',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-hair-color',
            dataKey: 'hairColors',
            currentValueId: 'current-preferred-hair-color',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-ethnicity',
            dataKey: 'ethnicities',
            currentValueId: 'current-preferred-ethnicity',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-religion',
            dataKey: 'religions',
            currentValueId: 'current-preferred-religion',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-education',
            dataKey: 'educationLevels',
            currentValueId: 'current-preferred-education',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-occupation',
            dataKey: 'occupationCategories',
            currentValueId: 'current-preferred-occupation',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-income',
            dataKey: 'incomeRanges',
            currentValueId: 'current-preferred-income',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-marital-status',
            dataKey: 'maritalStatuses',
            currentValueId: 'current-preferred-marital-status',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-lifestyle',
            dataKey: 'lifestylePreferences',
            currentValueId: 'current-preferred-lifestyle',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-body-art',
            dataKey: 'bodyArt',
            currentValueId: 'current-preferred-body-art',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-english-ability',
            dataKey: 'englishAbility',
            currentValueId: 'current-preferred-english-ability',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-smoking',
            dataKey: 'smokingPreferences',
            currentValueId: 'current-preferred-smoking',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-drinking',
            dataKey: 'drinkingPreferences',
            currentValueId: 'current-preferred-drinking',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-exercise',
            dataKey: 'exerciseHabits',
            currentValueId: 'current-preferred-exercise',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-children',
            dataKey: 'preferredChildrenStatuses',
            currentValueId: 'current-preferred-children',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'preferred-number-of-children',
            dataKey: 'numberOfChildren',
            currentValueId: 'current-preferred-number-of-children',
            section: 'preferences'
        },
        {
            type: 'simple',
            selectId: 'relationship-type',
            dataKey: 'relationshipTypes',
            currentValueId: 'current-relationship-type',
            section: 'preferences',
            valueMapper: (item) => item.display_name || item.name
        },
        // Reference dropdowns
        {
            type: 'reference',
            selectId: 'preferred-height',
            dataKey: 'heights',
            currentRefId: 'current-preferred-height-reference-id',
            currentValue: 'current-preferred-height-cm',
            section: 'preferences',
            displayFormatter: (item) => {
                if (item.display_text) return item.display_text;
                if (item.height_cm !== null && item.height_cm !== undefined) {
                    return `${item.height_cm} cm`;
                }
                return 'N/A';
            }
        },
        {
            type: 'reference',
            selectId: 'preferred-weight',
            dataKey: 'weights',
            currentRefId: 'current-preferred-weight-reference-id',
            currentValue: 'current-preferred-weight-kg',
            section: 'preferences',
            displayFormatter: (item) => {
                if (item.display_text) return item.display_text;
                if (item.weight_kg !== null && item.weight_kg !== undefined) {
                    return `${item.weight_kg} kg`;
                }
                return 'N/A';
            }
        }
    ]
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = FORM_FIELD_CONFIG;
} else {
    window.FORM_FIELD_CONFIG = FORM_FIELD_CONFIG;
}




