/**
 * PostCSS Configuration
 * 
 * CSS processing: Autoprefixer, CSSnano
 * Migration Phase 3: Week 10
 */

module.exports = {
  plugins: {
    autoprefixer: {
      overrideBrowserslist: [
        '> 1%',
        'last 2 versions',
        'not dead',
        'iOS >= 12',
        'Android >= 8'
      ]
    },
    cssnano: process.env.NODE_ENV === 'production' ? {
      preset: ['default', {
        discardComments: { removeAll: true },
        normalizeWhitespace: true,
        minifyFontValues: true,
        minifySelectors: true,
      }]
    } : false
  }
};


