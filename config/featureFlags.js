/**
 * Feature Flags Configuration
 * 
 * Controls which new architecture features are enabled.
 * Set via environment variables for easy rollback.
 * 
 * Usage:
 *   USE_NEW_CSS=true node server.js
 *   USE_NEW_JS=true USE_NEW_CSS=true node server.js
 */

module.exports = {
  // New CSS architecture (disabled by default)
  useNewCSS: process.env.USE_NEW_CSS === 'true',
  
  // New JavaScript architecture (disabled by default)
  useNewJS: process.env.USE_NEW_JS === 'true',
  
  // New component system (disabled by default)
  useNewComponents: process.env.USE_NEW_COMPONENTS === 'true',
  
  // Specific pages using new architecture (comma-separated)
  // Example: NEW_ARCH_PAGES=results.html,matches.html
  newArchitecturePages: process.env.NEW_ARCH_PAGES 
    ? process.env.NEW_ARCH_PAGES.split(',').map(p => p.trim())
    : [],
  
  // Enable all new features (for testing)
  enableAll: process.env.ENABLE_ALL_NEW === 'true',
  
  /**
   * Check if a specific page should use new architecture
   * @param {string} pageName - Name of the page (e.g., 'results.html')
   * @returns {boolean}
   */
  shouldUseNewArch(pageName) {
    if (this.enableAll) return true;
    if (this.newArchitecturePages.length === 0) return false;
    return this.newArchitecturePages.includes(pageName);
  },
  
  /**
   * Get feature flag status (for debugging)
   * @returns {object}
   */
  getStatus() {
    return {
      useNewCSS: this.useNewCSS,
      useNewJS: this.useNewJS,
      useNewComponents: this.useNewComponents,
      newArchitecturePages: this.newArchitecturePages,
      enableAll: this.enableAll
    };
  }
};


