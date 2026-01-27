const fs = require('fs');
const path = require('path');

const TEMPLATE_DEBUG = (
    process.env.TEMPLATE_DEBUG === 'true' ||
    process.env.DEBUG_TEMPLATES === 'true'
);

class TemplateUtils {
    constructor() {}

    async processTemplateIncludes(content, variables = {}) {
        const includeRegex = /\{\{include:([^}]+)\}\}/g;
        let match;
        
        while ((match = includeRegex.exec(content)) !== null) {
            const componentName = match[1];
            const componentPath = path.join(__dirname, '..', 'app', 'components', `${componentName}.html`);
            
            if (fs.existsSync(componentPath)) {
                const componentContent = fs.readFileSync(componentPath, 'utf8');
                // Process variables in the included component
                const processedComponentContent = this.processTemplateVariables(componentContent, variables);
                content = content.replace(match[0], processedComponentContent);
            } else {
                content = content.replace(match[0], `<!-- Component ${componentName} not found -->`);
            }
        }
        
        return content;
    }

    processTemplateVariables(content, variables) {
        // Process simple variables
        Object.entries(variables).forEach(([key, value]) => {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            const beforeCount = (content.match(regex) || []).length;
            const replacementValue = (value !== undefined && value !== null) ? String(value) : '';
            content = content.replace(regex, replacementValue);
            const afterCount = (content.match(regex) || []).length;
            if (beforeCount > 0 && TEMPLATE_DEBUG) {
                console.log(`[TEMPLATE] Replaced ${beforeCount} instances of {{${key}}} with:`, JSON.stringify(replacementValue));
            }
        });
        
        // Final pass: Replace any remaining {{variable}} patterns with empty string (safety fallback)
        const remainingVarsRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const remainingMatches = content.match(remainingVarsRegex);
        if (remainingMatches && remainingMatches.length > 0) {
            console.warn(`[TEMPLATE] Warning: ${remainingMatches.length} unreplaced template variables found:`, remainingMatches);
            // Optionally replace with empty string
            content = content.replace(remainingVarsRegex, '');
        }

        // Process conditionals
        const ifRegex = /\{\{if:([^}]+)\}\}(.*?)\{\{\/if\}\}/gs;
        const ifElseRegex = /\{\{if:([^}]+)\}\}(.*?)\{\{else\}\}(.*?)\{\{\/if\}\}/gs;

        // Process if-else first
        content = content.replace(ifElseRegex, (match, condition, ifContent, elseContent) => {
            return this.evaluateCondition(condition, variables) ? ifContent : elseContent;
        });

        // Process simple if
        content = content.replace(ifRegex, (match, condition, ifContent) => {
            return this.evaluateCondition(condition, variables) ? ifContent : '';
        });

        // Process foreach loops
        const foreachRegex = /\{\{foreach:([^}]+)\}\}(.*?)\{\{\/foreach\}\}/gs;
        content = content.replace(foreachRegex, (match, arrayName, loopContent) => {
            const array = variables[arrayName];
            if (!Array.isArray(array)) return '';

            return array.map((item, index) => {
                let itemContent = loopContent;
                Object.entries(item).forEach(([key, value]) => {
                    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                    itemContent = itemContent.replace(regex, value || '');
                });
                return itemContent;
            }).join('');
        });

        return content;
    }

    evaluateCondition(condition, variables) {
        const parts = condition.split('==');
        if (parts.length === 2) {
            const left = variables[parts[0].trim()] || '';
            const right = parts[1].trim();
            return left.toString() === right;
        }

        // Check if variable exists and is truthy
        const value = variables[condition.trim()];
        return Boolean(value);
    }

    getRelativeTime(date) {
        const now = new Date();
        const diffMs = now - new Date(date);
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'just now';
        if (diffMins < 60) return `${diffMins} minutes ago`;
        if (diffHours < 24) return `${diffHours} hours ago`;
        if (diffDays < 7) return `${diffDays} days ago`;
        return new Date(date).toLocaleDateString();
    }

    calculateAge(birthdate) {
        if (!birthdate) return null;
        
        const today = new Date();
        const birthDate = new Date(birthdate);
        let age = today.getFullYear() - birthDate.getFullYear();
        const monthDiff = today.getMonth() - birthDate.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    }

    // Format height in a friendly string, e.g., "162 cm (5'4")"
    formatHeight(heightCm) {
        if (!heightCm || isNaN(heightCm)) return '';
        const cm = Number(heightCm);
        const totalInches = cm / 2.54;
        const feet = Math.floor(totalInches / 12);
        const inches = Math.round(totalInches - feet * 12);
        return `${cm} cm (${feet}'${inches}")`;
    }



    formatGenderIcon(gender) {
        if (!gender) return 'Not specified';
        
        const genderLower = gender.toLowerCase();
        
        switch (genderLower) {
            case 'female':
            case 'f':
                return '<i class="fas fa-venus" style="color: #e91e63; font-size: 1.2em;" title="Female"></i>';
            case 'male':
            case 'm':
                return '<i class="fas fa-mars" style="color: #2196f3; font-size: 1.2em;" title="Male"></i>';
            default:
                return gender; // Return original text if not recognized
        }
    }
}

module.exports = TemplateUtils; 