/**
 * DUAL MEASUREMENT SYSTEM UTILITIES
 * Handles conversion between metric and imperial systems
 */

class MeasurementConverter {
    constructor() {
        this.systems = {
            metric: {
                height: 'cm',
                weight: 'kg',
                temperature: 'celsius',
                distance: 'km'
            },
            imperial: {
                height: 'ft_in',
                weight: 'lbs',
                temperature: 'fahrenheit',
                distance: 'miles'
            }
        };
        
        this.heightRanges = {
            metric: { min: 120, max: 220 }, // cm
            imperial: { min: 4, max: 7 }     // feet
        };
        
        this.weightRanges = {
            metric: { min: 30, max: 200 },   // kg
            imperial: { min: 66, max: 440 }  // lbs
        };
    }

    // ==================== HEIGHT CONVERSIONS ====================

    /**
     * Convert centimeters to feet and inches
     * @param {number} cm - Height in centimeters
     * @returns {object} - {feet: number, inches: number}
     */
    cmToFeetInches(cm) {
        if (!cm || cm <= 0) return { feet: 0, inches: 0 };
        
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches % 12);
        
        return { feet, inches };
    }

    /**
     * Convert feet and inches to centimeters
     * @param {number} feet - Height in feet
     * @param {number} inches - Additional inches
     * @returns {number} - Height in centimeters
     */
    feetInchesToCm(feet, inches = 0) {
        if (!feet || feet < 0) return 0;
        return Math.round((feet * 12 + inches) * 2.54);
    }

    /**
     * Format height display based on user preference
     * @param {number} cm - Height in centimeters
     * @param {string} format - 'cm', 'ft_in', or 'inches'
     * @returns {string} - Formatted height string
     */
    formatHeight(cm, format = 'cm') {
        if (!cm || cm <= 0) return 'Not specified';
        
        switch (format) {
            case 'ft_in':
                const { feet, inches } = this.cmToFeetInches(cm);
                return `${feet}'${inches}"`;
            
            case 'inches':
                const totalInches = Math.round(cm / 2.54);
                return `${totalInches} inches`;
            
            case 'cm':
            default:
                return `${cm} cm`;
        }
    }

    // ==================== WEIGHT CONVERSIONS ====================

    /**
     * Convert kilograms to pounds
     * @param {number} kg - Weight in kilograms
     * @returns {number} - Weight in pounds
     */
    kgToLbs(kg) {
        if (!kg || kg <= 0) return 0;
        return Math.round(kg * 2.20462);
    }

    /**
     * Convert pounds to kilograms
     * @param {number} lbs - Weight in pounds
     * @returns {number} - Weight in kilograms
     */
    lbsToKg(lbs) {
        if (!lbs || lbs <= 0) return 0;
        return Math.round(lbs / 2.20462);
    }

    /**
     * Convert pounds to stone and pounds (UK system)
     * @param {number} lbs - Weight in pounds
     * @returns {object} - {stone: number, pounds: number}
     */
    lbsToStone(lbs) {
        if (!lbs || lbs <= 0) return { stone: 0, pounds: 0 };
        
        const stone = Math.floor(lbs / 14);
        const pounds = lbs % 14;
        
        return { stone, pounds };
    }

    /**
     * Format weight display based on user preference
     * @param {number} kg - Weight in kilograms
     * @param {string} format - 'kg', 'lbs', or 'stone_lbs'
     * @returns {string} - Formatted weight string
     */
    formatWeight(kg, format = 'kg') {
        if (!kg || kg <= 0) return 'Not specified';
        
        switch (format) {
            case 'lbs':
                const lbs = this.kgToLbs(kg);
                return `${lbs} lbs`;
            
            case 'stone_lbs':
                const lbsForStone = this.kgToLbs(kg);
                const { stone, pounds } = this.lbsToStone(lbsForStone);
                return stone > 0 ? `${stone} st ${pounds} lbs` : `${pounds} lbs`;
            
            case 'kg':
            default:
                return `${kg} kg`;
        }
    }

    // ==================== TEMPERATURE CONVERSIONS ====================

    /**
     * Convert Celsius to Fahrenheit
     * @param {number} celsius - Temperature in Celsius
     * @returns {number} - Temperature in Fahrenheit
     */
    celsiusToFahrenheit(celsius) {
        return Math.round((celsius * 9/5) + 32);
    }

    /**
     * Convert Fahrenheit to Celsius
     * @param {number} fahrenheit - Temperature in Fahrenheit
     * @returns {number} - Temperature in Celsius
     */
    fahrenheitToCelsius(fahrenheit) {
        return Math.round((fahrenheit - 32) * 5/9);
    }

    // ==================== USER PREFERENCE DETECTION ====================

    /**
     * Detect user's likely measurement preference based on location
     * @param {string} countryCode - ISO country code
     * @returns {string} - 'metric' or 'imperial'
     */
    detectPreferredSystem(countryCode) {
        const imperialCountries = ['US', 'LR', 'MM']; // USA, Liberia, Myanmar
        const mixedCountries = ['GB', 'CA']; // UK, Canada (mixed usage)
        
        if (imperialCountries.includes(countryCode)) {
            return 'imperial';
        }
        
        return 'metric'; // Default for most countries
    }

    /**
     * Get measurement preferences for a country
     * @param {string} countryCode - ISO country code
     * @returns {object} - Measurement preferences object
     */
    getCountryPreferences(countryCode) {
        switch (countryCode) {
            case 'US':
                return {
                    system: 'imperial',
                    height: 'ft_in',
                    weight: 'lbs',
                    temperature: 'fahrenheit',
                    distance: 'miles'
                };
            
            case 'GB':
                return {
                    system: 'imperial',
                    height: 'ft_in',
                    weight: 'stone_lbs',
                    temperature: 'celsius',
                    distance: 'miles'
                };
            
            case 'CA':
                return {
                    system: 'metric',
                    height: 'cm',
                    weight: 'kg',
                    temperature: 'celsius',
                    distance: 'km'
                };
            
            default:
                return {
                    system: 'metric',
                    height: 'cm',
                    weight: 'kg',
                    temperature: 'celsius',
                    distance: 'km'
                };
        }
    }

    // ==================== VALIDATION ====================

    /**
     * Validate height input based on system
     * @param {number|object} height - Height value or {feet, inches} object
     * @param {string} system - 'metric' or 'imperial'
     * @returns {boolean} - Is valid height
     */
    validateHeight(height, system = 'metric') {
        if (system === 'metric') {
            return height >= this.heightRanges.metric.min && height <= this.heightRanges.metric.max;
        } else {
            if (typeof height === 'object') {
                const { feet, inches = 0 } = height;
                return feet >= this.heightRanges.imperial.min && 
                       feet <= this.heightRanges.imperial.max && 
                       inches >= 0 && inches < 12;
            }
            return false;
        }
    }

    /**
     * Validate weight input based on system
     * @param {number} weight - Weight value
     * @param {string} system - 'metric' or 'imperial'
     * @returns {boolean} - Is valid weight
     */
    validateWeight(weight, system = 'metric') {
        if (system === 'metric') {
            return weight >= this.weightRanges.metric.min && weight <= this.weightRanges.metric.max;
        } else {
            return weight >= this.weightRanges.imperial.min && weight <= this.weightRanges.imperial.max;
        }
    }

    // ==================== UI HELPERS ====================

    /**
     * Generate height options for dropdown/select
     * @param {string} system - 'metric' or 'imperial'
     * @returns {array} - Array of height options
     */
    generateHeightOptions(system = 'metric') {
        const options = [];
        
        if (system === 'metric') {
            for (let cm = this.heightRanges.metric.min; cm <= this.heightRanges.metric.max; cm++) {
                const { feet, inches } = this.cmToFeetInches(cm);
                options.push({
                    value: cm,
                    label: `${cm} cm`,
                    imperial: `${feet}'${inches}"`
                });
            }
        } else {
            for (let feet = this.heightRanges.imperial.min; feet <= this.heightRanges.imperial.max; feet++) {
                for (let inches = 0; inches < 12; inches++) {
                    const cm = this.feetInchesToCm(feet, inches);
                    options.push({
                        value: { feet, inches },
                        label: `${feet}'${inches}"`,
                        metric: `${cm} cm`
                    });
                }
            }
        }
        
        return options;
    }

    /**
     * Generate weight options for dropdown/select
     * @param {string} system - 'metric' or 'imperial'
     * @param {number} step - Step size for increments
     * @returns {array} - Array of weight options
     */
    generateWeightOptions(system = 'metric', step = 1) {
        const options = [];
        
        if (system === 'metric') {
            for (let kg = this.weightRanges.metric.min; kg <= this.weightRanges.metric.max; kg += step) {
                const lbs = this.kgToLbs(kg);
                options.push({
                    value: kg,
                    label: `${kg} kg`,
                    imperial: `${lbs} lbs`
                });
            }
        } else {
            const stepLbs = step === 1 ? 5 : step; // Default to 5 lbs increments for imperial
            for (let lbs = this.weightRanges.imperial.min; lbs <= this.weightRanges.imperial.max; lbs += stepLbs) {
                const kg = this.lbsToKg(lbs);
                options.push({
                    value: lbs,
                    label: `${lbs} lbs`,
                    metric: `${kg} kg`
                });
            }
        }
        
        return options;
    }

    /**
     * Create dual display string showing both systems
     * @param {number} cm - Height in cm
     * @param {number} kg - Weight in kg
     * @returns {object} - Both metric and imperial displays
     */
    createDualDisplay(cm, kg) {
        return {
            height: {
                metric: this.formatHeight(cm, 'cm'),
                imperial: this.formatHeight(cm, 'ft_in')
            },
            weight: {
                metric: this.formatWeight(kg, 'kg'),
                imperial: this.formatWeight(kg, 'lbs')
            }
        };
    }
}

// Export for use in both Node.js and browser environments
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MeasurementConverter;
} else if (typeof window !== 'undefined') {
    window.MeasurementConverter = MeasurementConverter;
}

// Usage Examples:
/*
const converter = new MeasurementConverter();

// Convert 180cm to feet/inches
const height = converter.cmToFeetInches(180); // {feet: 5, inches: 11}

// Convert 70kg to pounds
const weight = converter.kgToLbs(70); // 154 lbs

// Format for display
const heightDisplay = converter.formatHeight(180, 'ft_in'); // "5'11""
const weightDisplay = converter.formatWeight(70, 'lbs'); // "154 lbs"

// Validate measurements
const isValidHeight = converter.validateHeight(180, 'metric'); // true
const isValidWeight = converter.validateWeight(70, 'metric'); // true

// Get country preferences
const usPrefs = converter.getCountryPreferences('US');
// {system: 'imperial', height: 'ft_in', weight: 'lbs', temperature: 'fahrenheit'}

// Generate options for UI
const heightOptions = converter.generateHeightOptions('metric');
const weightOptions = converter.generateWeightOptions('imperial', 5);
*/
