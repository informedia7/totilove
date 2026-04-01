/**
 * Profile Data Processor Utility
 * Standalone utility to handle special processing for profile data fields, particularly relationship_type
 * 
 * This utility solves the issue where 'Any' from user_relationship_type_reference table
 * is not being saved to user_preferences table.
 * 
 * Usage:
 *   const ProfileDataProcessor = require('./utils/profileDataProcessor');
 *   ProfileDataProcessor.process(profileData);
 */

class ProfileDataProcessor {
    /**
     * Process relationship_type field
     * Converts 'Any' to null so it gets saved to database (instead of being deleted)
     * @param {Object} profileData - The profile data object
     * @returns {Object} - Modified profile data
     */
    static processRelationshipType(profileData) {
        if (profileData.relationship_type !== undefined) {
            const value = profileData.relationship_type;
            // If 'Any' or empty, set to null (represents "no preference")
            if (value === 'Any' || value === '' || value === null || value === undefined) {
                profileData.relationship_type = null;
            }
        }
        return profileData;
    }

    /**
     * Clean preference fields by removing "Not specified" and "Any" values
     * Excludes relationship_type which is handled separately
     * @param {Object} profileData - The profile data object
     * @returns {Object} - Modified profile data
     */
    static cleanPreferenceFields(profileData) {
        const preferenceFieldsToClean = [
            'preferred_body_type', 'preferred_education', 'preferred_religion', 
            'preferred_smoking', 'preferred_drinking', 'preferred_children',
            'preferred_number_of_children',
            'preferred_gender', 'preferred_eye_color', 'preferred_hair_color', 
            'preferred_ethnicity', 'preferred_occupation', 'preferred_income', 
            'preferred_marital_status', 'preferred_lifestyle', 'preferred_body_art', 
            'preferred_english_ability'
        ];

        for (const fieldName of preferenceFieldsToClean) {
            if (profileData[fieldName] === 'Not specified' || 
                profileData[fieldName] === 'Any' || 
                profileData[fieldName] === '') {
                delete profileData[fieldName];
            }
        }

        return profileData;
    }

    /**
     * Process all profile data - cleans preferences and handles relationship_type
     * This is the main method to use - it handles relationship_type specially
     * so 'Any' gets saved as null instead of being deleted
     * 
     * @param {Object} profileData - The profile data object
     * @returns {Object} - Modified profile data
     */
    static process(profileData) {
        // Clean preference fields (excluding relationship_type)
        this.cleanPreferenceFields(profileData);
        
        // Handle relationship_type separately - convert 'Any' to null
        this.processRelationshipType(profileData);
        
        return profileData;
    }
}

module.exports = ProfileDataProcessor;














