// Sendit API Configuration
// Get your credentials from: https://app.sendit.ma
//
// SECURITY: Credentials should be set in one of these ways:
// 1. Create sendit-config.local.js (gitignored) - Recommended for development
// 2. Set environment variables (for build systems)
// 3. Use placeholder values below (will use fallback cities)

// Load local configuration if available (from sendit-config.local.js)
const LOCAL_CONFIG = (typeof window !== 'undefined' && window.SENDIT_LOCAL_CONFIG)
    ? window.SENDIT_LOCAL_CONFIG
    : {};

// Store for API-loaded config (from Vercel serverless function)
let SENDIT_API_CONFIG = null;
let SENDIT_CONFIG_LOADING = false;
let SENDIT_CONFIG_LOADED = false;

// Load config from API endpoint (for Vercel environment variables)
async function loadSenditConfigFromAPI() {
    if (SENDIT_CONFIG_LOADING || SENDIT_CONFIG_LOADED) {
        return SENDIT_API_CONFIG;
    }

    SENDIT_CONFIG_LOADING = true;

    try {
        const response = await fetch('/api/sendit-config');
        if (response.ok) {
            SENDIT_API_CONFIG = await response.json();
            SENDIT_CONFIG_LOADED = true;
            return SENDIT_API_CONFIG;
        }
    } catch (error) {
        // API not available, will use defaults
    } finally {
        SENDIT_CONFIG_LOADING = false;
    }

    return null;
}

// Make function available globally
if (typeof window !== 'undefined') {
    window.loadSenditConfigFromAPI = loadSenditConfigFromAPI;
    window.SENDIT_API_CONFIG = SENDIT_API_CONFIG;
}

// Get credentials from environment variables (for build systems) or local config or defaults
const getEnvVar = (key, defaultValue) => {
    // Check API-loaded config first (from Vercel serverless function)
    if (SENDIT_API_CONFIG && SENDIT_API_CONFIG[key]) {
        return SENDIT_API_CONFIG[key];
    }
    // Check environment variables (for build systems like Vite, Webpack, etc.)
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    // Check local config
    if (LOCAL_CONFIG[key]) {
        return LOCAL_CONFIG[key];
    }
    // Return default
    return defaultValue;
};

const SENDIT_CONFIG = {
    // API Base URL
    BASE_URL: 'https://app.sendit.ma/api/v1/',

    // Authentication Credentials
    // Loaded from sendit-config.local.js or environment variables
    // See .env.example and sendit-config.local.js.example for setup instructions
    PUBLIC_KEY: getEnvVar('SENDIT_PUBLIC_KEY', LOCAL_CONFIG.PUBLIC_KEY || 'YOUR_PUBLIC_KEY_HERE'),
    SECRET_KEY: getEnvVar('SENDIT_SECRET_KEY', LOCAL_CONFIG.SECRET_KEY || 'YOUR_SECRET_KEY_HERE'),

    // Token storage
    TOKEN_STORAGE_KEY: 'sendit_auth_token',
    TOKEN_EXPIRY_KEY: 'sendit_token_expiry',

    // Cache settings
    DISTRICTS_CACHE_KEY: 'sendit_districts_cache',
    DISTRICTS_CACHE_VERSION: '2', // Increment to invalidate old caches
    DISTRICTS_CACHE_DURATION: 7 * 24 * 60 * 60 * 1000, // 7 days - districts rarely change

    // Pickup district ID (where orders are shipped from)
    // REQUIRED by Sendit API - This should be set to your warehouse/pickup location district ID
    // Default: 1 (Casablanca - Al fida) - Change this to your actual warehouse location
    PICKUP_DISTRICT_ID: getEnvVar('SENDIT_PICKUP_DISTRICT_ID', LOCAL_CONFIG.PICKUP_DISTRICT_ID || 1),

    // Default settings (can be overridden in local config)
    ALLOW_OPEN: LOCAL_CONFIG.ALLOW_OPEN !== undefined ? LOCAL_CONFIG.ALLOW_OPEN : (getEnvVar('SENDIT_ALLOW_OPEN', '1') === '1' ? 1 : 0),
    ALLOW_TRY: LOCAL_CONFIG.ALLOW_TRY !== undefined ? LOCAL_CONFIG.ALLOW_TRY : (getEnvVar('SENDIT_ALLOW_TRY', '1') === '1' ? 1 : 0),
    OPTION_EXCHANGE: LOCAL_CONFIG.OPTION_EXCHANGE !== undefined ? LOCAL_CONFIG.OPTION_EXCHANGE : (getEnvVar('SENDIT_OPTION_EXCHANGE', '0') === '1' ? 1 : 0),
    // Products come from Sendit stock - set to 1 (true) by default
    PRODUCTS_FROM_STOCK: LOCAL_CONFIG.PRODUCTS_FROM_STOCK !== undefined ? LOCAL_CONFIG.PRODUCTS_FROM_STOCK : (getEnvVar('SENDIT_PRODUCTS_FROM_STOCK', '1') === '1' ? 1 : 0),
    // Packaging ID for stock products - 8 = "Carton box 3" (30cm x 20cm x 13cm)
    PACKAGING_ID: LOCAL_CONFIG.PACKAGING_ID !== undefined ? LOCAL_CONFIG.PACKAGING_ID : (getEnvVar('SENDIT_PACKAGING_ID', '8')),

    // Mapping from StoreName product variations to Sendit stock codes
    // Structure: { variation: code } for simple mapping, or { variation: { size: { primary, fallback } } } for size-based
    PRODUCT_CODE_MAP: {
        // Patriot Edition - size-based codes with fallbacks
        'patriot-edition': {
            'S': { primary: 'PRA424', fallback: 'PRA423' },
            'M': { primary: 'PRA427', fallback: 'PRA425' },
            'L': { primary: 'PRA428', fallback: 'PRA427' },
            'default': 'PRA427'  // Fallback to M if size unspecified
        },

        // Signature Rouge - size-based codes with fallbacks
        'signature-rouge': {
            'S': { primary: 'PRA3E0', fallback: 'PRA3E1' },  // Size S (54-56cm)
            'M': { primary: 'PRA3DF', fallback: 'PRA3E0' },  // Size M (57-59cm)
            'L': { primary: 'PRA42B', fallbacks: ['PRA3DE', 'PRA3DF'] },  // Size L with Double Fallback
            'default': 'PRA3E0'  // Fallback if size not specified
        },

        // Fallback for products without specific variation
        'atlas-star': { primary: 'PRA13F', fallback: 'PRA3E0' }  // Default to Patriot Edition (with fallback)
    },

    // Get authentication token
    async getToken() {
        // Check if we have a valid cached token
        const cachedToken = localStorage.getItem(this.TOKEN_STORAGE_KEY);
        const tokenExpiry = localStorage.getItem(this.TOKEN_EXPIRY_KEY);

        if (cachedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
            return cachedToken;
        }

        // Get new token
        try {
            const response = await fetch(`${this.BASE_URL}login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    public_key: this.PUBLIC_KEY,
                    secret_key: this.SECRET_KEY
                })
            });

            if (!response.ok) {
                throw new Error(`Authentication failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.data && data.data.token) {
                // Cache token for 1 hour (3600000 ms)
                const expiry = Date.now() + (60 * 60 * 1000);
                localStorage.setItem(this.TOKEN_STORAGE_KEY, data.data.token);
                localStorage.setItem(this.TOKEN_EXPIRY_KEY, expiry.toString());

                return data.data.token;
            } else {
                throw new Error('Invalid response from Sendit API');
            }
        } catch (error) {
            console.error('Sendit authentication error:', error);
            throw error;
        }
    },

    // Make authenticated API request
    async apiRequest(endpoint, options = {}) {
        const token = await this.getToken();

        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            }
        };

        const mergedOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...(options.headers || {})
            }
        };

        const apiUrl = `${this.BASE_URL}${endpoint}`;
        console.log('🌐 Sendit API Request:', {
            endpoint: endpoint,
            url: apiUrl,
            method: mergedOptions.method || 'GET'
        });

        const response = await fetch(apiUrl, mergedOptions);

        console.log('📡 Sendit API Response:', {
            endpoint: endpoint,
            status: response.status,
            statusText: response.statusText,
            ok: response.ok
        });

        // Handle specific error codes as per Sendit API documentation
        if (!response.ok) {
            const statusCode = response.status;
            let errorData;
            try {
                errorData = await response.json();
            } catch (e) {
                // Try to get response text if JSON parsing fails
                try {
                    const text = await response.text();
                    errorData = { message: text || `API request failed: ${statusCode}` };
                } catch (e2) {
                    errorData = { message: `API request failed: ${statusCode}` };
                }
            }

            console.error('❌ Sendit API Error:', {
                endpoint: endpoint,
                statusCode: statusCode,
                errorData: errorData,
                fullResponse: JSON.stringify(errorData, null, 2)
            });

            // For 422 errors, log validation details if available
            if (statusCode === 422 && errorData) {
                console.error('❌ Validation Error Details:', {
                    message: errorData.message,
                    errors: errorData.errors,
                    data: errorData.data,
                    fullError: errorData
                });

                // Try to extract specific field errors from data object
                if (errorData.data) {
                    console.error('❌ Field Validation Errors:', JSON.stringify(errorData.data, null, 2));
                    // Check if it's an object with field names as keys
                    if (typeof errorData.data === 'object' && !Array.isArray(errorData.data)) {
                        const fieldErrors = Object.keys(errorData.data).map(field => ({
                            field: field,
                            error: errorData.data[field]
                        }));
                        if (fieldErrors.length > 0) {
                            console.error('❌ Invalid Fields:', fieldErrors);
                        }
                    }
                }
            }

            // Map specific error codes to user-friendly messages
            const errorMessages = {
                250: 'Le champ produits est incorrect !',
                251: 'Les produits suivants n\'existent pas',
                252: 'La quantité sélectionnée de ces produits n\'est pas suffisante',
                401: 'Accès non autorisé - Vérifiez vos identifiants',
                403: 'Vous n\'avez pas les autorisations nécessaires',
                404: 'Ressource non trouvée',
                422: 'Les données fournies sont invalides',
                500: 'Une erreur s\'est produite côté serveur'
            };

            const errorMessage = errorMessages[statusCode] || errorData.message || `API request failed: ${statusCode}`;
            const error = new Error(errorMessage);
            error.statusCode = statusCode;
            error.errorData = errorData;
            throw error;
        }

        return await response.json();
    }
};

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.SENDIT_CONFIG = SENDIT_CONFIG;
}

