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

function parseBoolean(value, defaultValue = false) {
  if (value === undefined) {
    return defaultValue;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
    return true;
  }
  if (normalized === 'false' || normalized === '0' || normalized === 'no') {
    return false;
  }
  return defaultValue;
}

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
    ? process.env.NEW_ARCH_PAGES.split(',').map((p) => p.trim())
    : [],

  // Enable all new features (for testing)
  enableAll: process.env.ENABLE_ALL_NEW === 'true',

  // Presence infrastructure toggles
  presence: {
    redisEnabled: parseBoolean(process.env.PRESENCE_REDIS_ENABLED, true),
    streamingEnabled: parseBoolean(process.env.PRESENCE_STREAMING_ENABLED, true),
    sseFallbackEnabled: parseBoolean(process.env.PRESENCE_SSE_FALLBACK_ENABLED, true),
    monitoringEnabled: parseBoolean(process.env.PRESENCE_MONITORING_ENABLED, false),
    socketEnabled: parseBoolean(process.env.PRESENCE_SOCKET_ENABLED, true)
  },

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

  isPresenceRedisEnabled() {
    return this.enableAll || this.presence.redisEnabled !== false;
  },

  isPresenceStreamingEnabled() {
    if (!this.isPresenceRedisEnabled()) {
      return false;
    }
    return this.enableAll || this.presence.streamingEnabled !== false;
  },

  isPresenceSocketEnabled() {
    return this.enableAll || this.presence.socketEnabled !== false;
  },

  getPresenceFlags() {
    return {
      redisEnabled: this.isPresenceRedisEnabled(),
      streamingEnabled: this.isPresenceStreamingEnabled(),
      socketEnabled: this.isPresenceSocketEnabled(),
      sseFallbackEnabled: this.presence.sseFallbackEnabled !== false,
      monitoringEnabled: this.presence.monitoringEnabled === true,
      enableAll: this.enableAll
    };
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
      enableAll: this.enableAll,
      presence: this.getPresenceFlags()
    };
  }
};




