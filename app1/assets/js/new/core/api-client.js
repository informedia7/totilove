/**
 * API Client
 * 
 * Centralized API calls with CSRF token handling
 * Uses existing CSRF token system from csrf-token.js
 * Migration Phase 2: Week 5
 */

/**
 * API Client class for making authenticated API requests
 * Automatically handles CSRF tokens via the global fetch override
 */
export class ApiClient {
    constructor(baseURL = '/api') {
        this.baseURL = baseURL;
    }
    
    /**
     * Get CSRF token (uses existing global system)
     * @returns {Promise<string>} CSRF token
     */
    async getCSRFToken() {
        // Use existing global CSRF token system if available
        if (typeof window.getCSRFToken === 'function') {
            return await window.getCSRFToken();
        }
        
        // Fallback: try to get from meta tag
        const metaTag = document.querySelector('meta[name="csrf-token"]');
        if (metaTag) {
            return metaTag.content;
        }
        
        // Fallback: fetch from API
        try {
            const response = await fetch('/api/csrf-token', {
                method: 'GET',
                credentials: 'same-origin',
                cache: 'no-store'
            });
            
            if (response.ok) {
                const data = await response.json();
                return data?.csrfToken || null;
            }
        } catch (error) {
            console.warn('Failed to fetch CSRF token:', error);
        }
        
        return null;
    }
    
    /**
     * Build full URL from endpoint
     * @param {string} endpoint - API endpoint
     * @returns {string} Full URL
     */
    buildUrl(endpoint) {
        if (endpoint.startsWith('http')) {
            return endpoint;
        }
        return `${this.baseURL}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;
    }
    
    /**
     * Make API request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async request(endpoint, options = {}) {
        const url = this.buildUrl(endpoint);
        
        const defaultOptions = {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
        };
        
        // Merge options
        const requestOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {}),
            },
        };
        
        // CSRF token is automatically added by csrf-token.js fetch override
        // But we can also add it explicitly for safety
        const method = (requestOptions.method || 'GET').toUpperCase();
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
            const csrfToken = await this.getCSRFToken();
            if (csrfToken) {
                requestOptions.headers['X-CSRF-Token'] = csrfToken;
            }
        }
        
        const response = await fetch(url, requestOptions);
        
        // Handle token refresh on 403/419
        if ([403, 419].includes(response.status)) {
            // Token might be expired, try to refresh
            await this.getCSRFToken();
        }
        
        return response;
    }
    
    /**
     * GET request
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async get(endpoint, params = {}, options = {}) {
        const url = new URL(this.buildUrl(endpoint), window.location.origin);
        
        // Add query parameters
        Object.keys(params).forEach(key => {
            if (params[key] != null) {
                url.searchParams.append(key, params[key]);
            }
        });
        
        return this.request(url.pathname + url.search, {
            ...options,
            method: 'GET',
        });
    }
    
    /**
     * POST request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async post(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'POST',
            body: JSON.stringify(data),
        });
    }
    
    /**
     * PUT request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async put(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }
    
    /**
     * PATCH request
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async patch(endpoint, data = {}, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'PATCH',
            body: JSON.stringify(data),
        });
    }
    
    /**
     * DELETE request
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Response>} Fetch response
     */
    async delete(endpoint, options = {}) {
        return this.request(endpoint, {
            ...options,
            method: 'DELETE',
        });
    }
    
    /**
     * Handle JSON response
     * @param {Response} response - Fetch response
     * @returns {Promise<Object>} Parsed JSON data
     */
    async handleJsonResponse(response) {
        if (!response.ok) {
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
            }
            throw new Error(errorData.message || `HTTP ${response.status}`);
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            return await response.json();
        }
        
        return await response.text();
    }
    
    /**
     * GET request with JSON parsing
     * @param {string} endpoint - API endpoint
     * @param {Object} params - Query parameters
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Parsed JSON data
     */
    async getJson(endpoint, params = {}, options = {}) {
        const response = await this.get(endpoint, params, options);
        return this.handleJsonResponse(response);
    }
    
    /**
     * POST request with JSON parsing
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Parsed JSON data
     */
    async postJson(endpoint, data = {}, options = {}) {
        const response = await this.post(endpoint, data, options);
        return this.handleJsonResponse(response);
    }
    
    /**
     * PUT request with JSON parsing
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Parsed JSON data
     */
    async putJson(endpoint, data = {}, options = {}) {
        const response = await this.put(endpoint, data, options);
        return this.handleJsonResponse(response);
    }
    
    /**
     * PATCH request with JSON parsing
     * @param {string} endpoint - API endpoint
     * @param {Object} data - Request body data
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Parsed JSON data
     */
    async patchJson(endpoint, data = {}, options = {}) {
        const response = await this.patch(endpoint, data, options);
        return this.handleJsonResponse(response);
    }
    
    /**
     * DELETE request with JSON parsing
     * @param {string} endpoint - API endpoint
     * @param {Object} options - Additional fetch options
     * @returns {Promise<Object>} Parsed JSON data
     */
    async deleteJson(endpoint, options = {}) {
        const response = await this.delete(endpoint, options);
        return this.handleJsonResponse(response);
    }
}

// Export singleton instance
export const apiClient = new ApiClient();
