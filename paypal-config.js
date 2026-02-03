// PayPal Configuration
// Get your Client ID from: https://developer.paypal.com/dashboard/
//
// SECURITY: Credentials should be set in one of these ways:
// 1. Create paypal-config.local.js (gitignored) - Recommended for development
// 2. Set environment variables in Vercel (accessed via /api/paypal-config.js)
// 3. Use placeholder values below (will show error if not configured)

// Load local configuration if available (from paypal-config.local.js)
const PAYPAL_LOCAL_CONFIG = (typeof window !== 'undefined' && window.PAYPAL_LOCAL_CONFIG)
    ? window.PAYPAL_LOCAL_CONFIG
    : {};

// Store for API-loaded config (from Vercel serverless function)
let PAYPAL_API_CONFIG = null;
let PAYPAL_CONFIG_LOADING = false;
let PAYPAL_CONFIG_LOADED = false;

// Store for exchange rate (cached)
let EXCHANGE_RATE_CACHE = null;
let EXCHANGE_RATE_LOADING = false;
let EXCHANGE_RATE_LAST_FETCH = null;
const EXCHANGE_RATE_CACHE_DURATION = 3600000; // 1 hour in milliseconds

// Load real-time exchange rate from API
async function loadExchangeRate() {
    // Check cache first
    if (EXCHANGE_RATE_CACHE && EXCHANGE_RATE_LAST_FETCH) {
        const cacheAge = Date.now() - EXCHANGE_RATE_LAST_FETCH;
        if (cacheAge < EXCHANGE_RATE_CACHE_DURATION) {
            return EXCHANGE_RATE_CACHE;
        }
    }

    // Don't fetch if already loading
    if (EXCHANGE_RATE_LOADING) {
        return EXCHANGE_RATE_CACHE; // Return cached value while loading
    }

    EXCHANGE_RATE_LOADING = true;

    try {
        const response = await fetch('/api/exchange-rate');
        if (response.ok) {
            const data = await response.json();
            if (data.rate && !isNaN(data.rate)) {
                EXCHANGE_RATE_CACHE = data.rate;
                EXCHANGE_RATE_LAST_FETCH = Date.now();
                console.log('✅ Real-time exchange rate loaded:', data.rate, 'MAD to USD (from', data.source + ')');
                return EXCHANGE_RATE_CACHE;
            }
        }
    } catch (error) {
        console.warn('⚠️ Could not fetch real-time exchange rate, using fallback:', error.message);
    } finally {
        EXCHANGE_RATE_LOADING = false;
    }

    // Return cached value or null if no cache
    return EXCHANGE_RATE_CACHE;
}

// Load config from API endpoint (for Vercel environment variables)
async function loadPayPalConfigFromAPI() {
    if (PAYPAL_CONFIG_LOADING || PAYPAL_CONFIG_LOADED) {
        return PAYPAL_API_CONFIG;
    }

    PAYPAL_CONFIG_LOADING = true;

    try {
        const response = await fetch('/api/paypal-config');
        if (response.ok) {
            PAYPAL_API_CONFIG = await response.json();
            PAYPAL_CONFIG_LOADED = true;

            // Also try to load real-time exchange rate
            const realTimeRate = await loadExchangeRate();
            if (realTimeRate) {
                PAYPAL_API_CONFIG.MAD_TO_USD_RATE = realTimeRate;
                PAYPAL_CONFIG.MAD_TO_USD_RATE = realTimeRate;
            }

            return PAYPAL_API_CONFIG;
        }
    } catch (error) {
        // API not available, will use defaults
    } finally {
        PAYPAL_CONFIG_LOADING = false;
    }

    return null;
}

// Make functions available globally
if (typeof window !== 'undefined') {
    window.loadPayPalConfigFromAPI = loadPayPalConfigFromAPI;
    window.loadExchangeRate = loadExchangeRate;
    window.PAYPAL_API_CONFIG = PAYPAL_API_CONFIG;
}

// Get credentials from environment variables (for build systems) or local config or defaults
// Note: This is synchronous for initial config, but API config loads asynchronously
const getPayPalEnvVar = (key, defaultValue) => {
    // Check local config first (highest priority)
    if (PAYPAL_LOCAL_CONFIG[key]) {
        return PAYPAL_LOCAL_CONFIG[key];
    }

    // Check API-loaded config (from Vercel env vars)
    if (PAYPAL_API_CONFIG && PAYPAL_API_CONFIG[key]) {
        return PAYPAL_API_CONFIG[key];
    }

    // Check environment variables (for build systems like Vite, Webpack, etc.)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }

    // Return default
    return defaultValue;
};

const PAYPAL_CONFIG = {
    // Sandbox Client ID (for testing)
    // Get from: https://developer.paypal.com/dashboard/applications/sandbox
    // Loaded from paypal-config.local.js or environment variables
    CLIENT_ID_SANDBOX: getPayPalEnvVar('PAYPAL_CLIENT_ID_SANDBOX',
        PAYPAL_LOCAL_CONFIG.CLIENT_ID_SANDBOX || 'YOUR_SANDBOX_CLIENT_ID'),

    // Live Client ID (for production)
    // Get from: https://developer.paypal.com/dashboard/applications/live
    // Loaded from paypal-config.local.js or environment variables
    CLIENT_ID_LIVE: getPayPalEnvVar('PAYPAL_CLIENT_ID_LIVE',
        PAYPAL_LOCAL_CONFIG.CLIENT_ID_LIVE || 'YOUR_LIVE_CLIENT_ID'),

    // Use sandbox in development, live in production
    // Can be overridden in local config or environment variable
    USE_SANDBOX: (() => {
        const envValue = getPayPalEnvVar('PAYPAL_USE_SANDBOX', null);
        if (envValue !== null) {
            return envValue === 'true' || envValue === true;
        }
        if (PAYPAL_LOCAL_CONFIG.USE_SANDBOX !== undefined) {
            return PAYPAL_LOCAL_CONFIG.USE_SANDBOX === true;
        }
        // Default to sandbox mode if no live client ID is configured
        // This prevents errors when Client ID is not set up
        if (PAYPAL_LOCAL_CONFIG.CLIENT_ID_LIVE && !PAYPAL_LOCAL_CONFIG.CLIENT_ID_LIVE.includes('YOUR_')) {
            return false; // Use live if properly configured
        }
        return true; // Default to sandbox for development
    })(),

    // Currency conversion rate (MAD to USD)
    // Update this with real-time exchange rates in production
    // Can be overridden in local config or environment variable
    MAD_TO_USD_RATE: parseFloat(getPayPalEnvVar('PAYPAL_MAD_TO_USD_RATE',
        PAYPAL_LOCAL_CONFIG.MAD_TO_USD_RATE || 0.1)) || 0.1, // 1 MAD = 0.1 USD (approximate)

    // Language to PayPal locale mapping
    LOCALE_MAP: {
        'en': 'en_US',
        'fr': 'fr_FR',
        'ar': 'ar_AE'
    },

    // Get PayPal locale from site language
    getLocale(lang) {
        return this.LOCALE_MAP[lang] || this.LOCALE_MAP['en'];
    },

    // PayPal SDK URL with locale support
    // Note: PayPal supports many currencies. Change 'USD' to 'MAD' if you want to accept MAD directly
    // However, not all PayPal accounts support MAD, so USD conversion is recommended
    getSDK_URL(locale = null) {
        const clientId = this.USE_SANDBOX ? this.CLIENT_ID_SANDBOX : this.CLIENT_ID_LIVE;
        const localeParam = locale ? `&locale=${locale}` : '';
        // Using USD with conversion for maximum compatibility
        // To use MAD directly, change currency=USD to currency=MAD and remove conversion logic
        const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD&intent=capture&enable-funding=venmo,card${localeParam}`;

        // Log mode for debugging
        console.log(`🔧 PayPal Mode: ${this.USE_SANDBOX ? 'SANDBOX (Testing)' : 'LIVE (Production)'}`);
        console.log(`🔧 PayPal Client ID: ${clientId.substring(0, 15)}... (${this.USE_SANDBOX ? 'Sandbox' : 'Live'})`);

        return sdkUrl;
    },

    // Legacy getter for backward compatibility
    get SDK_URL() {
        const currentLang = typeof window !== 'undefined' && window.localStorage
            ? (localStorage.getItem('language') || 'en')
            : 'en';
        const locale = this.getLocale(currentLang);
        return this.getSDK_URL(locale);
    },

    // Method to update config from API (called after API loads)
    async updateFromAPI(apiConfig) {
        if (apiConfig) {
            if (apiConfig.CLIENT_ID_LIVE) this.CLIENT_ID_LIVE = apiConfig.CLIENT_ID_LIVE;
            if (apiConfig.CLIENT_ID_SANDBOX) this.CLIENT_ID_SANDBOX = apiConfig.CLIENT_ID_SANDBOX;
            if (apiConfig.USE_SANDBOX !== undefined) this.USE_SANDBOX = apiConfig.USE_SANDBOX;
            if (apiConfig.MAD_TO_USD_RATE) this.MAD_TO_USD_RATE = apiConfig.MAD_TO_USD_RATE;

            // Try to get real-time exchange rate if not already set
            if (!apiConfig.MAD_TO_USD_RATE || apiConfig.MAD_TO_USD_RATE === 0.1) {
                const realTimeRate = await loadExchangeRate();
                if (realTimeRate) {
                    this.MAD_TO_USD_RATE = realTimeRate;
                }
            }
        }
    },

    // Method to get current exchange rate (with real-time update)
    async getExchangeRate() {
        // Try to get real-time rate
        const realTimeRate = await loadExchangeRate();
        if (realTimeRate) {
            this.MAD_TO_USD_RATE = realTimeRate;
            return realTimeRate;
        }

        // Fall back to configured rate
        return this.MAD_TO_USD_RATE;
    }
};

// Export for use in checkout.html
if (typeof window !== 'undefined') {
    window.PAYPAL_CONFIG = PAYPAL_CONFIG;
}
