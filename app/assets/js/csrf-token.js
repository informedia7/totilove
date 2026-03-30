/**
 * CSRF Token Manager (Full Production Version)
 * Cookie-based session + per-session CSRF
 * Safe URL token migration + robust fetch/XHR overrides
 */

(function () {
  'use strict';

  // -------------------------------
  // 1️⃣ Token Migration (URL -> Cookie)
  // -------------------------------
  (function migrateTokenToCookie() {
    try {
      const url = new URL(window.location.href);
      const urlToken = url.searchParams.get('token');

      if (urlToken && urlToken.length >= 32) { // Validate token length
        const existingCookie = document.cookie
          .split(';')
          .find(c => c.trim().startsWith('sessionToken='));

        if (!existingCookie) {
          const expiry = new Date();
          expiry.setTime(expiry.getTime() + 60 * 60 * 1000); // 1 hour
          // Note: httpOnly must be set server-side, not in JavaScript
          // This is a fallback for migration only
          const isSecure = window.location.protocol === 'https:';
          document.cookie = `sessionToken=${encodeURIComponent(urlToken)}; expires=${expiry.toUTCString()}; path=/; SameSite=Strict${isSecure ? '; Secure' : ''}`;
        }

        // Remove token from URL to prevent leaks
        url.searchParams.delete('token');
        window.history.replaceState({}, document.title, url.pathname + url.search);
      }
        } catch (e) {
          // Token migration skipped
        }
  })();

  // -------------------------------
  // 2️⃣ Internal State
  // -------------------------------
  let csrfToken = null;
  let tokenExpiry = null; // Track when token expires
  let tokenPromise = null;
  let initialized = false;
  let last429Error = null; // Track 429 errors to avoid retry loops

  const CSRF_HEADER = 'X-CSRF-Token';
  const CSRF_ENDPOINT = '/api/csrf-token';

  // -------------------------------
  // 3️⃣ Helpers
  // -------------------------------
  function isSameOrigin(url) {
    try {
      const u = new URL(url, window.location.origin);
      return u.origin === window.location.origin;
    } catch {
      return false;
    }
  }

  function isFetchableUrl(url) {
    return typeof url === 'string' && (
      url.startsWith('/') ||
      url.startsWith(window.location.origin)
    );
  }


  // -------------------------------
  // 4️⃣ CSRF Token Fetch
  // -------------------------------
  async function fetchCSRFToken(force = false, retries = 2) {
    // Check if we have a valid cached token (not expired and not forcing refresh)
    if (csrfToken && !force && tokenExpiry && tokenExpiry > Date.now()) {
      return csrfToken;
    }
    
    // If we recently got a 429 error, wait before retrying
    if (last429Error && Date.now() - last429Error < 5000) {
      // Wait until 5 seconds have passed since last 429
      await new Promise(resolve => setTimeout(resolve, 5000 - (Date.now() - last429Error)));
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(CSRF_ENDPOINT, {
          method: 'GET',
          credentials: 'same-origin',
          cache: 'no-store' // Prevent caching of CSRF tokens
        });

        if (!res.ok) {
          // If 401, session might be expired - don't retry
          if (res.status === 401) {
            csrfToken = null;
            tokenExpiry = null;
            throw new Error('Session expired - please log in again');
          }
          // If 429, track it and wait longer before retrying
          if (res.status === 429) {
            last429Error = Date.now();
            // Wait longer for 429 errors (exponential backoff)
            const waitTime = Math.min(1000 * Math.pow(2, attempt), 10000); // Max 10 seconds
            await new Promise(resolve => setTimeout(resolve, waitTime));
            throw new Error(`CSRF fetch failed: ${res.status}`);
          }
          throw new Error(`CSRF fetch failed: ${res.status}`);
        }

        let data;
        try {
          data = await res.json();
        } catch (e) {
          throw new Error('CSRF endpoint did not return JSON');
        }

        csrfToken = data?.csrfToken || null;

        if (!csrfToken) {
          throw new Error('CSRF token missing from response');
        }
        
        // Track token expiry (1 hour from now, or use expiresIn from response)
        const expiresIn = data?.expiresIn || 3600000; // Default 1 hour
        tokenExpiry = Date.now() + expiresIn;
        last429Error = null; // Clear 429 error on success

        return csrfToken;
      } catch (error) {
        lastError = error;
        // Retry with exponential backoff (except for 401)
        if (attempt < retries && !error.message.includes('Session expired')) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }
        csrfToken = null;
        tokenExpiry = null;
        throw error;
      }
    }
    
    csrfToken = null;
    tokenExpiry = null;
    throw lastError || new Error('CSRF fetch failed after retries');
  }

  function getCSRFToken(force = false) {
    if (!tokenPromise) {
      tokenPromise = fetchCSRFToken(force).finally(() => {
        tokenPromise = null;
      });
    }
    return tokenPromise;
  }

  // -------------------------------
  // 5️⃣ Fetch Override
  // -------------------------------
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async function (input, options = {}) {
    let normalizedOptions = { ...options };

    if (input instanceof Request) {
      const clonedOptions = {
        method: input.method,
        headers: Object.fromEntries(input.headers.entries()),
        body: input.body,
        mode: input.mode,
        credentials: input.credentials,
        cache: input.cache,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        integrity: input.integrity,
        keepalive: input.keepalive,
        signal: input.signal
      };

      if (options && Object.keys(options).length) {
        const overrideHeaders = options.headers instanceof Headers
          ? Object.fromEntries(options.headers.entries())
          : options.headers || {};
        normalizedOptions = {
          ...clonedOptions,
          ...options,
          headers: {
            ...clonedOptions.headers,
            ...overrideHeaders
          }
        };
      } else {
        normalizedOptions = clonedOptions;
      }

      input = input.url;
    }

    let url = '';
    if (typeof input === 'string') url = input;
    else if (input && typeof input === 'object' && input.url) url = input.url;

    if (!isFetchableUrl(url)) {
      return nativeFetch(input, normalizedOptions);
    }

    const method = (normalizedOptions.method || 'GET').toUpperCase();
    const needsCsrfHeader = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    if (isSameOrigin(url) && needsCsrfHeader) {
      const headerMap = normalizedOptions.headers instanceof Headers
        ? Object.fromEntries(normalizedOptions.headers.entries())
        : normalizedOptions.headers || {};

      headerMap[CSRF_HEADER] = await getCSRFToken();
      normalizedOptions.headers = headerMap;
      normalizedOptions.credentials = 'same-origin';
    } else if (isSameOrigin(url)) {
      normalizedOptions.credentials = normalizedOptions.credentials || 'same-origin';
    }

    const response = await nativeFetch(input, normalizedOptions);

    // Auto-refresh token if server rejects it and retry once with fresh token
    if ([403, 419].includes(response.status) && isSameOrigin(url)) {
      csrfToken = null;
      tokenExpiry = null;
      await getCSRFToken(true);

      if (needsCsrfHeader) {
        const retryHeaders = normalizedOptions.headers instanceof Headers
          ? Object.fromEntries(normalizedOptions.headers.entries())
          : normalizedOptions.headers || {};
        retryHeaders[CSRF_HEADER] = csrfToken;
        normalizedOptions.headers = retryHeaders;
      }

      return nativeFetch(input, normalizedOptions);
    }

    return response;
  };

  // -------------------------------
  // 6️⃣ XHR Override
  // -------------------------------
  const nativeXHROpen = XMLHttpRequest.prototype.open;
  const nativeXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this._csrfMethod = method.toUpperCase();
    this._csrfURL = url;
    return nativeXHROpen.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = async function (body) {
    if (
      isSameOrigin(this._csrfURL) &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(this._csrfMethod)
    ) {
          try {
            this.setRequestHeader(CSRF_HEADER, await getCSRFToken());
          } catch (e) {
            // Failed to set CSRF header
          }
    }
    return nativeXHRSend.call(this, body);
  };

  // -------------------------------
  // 7️⃣ Initialization
  // -------------------------------
  function init() {
    if (initialized) return;
    initialized = true;
    getCSRFToken();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // -------------------------------
  // 8️⃣ Debug Helpers
  // -------------------------------
  window.__CSRF__ = {
    refresh: () => getCSRFToken(true),
    get: () => csrfToken
  };
})();
