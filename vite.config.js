/**
 * Vite Configuration
 * 
 * Build system for bundling, minification, and code splitting
 * Migration Phase 3: Week 10
 * 
 * Note: This is a template configuration. Actual entry points will be created
 * as pages are migrated to the new architecture.
 */

import { defineConfig } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  // Base public path
  base: '/',
  
  // Build configuration
  build: {
    // Output directory
    outDir: 'dist',
    
    // Source maps for debugging (disabled in production)
    sourcemap: process.env.NODE_ENV !== 'production',
    
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: process.env.NODE_ENV === 'production',
        drop_debugger: true,
      },
    },
    
    // Code splitting
    rollupOptions: {
      input: {
        // Main entry point (will be created)
        // main: resolve(__dirname, 'app/assets/js/new/main.js'),
      },
      
      output: {
        // Manual chunks for code splitting
        manualChunks(id) {
          // Vendor chunks
          if (id.includes('node_modules')) {
            return 'vendor';
          }
          
          // Core utilities chunk
          if (id.includes('app/assets/js/new/core')) {
            return 'core';
          }
          
          // Components chunk
          if (id.includes('app/assets/js/new/components')) {
            return 'components';
          }
        },
        
        // File naming
        entryFileNames: 'js/[name]-[hash].js',
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'css/[name]-[hash][extname]';
          }
          return 'assets/[name]-[hash][extname]';
        },
      },
    },
    
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000,
    
    // CSS code splitting
    cssCodeSplit: true,
    
    // Target browsers
    target: ['es2015', 'edge88', 'firefox78', 'chrome87', 'safari14'],
  },
  
  // Development server (for testing)
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  
  // CSS configuration (uses postcss.config.js)
  css: {
    postcss: './postcss.config.js',
  },
  
  // Resolve configuration
  resolve: {
    alias: {
      '@': resolve(__dirname, 'app/assets/js/new'),
      '@core': resolve(__dirname, 'app/assets/js/new/core'),
      '@components': resolve(__dirname, 'app/assets/js/new/components'),
      '@utils': resolve(__dirname, 'app/assets/js/new/utils'),
      '@pages': resolve(__dirname, 'app/assets/js/new/pages'),
    },
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [],
  },
});

