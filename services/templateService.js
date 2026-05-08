const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const redisManager = require('../config/redis');

class TemplateService {
    constructor() {
        this.templateCache = new Map();
        this.layoutCache = new Map();
        this.componentCache = new Map();
        this.cacheEnabled = config.template.cacheEnabled;
        this.cacheDuration = config.template.cacheDuration;
    }

    // Load template from file
    async loadTemplate(templateName, templateType = 'pages') {
        const cacheKey = `${templateType}:${templateName}`;
        
        // Check cache first
        if (this.cacheEnabled && this.templateCache.has(cacheKey)) {
            const cached = this.templateCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheDuration) {
                return cached.content;
            }
        }

        // Determine template path
        let templatePath;
        switch (templateType) {
            case 'pages':
                templatePath = path.join(config.template.pagesPath, `${templateName}.html`);
                break;
            case 'layouts':
                templatePath = path.join(config.template.layoutsPath, `${templateName}.html`);
                break;
            case 'components':
                templatePath = path.join(config.template.componentsPath, `${templateName}.html`);
                break;
            default:
                templatePath = path.join(config.template.basePath, templateType, `${templateName}.html`);
        }

        try {
            const content = await fs.readFile(templatePath, 'utf8');
            
            // Cache the template
            if (this.cacheEnabled) {
                this.templateCache.set(cacheKey, {
                    content,
                    timestamp: Date.now()
                });
            }
            
            return content;
        } catch (error) {
            console.error(`❌ Error loading template ${templateName}:`, error);
            throw new Error(`Template not found: ${templateName}`);
        }
    }

    // Process template variables
    processTemplateVariables(template, variables = {}) {
        let processedTemplate = template;
        
        // Process {{variable}} syntax
        const variableRegex = /\{\{([^}]+)\}\}/g;
        processedTemplate = processedTemplate.replace(variableRegex, (match, variable) => {
            const trimmedVar = variable.trim();
            
            // Handle nested object properties (e.g., user.name)
            const parts = trimmedVar.split('.');
            let value = variables;
            
            for (const part of parts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    value = undefined;
                    break;
                }
            }
            
            return value !== undefined ? value : match;
        });

        // Process {{#if condition}}...{{/if}} blocks
        const ifRegex = /\{\{#if\s+([^}]+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
        processedTemplate = processedTemplate.replace(ifRegex, (match, condition, content) => {
            const trimmedCondition = condition.trim();
            const parts = trimmedCondition.split('.');
            let value = variables;
            
            for (const part of parts) {
                if (value && typeof value === 'object' && part in value) {
                    value = value[part];
                } else {
                    value = undefined;
                    break;
                }
            }
            
            return value ? content : '';
        });

        // Process {{#each array}}...{{/each}} loops
        const eachRegex = /\{\{#each\s+([^}]+)\}\}([\s\S]*?)\{\{\/each\}\}/g;
        processedTemplate = processedTemplate.replace(eachRegex, (match, arrayName, content) => {
            const trimmedArrayName = arrayName.trim();
            const parts = trimmedArrayName.split('.');
            let array = variables;
            
            for (const part of parts) {
                if (array && typeof array === 'object' && part in array) {
                    array = array[part];
                } else {
                    array = undefined;
                    break;
                }
            }
            
            if (!Array.isArray(array)) {
                return '';
            }
            
            return array.map(item => {
                let itemContent = content;
                const itemRegex = /\{\{([^}]+)\}\}/g;
                itemContent = itemContent.replace(itemRegex, (match, variable) => {
                    const trimmedVar = variable.trim();
                    const parts = trimmedVar.split('.');
                    let value = item;
                    
                    for (const part of parts) {
                        if (value && typeof value === 'object' && part in value) {
                            value = value[part];
                        } else {
                            value = undefined;
                            break;
                        }
                    }
                    
                    return value !== undefined ? value : match;
                });
                return itemContent;
            }).join('');
        });

        return processedTemplate;
    }

    // Render a template with variables
    async renderTemplate(templateName, variables = {}, templateType = 'pages') {
        try {
            console.log(`🎨 Rendering template: ${templateName}`);
            
            // Load template
            let template = await this.loadTemplate(templateName, templateType);
            
            // Process variables
            template = this.processTemplateVariables(template, variables);
            
            return template;
        } catch (error) {
            console.error(`❌ Error rendering template ${templateName}:`, error);
            throw error;
        }
    }

    // Render template with layout
    async renderTemplateWithLayout(templateName, variables = {}, layoutName = 'layout') {
        try {
            console.log(`🎨 Rendering template with layout: ${templateName} for authenticated user: ${variables.user?.id || 'anonymous'}`);
            
            // Load template and layout
            const [template, layout] = await Promise.all([
                this.loadTemplate(templateName, 'pages'),
                this.loadTemplate(layoutName, 'layouts')
            ]);
            
            // Process template variables
            const processedTemplate = this.processTemplateVariables(template, variables);
            
            // Insert template into layout
            const finalTemplate = this.processTemplateVariables(layout, {
                ...variables,
                content: processedTemplate
            });
            
            return finalTemplate;
        } catch (error) {
            console.error(`❌ Error rendering template with layout ${templateName}:`, error);
            throw error;
        }
    }

    // Render a component
    async renderComponent(componentName, variables = {}) {
        try {
            const component = await this.loadTemplate(componentName, 'components');
            return this.processTemplateVariables(component, variables);
        } catch (error) {
            console.error(`❌ Error rendering component ${componentName}:`, error);
            return ''; // Return empty string for missing components
        }
    }

    // Clear template cache
    clearCache() {
        this.templateCache.clear();
        this.layoutCache.clear();
        this.componentCache.clear();
        console.log('🧹 Template cache cleared');
    }

    // Get cache statistics
    getCacheStats() {
        return {
            templateCacheSize: this.templateCache.size,
            layoutCacheSize: this.layoutCache.size,
            componentCacheSize: this.componentCache.size,
            cacheEnabled: this.cacheEnabled,
            cacheDuration: this.cacheDuration
        };
    }

    // Preload common templates
    async preloadTemplates() {
        const commonTemplates = [
            'layout',
            'login',
            'register',
            'profile-full',
            'profile-basic',
            'messages',
            'search',
            'results',
            'matches',
            'settings',
            'activity'
        ];

        console.log('🔄 Preloading common templates...');
        
        for (const template of commonTemplates) {
            try {
                await this.loadTemplate(template, 'pages');
            } catch (error) {
                console.warn(`⚠️ Could not preload template: ${template}`);
            }
        }
        
        console.log('✅ Template preloading completed');
    }

    // Validate template syntax
    validateTemplate(template) {
        const errors = [];
        
        // Check for unclosed tags
        const openTags = template.match(/\{\{#if\s+[^}]+\}\}/g) || [];
        const closeTags = template.match(/\{\{\/if\}\}/g) || [];
        
        if (openTags.length !== closeTags.length) {
            errors.push('Mismatched if/endif tags');
        }
        
        // Check for unclosed each loops
        const openEach = template.match(/\{\{#each\s+[^}]+\}\}/g) || [];
        const closeEach = template.match(/\{\{\/each\}\}/g) || [];
        
        if (openEach.length !== closeEach.length) {
            errors.push('Mismatched each/endeach tags');
        }
        
        return errors;
    }

    // Get available templates
    async getAvailableTemplates() {
        try {
            const templates = {
                pages: [],
                layouts: [],
                components: []
            };
            
            // Scan template directories
            for (const [type, dirPath] of Object.entries({
                pages: config.template.pagesPath,
                layouts: config.template.layoutsPath,
                components: config.template.componentsPath
            })) {
                try {
                    const files = await fs.readdir(dirPath);
                    templates[type] = files
                        .filter(file => file.endsWith('.html'))
                        .map(file => file.replace('.html', ''));
                } catch (error) {
                    console.warn(`⚠️ Could not read ${type} directory:`, error);
                }
            }
            
            return templates;
        } catch (error) {
            console.error('❌ Error getting available templates:', error);
            return { pages: [], layouts: [], components: [] };
        }
    }
}

// Singleton instance
const templateService = new TemplateService();

module.exports = templateService; 