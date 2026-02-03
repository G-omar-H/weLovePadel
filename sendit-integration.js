/**
 * Sendit Shipping Integration
 * Handles all interactions with Sendit API for shipping management
 */

class SenditIntegration {
    constructor() {
        this.config = SENDIT_CONFIG;
        this.districtsCache = null;
    }

    /**
     * Get list of districts (cities) with shipping costs
     * Uses server-side cache for fast loading (updated weekly)
     * Falls back to Sendit API if server cache unavailable
     */
    async getDistricts(searchQuery = '') {
        // Check localStorage cache first (for offline/fast reload)
        const cached = this.getCachedDistricts();
        if (cached && !searchQuery) {
            console.log('📍 Using localStorage cached districts');
            return cached;
        }

        // Try server-side cache first (much faster than Sendit API)
        try {
            console.log('📍 Loading districts from server cache...');

            let data = null;

            // Try multiple sources in order of preference
            const cacheSources = [
                '/api/sendit-districts',           // API endpoint (if server updated)
                '/sendit-districts.json',          // Root static file (nginx serves)
                '/data/sendit-districts.json'      // Data folder fallback
            ];

            for (const source of cacheSources) {
                try {
                    const params = new URLSearchParams();
                    if (searchQuery && source.includes('/api/')) {
                        params.append('search', searchQuery);
                    }
                    const url = source.includes('/api/') ? `${source}?${params.toString()}` : source;

                    const response = await fetch(url);
                    if (response.ok) {
                        const responseData = await response.json();

                        // Handle both API response format and static file format
                        if (responseData.success && responseData.data) {
                            data = responseData;
                            console.log(`📍 Loaded from: ${source} (API format)`);
                            break;
                        } else if (responseData.districts && responseData.districts.length > 0) {
                            data = { success: true, data: responseData.districts };
                            console.log(`📍 Loaded from: ${source} (static format)`);
                            break;
                        }
                    }
                } catch (sourceError) {
                    // Try next source
                    continue;
                }
            }

            if (data && data.success && data.data && data.data.length > 0) {
                console.log(`✅ Loaded ${data.data.length} districts from server cache`);
                // Cache locally for even faster reloads
                this.cacheDistricts(data.data);
                return data.data;
            }
        } catch (error) {
            console.warn('⚠️ Server cache unavailable, falling back to Sendit API:', error.message);
        }

        // Fallback to direct Sendit API (slower, paginated)
        try {
            console.log('📍 Fetching districts from Sendit API...');
            const allDistricts = [];
            let currentPage = 1;
            let lastPage = 1;
            let hasMorePages = true;

            // Fetch all pages
            while (hasMorePages && currentPage <= 100) { // Safety limit: max 100 pages
                const params = new URLSearchParams();
                params.append('page', currentPage.toString());
                if (searchQuery) {
                    params.append('querystring', searchQuery);
                }

                const response = await this.config.apiRequest(`districts?${params.toString()}`);

                if (response.success && response.data) {
                    let pageDistricts = null;

                    if (Array.isArray(response.data)) {
                        pageDistricts = response.data;
                    } else if (response.data.data && Array.isArray(response.data.data)) {
                        pageDistricts = response.data.data;
                    }

                    if (pageDistricts && pageDistricts.length > 0) {
                        allDistricts.push(...pageDistricts);
                        lastPage = response.last_page || 1;
                        const currentPageNum = response.current_page || currentPage;
                        hasMorePages = currentPageNum < lastPage;
                        currentPage = currentPageNum + 1;
                    } else {
                        hasMorePages = false;
                    }
                } else {
                    hasMorePages = false;
                }
            }

            if (allDistricts.length > 0) {
                console.log(`✅ Fetched ${allDistricts.length} districts from Sendit API`);
                this.cacheDistricts(allDistricts);
                return allDistricts;
            }

            return [];
        } catch (error) {
            console.error('❌ Error fetching Sendit districts:', error);
            console.error('Error details:', {
                message: error?.message,
                statusCode: error?.statusCode,
                stack: error?.stack,
                error: error
            });

            // Return cached data if available, even if expired
            const cached = this.getCachedDistricts(true);
            if (cached) {
                return cached;
            }

            console.error('❌ No cached districts available, will use fallback cities');
            throw error;
        }
    }

    /**
     * Get district details by ID
     */
    async getDistrictById(districtId) {
        try {
            const response = await this.config.apiRequest(`districts/${districtId}`);
            if (response.success && response.data) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching district:', error);
            throw error;
        }
    }

    /**
     * Calculate shipping cost based on district
     */
    async calculateShippingCost(districtId) {
        try {
            const district = await this.getDistrictById(districtId);
            if (district && district.price !== undefined) {
                return {
                    cost: parseFloat(district.price),
                    deliveryTime: district.delais || '3-5 business days',
                    district: district
                };
            }
            return {
                cost: 0, // Free shipping if district not found
                deliveryTime: '3-5 business days',
                district: null
            };
        } catch (error) {
            console.error('Error calculating shipping cost:', error);
            // Return free shipping as fallback
            return {
                cost: 0,
                deliveryTime: '3-5 business days',
                district: null
            };
        }
    }

    /**
     * Create a delivery in Sendit
     * Follows Sendit API documentation: POST /deliveries
     * Returns NewColisDetail schema response
     * Supports automatic fallback to alternative product codes on stock errors (251/252)
     */
    /**
     * Create a delivery in Sendit
     * Support recursive fallback retries (Primary -> Fallback 1 -> Fallback 2 -> ...)
     */
    async createDelivery(orderData, attemptIndex = 0) {
        try {
            // Map order data to Sendit API format
            // This initializes this._currentAttemptChains if first attempt
            const senditData = this.mapOrderToSendit(orderData);

            // Determine which product string to use based on attempt index
            if (this._currentAttemptChains && this._currentAttemptChains[attemptIndex]) {
                const productString = this._currentAttemptChains[attemptIndex];
                console.log(`🚀 Creating delivery attempt #${attemptIndex + 1} with products: ${productString}`);
                senditData.products = productString;
            } else if (attemptIndex > 0) {
                // Should not happen if logic is correct, but safety check
                throw new Error(`Fallback attempt #${attemptIndex + 1} requested but no product chain available.`);
            }

            // ... (Validation logic remains same) ...

            // Validate required fields before sending
            const requiredFields = ['pickup_district_id', 'district_id', 'name', 'phone', 'address', 'amount'];
            const missingFields = requiredFields.filter(field => {
                const value = senditData[field];
                return value === null || value === undefined || value === '' ||
                    (typeof value === 'number' && isNaN(value));
            });
            if (missingFields.length > 0) {
                throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
            }

            // ... (Integer/Number validation remains same) ...
            // Validate integer fields
            const integerFields = ['pickup_district_id', 'district_id', 'allow_open', 'allow_try', 'products_from_stock', 'option_exchange'];
            for (const field of integerFields) {
                if (senditData[field] !== undefined && senditData[field] !== null) {
                    const intValue = parseInt(senditData[field]);
                    if (isNaN(intValue)) {
                        throw new Error(`Invalid ${field}: "${senditData[field]}" must be an integer`);
                    }
                    senditData[field] = intValue;
                }
            }

            // Validate amount
            if (typeof senditData.amount !== 'number' || isNaN(senditData.amount)) {
                throw new Error(`Invalid amount: "${senditData.amount}" must be a number`);
            }

            // Validate string fields
            const stringFields = ['name', 'phone', 'address'];
            for (const field of stringFields) {
                if (!senditData[field] || String(senditData[field]).trim() === '') {
                    throw new Error(`Required field ${field} cannot be empty`);
                }
            }

            // Make API request
            const response = await this.config.apiRequest('deliveries', {
                method: 'POST',
                body: JSON.stringify(senditData)
            });

            if (response.success && response.data) {
                const deliveryData = response.data;
                return {
                    success: true,
                    deliveryCode: deliveryData.code,
                    trackingCode: deliveryData.code,
                    deliveryData: deliveryData,
                    labelUrl: deliveryData.labelUrl || null,
                    usedFallback: attemptIndex > 0
                };
            }

            // API Failure Handling
            const apiError = new Error(response.message || 'Failed to create delivery');
            if (response.code || response.status) {
                apiError.statusCode = parseInt(response.code || response.status);
            }
            apiError.errorData = response;
            throw apiError;

        } catch (error) {
            console.error(`Error creating delivery (Attempt #${attemptIndex + 1}):`, error);

            // Extract error code
            let senditCode = error.statusCode;
            if (error.errorData) {
                if (error.errorData.code) senditCode = error.errorData.code;
                else if (error.errorData.status) senditCode = error.errorData.status;
            }
            senditCode = parseInt(senditCode);

            // Check for Stock Errors
            const isStockError = senditCode === 251 || senditCode === 252;
            const errorMessage = (error.message || '').toLowerCase();
            const isStockMessage = errorMessage.includes('produit') || errorMessage.includes('stock') || errorMessage.includes('quantité');

            // Check if next fallback level is available
            const nextAttemptIndex = attemptIndex + 1;
            const hasNextFallback = this._currentAttemptChains && this._currentAttemptChains[nextAttemptIndex];

            // RECURSIVE RETRY LOGIC
            if ((isStockError || isStockMessage) && hasNextFallback) {
                console.log(`⚠️ Stock error on attempt #${attemptIndex + 1}. Retrying with fallback level ${nextAttemptIndex + 1}...`);
                try {
                    return await this.createDelivery(orderData, nextAttemptIndex);
                } catch (fallbackError) {
                    console.error(`❌ Fallback attempt #${nextAttemptIndex + 1} also failed.`);
                    // Let it bubble up or throw original error if we want to hide intermediate failures
                    throw fallbackError;
                }
            }

            // Enhance error message if final failure
            if (senditCode) {
                const statusMessages = {
                    250: 'Le format des produits est incorrect.',
                    251: 'Certains produits n\'existent pas dans votre stock Sendit',
                    252: 'La quantité disponible est insuffisante pour certains produits',
                    422: 'Les données fournies sont invalides.'
                };
                if (statusMessages[senditCode]) {
                    error.userMessage = statusMessages[senditCode];
                }
            }

            throw error;
        }
    }



    /**
     * Get delivery details by code (for tracking)
     */
    async getDeliveryDetails(deliveryCode) {
        try {
            const response = await this.config.apiRequest(`deliveries/${deliveryCode}`);
            if (response.success && response.data) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('Error fetching delivery details:', error);
            throw error;
        }
    }

    /**
     * Get all delivery statuses
     */
    async getDeliveryStatuses() {
        try {
            const response = await this.config.apiRequest('all-status-deliveries');
            if (response.success && response.data) {
                return response.data;
            }
            return {};
        } catch (error) {
            console.error('Error fetching delivery statuses:', error);
            return {};
        }
    }

    /**
     * Map StoreName order format to Sendit API format
     * Follows Sendit API documentation schema: NewColisData
     */
    mapOrderToSendit(orderData) {
        // Get district ID from shipping data (required)
        const rawDistrictId = orderData.shipping.districtId;
        const districtId = rawDistrictId
            ? parseInt(rawDistrictId, 10)
            : (this.config.PICKUP_DISTRICT_ID || null);


        if (!districtId || isNaN(districtId)) {
            throw new Error(`Invalid District ID: ${rawDistrictId} (parsed as: ${districtId})`);
        }

        // Format products for Sendit API
        // Format: "PRODUCT_CODE:QUANTITY;PRODUCT_CODE2:QUANTITY"
        // Required when products_from_stock = 1
        // Supports size-based codes with fallbacks for Signature Rouge
        let productsString = '';
        let fallbackProductsString = ''; // Store fallback codes for retry if primary fails

        if (this.config.PRODUCTS_FROM_STOCK === 1 && orderData.items && orderData.items.length > 0) {
            // Get the product code mapping from config
            // EXAMPLE MAPPING - Replace with your own product codes
            const productCodeMap = this.config.PRODUCT_CODE_MAP || {
                'example-product': 'CODE1',
                'example-variant': {
                    'S': { primary: 'CODE_S', fallback: 'CODE_S_ALT' },
                    'M': { primary: 'CODE_M', fallback: 'CODE_M_ALT' },
                    'default': 'CODE_DEF'
                }
            };

            /**
             * Resolve Sendit product codes for an item
             * Returns array of codes [primary, fallback1, fallback2, ...]
             */
            const resolveProductCode = (variationId, size) => {
                const mapping = productCodeMap[variationId.toLowerCase()];

                // Default fallback chain
                const defaultChain = ['PRA13F', 'PRA3E0'];

                if (!mapping) {
                    return defaultChain;
                }

                // Helper to extract codes from a mapping object
                const extractCodes = (m) => {
                    if (typeof m === 'string') return [m];
                    if (m.fallbacks && Array.isArray(m.fallbacks)) {
                        return [m.primary, ...m.fallbacks];
                    }
                    if (m.fallback) {
                        return [m.primary, m.fallback];
                    }
                    return [m.primary || m.default || m];
                };

                // Simple string mapping
                if (typeof mapping === 'string') {
                    return [mapping];
                }

                // Size-based mapping
                if (typeof mapping === 'object') {
                    // Direct mapping object
                    if (mapping.primary) {
                        return extractCodes(mapping);
                    }

                    // Nested size mapping
                    const sizeCode = size ? size.split(' ')[0].toUpperCase() : '';
                    if (sizeCode && mapping[sizeCode]) {
                        return extractCodes(mapping[sizeCode]);
                    }

                    // Fallback to default
                    if (mapping.default) {
                        return extractCodes(mapping.default);
                    }
                }

                return defaultChain;
            };

            // Aggregate quantities by attempt level
            // attemptChains[0] = { code: qty } (Primary)
            // attemptChains[1] = { code: qty } (Fallback 1)
            // attemptChains[2] = { code: qty } (Fallback 2)
            const attemptChains = [];

            orderData.items.forEach(item => {
                const variationId = item.variation || item.variationId || '';
                const size = item.size || '';
                const quantity = item.quantity || 1;

                let codes = [];

                if (variationId) {
                    codes = resolveProductCode(variationId, size);
                } else {
                    // Name-based matching fallback
                    const itemNameLower = (item.name || '').toLowerCase();
                    if (itemNameLower.includes('patriot') || itemNameLower.includes('etoile') || itemNameLower.includes('star')) {
                        codes = ['PRA13F', 'PRA3E0'];
                    } else if (itemNameLower.includes('signature') || itemNameLower.includes('rouge')) {
                        codes = resolveProductCode('signature-rouge', size);
                    } else {
                        codes = ['PRA13F', 'PRA3E0'];
                    }
                }

                // Distribute codes to attempt levels
                codes.forEach((code, index) => {
                    if (!attemptChains[index]) attemptChains[index] = {};
                    attemptChains[index][code] = (attemptChains[index][code] || 0) + quantity;
                });

                console.log(`📦 Item: ${item.name} | Codes: ${codes.join(' -> ')}`);
            });

            // Store chains for use in createDelivery
            this._currentAttemptChains = attemptChains.map(chain => {
                return Object.entries(chain)
                    .map(([code, qty]) => `${code}:${qty}`)
                    .join(';');
            });

            console.log('📦 Sendit Attempt Chains:', this._currentAttemptChains);
        }

        // Store fallback for potential retry in createDelivery (Legacy support / First fallback)
        this._lastFallbackProducts = this._currentAttemptChains ? this._currentAttemptChains[1] : '';

        // Build complete address with landmark if provided
        let completeAddress = orderData.shipping.address || '';
        if (orderData.shipping.landmark) {
            completeAddress += ` (${orderData.shipping.landmark})`;
        }
        if (orderData.shipping.postalCode) {
            completeAddress += ` - ${orderData.shipping.postalCode}`;
        }

        // Build comment (optional field)
        // Include product details: variation, size, and quantity
        // Size mapping: S=N.4/5/6, M=N.7/8/9, L=N.0/1
        const sizeMapping = {
            'S': 'N.4 ou N.5 ou N.6 (54-56cm)',
            'M': 'N.7 ou N.8 ou N.9 (57-59cm)',
            'L': 'N.0 ou N.1 (60-61cm)'
        };

        let productDetails = [];
        if (orderData.items && orderData.items.length > 0) {
            orderData.items.forEach(item => {
                const productName = item.name ? item.name.split(' - ')[0] : 'Product';
                const variation = item.variation || item.variationId || '';
                const size = item.size || '';
                const qty = item.quantity || 1;

                // Build product detail string
                let detail = productName;
                if (variation) {
                    // Format variation nicely (e.g., 'signature-rouge' -> 'Signature Rouge')
                    const variationName = variation.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    detail += ` (${variationName})`;
                }
                if (size) {
                    // Extract size code (S, M, or L) from full size string like "L (60-61cm)"
                    const sizeCode = size.split(' ')[0].toUpperCase();
                    // Map S/M/L to actual Sendit sizes
                    const mappedSize = sizeMapping[sizeCode] || size;
                    detail += ` - Taille: ${mappedSize}`;
                }
                detail += ` x${qty}`;

                productDetails.push(detail);
            });
        }

        let comment = orderData.shipping.notes || '';

        // Add product details to comment for Sendit preparation team
        if (productDetails.length > 0) {
            const detailsStr = productDetails.join(' | ');
            comment = comment ? `${comment} | PRODUITS: ${detailsStr}` : `PRODUITS: ${detailsStr}`;
        }
        if (orderData.shipping.landmark && !comment.includes('Landmark')) {
            comment = comment ? `${comment} | Landmark: ${orderData.shipping.landmark}` : `Landmark: ${orderData.shipping.landmark}`;
        }

        // Get pickup district ID (REQUIRED by Sendit API) - MUST be integer
        const pickupDistrictId = parseInt(this.config.PICKUP_DISTRICT_ID) || 1;
        if (isNaN(pickupDistrictId) || pickupDistrictId <= 0) {
            throw new Error(`Invalid pickup_district_id: "${this.config.PICKUP_DISTRICT_ID}" must be a valid positive integer`);
        }

        // Parse district_id to integer (REQUIRED by Sendit API)
        const districtIdInt = parseInt(districtId);
        if (isNaN(districtIdInt) || districtIdInt <= 0) {
            throw new Error(`Invalid district_id: "${districtId}" must be a valid positive integer`);
        }

        // Prepare required string fields - must not be empty
        const customerName = `${orderData.customer.firstName} ${orderData.customer.lastName}`.trim();
        const deliveryAddress = String(completeAddress || '').trim();
        const orderAmount = parseFloat(orderData.total) || 0;

        // Normalize phone number to Sendit format: 06******** (10 digits starting with 0)
        // Sendit API requires: "Numéro de téléphone du client par exemple : 06********."
        let customerPhone = String(orderData.customer.phone || '').trim();

        // Remove all non-digit characters
        const digitsOnly = customerPhone.replace(/\D/g, '');

        // Convert to Sendit format (10 digits starting with 0)
        if (digitsOnly.length === 12 && digitsOnly.startsWith('212')) {
            // International format: 212XXXXXXXXX -> 0XXXXXXXXX
            customerPhone = '0' + digitsOnly.substring(3);
        } else if (digitsOnly.length === 11 && digitsOnly.startsWith('212')) {
            // International format without leading 0: 212XXXXXXXX -> 0XXXXXXXX
            customerPhone = '0' + digitsOnly.substring(3);
        } else if (digitsOnly.length === 10 && digitsOnly.startsWith('0')) {
            // Already in correct format: 0XXXXXXXXX
            customerPhone = digitsOnly;
        } else if (digitsOnly.length === 9) {
            // Missing leading 0: XXXXXXXXX -> 0XXXXXXXXX
            customerPhone = '0' + digitsOnly;
        } else if (digitsOnly.length > 0) {
            // Try to extract last 10 digits if longer
            if (digitsOnly.length >= 10) {
                const last10 = digitsOnly.substring(digitsOnly.length - 10);
                if (last10.startsWith('0')) {
                    customerPhone = last10;
                } else {
                    customerPhone = '0' + last10.substring(1);
                }
            } else {
                // Invalid length
                throw new Error(`Invalid phone number format: "${orderData.customer.phone}". Sendit requires 10 digits starting with 0 (e.g., 0612345678)`);
            }
        }

        // Final validation: must be exactly 10 digits starting with 0
        if (!/^0[5-7]\d{8}$/.test(customerPhone)) {
            throw new Error(`Invalid phone number format: "${orderData.customer.phone}" -> "${customerPhone}". Sendit requires format: 06******** (10 digits starting with 0, second digit 5-7)`);
        }

        // Validate required fields are not empty
        if (!customerName) {
            throw new Error('Required field "name" cannot be empty');
        }
        if (!customerPhone) {
            throw new Error('Required field "phone" cannot be empty');
        }
        if (!deliveryAddress) {
            throw new Error('Required field "address" cannot be empty');
        }
        if (isNaN(orderAmount) || orderAmount < 0) {
            throw new Error(`Invalid amount: "${orderData.total}" must be a valid positive number`);
        }

        // Build payload according to NewColisData schema from Sendit API documentation
        // Matching the exact structure from the API example
        const senditData = {
            pickup_district_id: pickupDistrictId, // REQUIRED: integer - Identifiant de la ville de ramassage
            district_id: districtIdInt, // REQUIRED: integer - Identifiant de la ville de destination
            name: customerName, // REQUIRED: string - Nom du client (must not be empty)
            phone: customerPhone, // REQUIRED: string - Numéro de téléphone (format: 06********, must not be empty)
            address: deliveryAddress, // REQUIRED: string - Adresse de livraison (must not be empty)
            amount: orderAmount, // REQUIRED: number (float) - Montant total du colis (must be > 0)
            allow_open: this.config.ALLOW_OPEN ? 1 : 0, // Optional: integer (0 or 1)
            allow_try: this.config.ALLOW_TRY ? 1 : 0, // Optional: integer (0 or 1)
            products_from_stock: this.config.PRODUCTS_FROM_STOCK ? 1 : 0, // Optional: integer (0 or 1)
            option_exchange: this.config.OPTION_EXCHANGE ? 1 : 0 // Optional: integer (0 or 1)
        };

        // Optional fields - use null instead of empty strings (per API example)
        if (comment && comment.trim()) {
            senditData.comment = comment.trim();
        } else {
            senditData.comment = null; // Use null instead of empty string
        }

        if (orderData.orderNumber && orderData.orderNumber.trim()) {
            senditData.reference = orderData.orderNumber.trim();
        } else {
            senditData.reference = null; // Use null instead of empty string
        }

        // Add products if using stock (required if products_from_stock = 1)
        // Format: "CODE:QTY;CODE2:QTY"
        if (this.config.PRODUCTS_FROM_STOCK === 1 && productsString && productsString.trim()) {
            senditData.products = productsString.trim();
        } else {
            // Don't include products field if empty (or set to null per API example)
            senditData.products = null;
        }

        // Add packaging_id only if products_from_stock = 1 (per API docs)
        if (this.config.PRODUCTS_FROM_STOCK === 1 && this.config.PACKAGING_ID) {
            const packagingId = parseInt(this.config.PACKAGING_ID);
            if (!isNaN(packagingId) && packagingId > 0) {
                senditData.packaging_id = packagingId;
            }
        }

        // Add delivery_exchange_id only if option_exchange = 1 (per API docs)
        if (this.config.OPTION_EXCHANGE === 1 && orderData.exchangeDeliveryCode && orderData.exchangeDeliveryCode.trim()) {
            senditData.delivery_exchange_id = orderData.exchangeDeliveryCode.trim();
        } else {
            senditData.delivery_exchange_id = null; // Use null instead of empty string
        }

        // Add packaging_id if products come from stock (optional)
        // This would need to be configured or passed from orderData
        // if (this.config.PRODUCTS_FROM_STOCK === 1 && orderData.packagingId) {
        //     senditData.packaging_id = parseInt(orderData.packagingId);
        // }

        // Add delivery_exchange_id if option_exchange is enabled (optional)
        // if (this.config.OPTION_EXCHANGE === 1 && orderData.exchangeDeliveryCode) {
        //     senditData.delivery_exchange_id = orderData.exchangeDeliveryCode;
        // }

        return senditData;
    }

    /**
     * Find district ID by city name
     * This is a helper function - in production, you'd match by exact name
     */
    findDistrictIdByCity(cityName) {
        if (!this.districtsCache) {
            const cached = this.getCachedDistricts();
            if (cached) {
                this.districtsCache = cached;
            }
        }

        if (this.districtsCache && Array.isArray(this.districtsCache)) {
            // Try to find matching district
            const cityLower = cityName.toLowerCase();
            const match = this.districtsCache.find(district => {
                const districtName = (district.name || district.ville || '').toLowerCase();
                return districtName.includes(cityLower) || cityLower.includes(districtName);
            });

            if (match && match.id) {
                return parseInt(match.id);
            }
        }

        return null;
    }

    /**
     * Cache districts data
     */
    cacheDistricts(districts) {
        const cacheData = {
            data: districts,
            timestamp: Date.now(),
            version: this.config.DISTRICTS_CACHE_VERSION || '1'
        };
        localStorage.setItem(this.config.DISTRICTS_CACHE_KEY, JSON.stringify(cacheData));
        this.districtsCache = districts;
    }

    /**
     * Get cached districts
     */
    getCachedDistricts(ignoreExpiry = false) {
        try {
            const cached = localStorage.getItem(this.config.DISTRICTS_CACHE_KEY);
            if (!cached) return null;

            const cacheData = JSON.parse(cached);

            // Check cache version - if version doesn't match, invalidate cache
            const cacheVersion = cacheData.version || '1';
            const currentVersion = this.config.DISTRICTS_CACHE_VERSION || '1';
            if (cacheVersion !== currentVersion) {
                localStorage.removeItem(this.config.DISTRICTS_CACHE_KEY);
                return null;
            }

            const isExpired = Date.now() - cacheData.timestamp > this.config.DISTRICTS_CACHE_DURATION;

            if (!ignoreExpiry && isExpired) {
                return null;
            }

            this.districtsCache = cacheData.data;
            return cacheData.data;
        } catch (error) {
            console.error('Error reading cached districts:', error);
            return null;
        }
    }

    /**
     * Initialize searchable autocomplete for districts
     */
    async initializeDistrictAutocomplete(inputElement, hiddenInputElement, listElement, selectedDistrictId = null) {
        try {
            // Check if Sendit is properly configured
            if (!this.config.PUBLIC_KEY || this.config.PUBLIC_KEY === 'YOUR_PUBLIC_KEY_HERE' ||
                !this.config.SECRET_KEY || this.config.SECRET_KEY === 'YOUR_SECRET_KEY_HERE') {
                console.warn('⚠️ Sendit not configured, using fallback cities');
                return this.initializeFallbackAutocomplete(inputElement, hiddenInputElement, listElement);
            }

            const districts = await this.getDistricts();

            if (!districts || districts.length === 0) {
                console.error('❌ No districts returned from Sendit API');
                return this.initializeFallbackAutocomplete(inputElement, hiddenInputElement, listElement);
            }

            // Store districts for filtering
            this.allDistricts = districts;

            // Create searchable options with better display names and deduplication
            const optionsMap = new Map(); // Use Map to avoid duplicates

            // Get current language for Arabic display
            const currentLang = localStorage.getItem('language') || 'en';
            const isArabic = currentLang === 'ar';

            districts.forEach(district => {
                const city = (district.ville || district.name || 'Other').trim();
                const districtName = (district.name || '').trim();
                const arabicName = (district.arabic_name || '').trim();
                const pickupDistrict = district.pickup_district || 0;

                // Create a clean display name (avoid "city - city - district" duplicates)
                let displayName;
                let displayNameArabic = '';

                if (districtName && districtName !== city && districtName.toLowerCase() !== city.toLowerCase()) {
                    // City and district are different: "Casablanca - California"
                    displayName = `${city} - ${districtName}`;
                    displayNameArabic = arabicName || '';
                } else {
                    // Same city and district, or no district name: just show city
                    displayName = city;
                    displayNameArabic = arabicName || '';
                }

                // Use Arabic name for display if in Arabic mode and Arabic name is available
                const finalDisplayName = (isArabic && displayNameArabic) ? displayNameArabic : displayName;

                // Create comprehensive search text (all searchable terms including Arabic)
                const searchText = `${city} ${districtName} ${arabicName} ${city} ${districtName}`.toLowerCase().trim().replace(/\s+/g, ' ');

                // Use a unique key to avoid duplicates (city + district combination)
                const uniqueKey = `${city.toLowerCase()}-${districtName.toLowerCase()}`;

                // Only add if we haven't seen this combination before, or if it's a better match
                if (!optionsMap.has(uniqueKey) || district.id) {
                    optionsMap.set(uniqueKey, {
                        id: district.id,
                        value: district.id,
                        label: finalDisplayName,
                        labelFr: displayName, // French/English name
                        labelAr: displayNameArabic, // Arabic name
                        city: city,
                        district: districtName || city,
                        arabicName: arabicName,
                        price: district.price || 0,
                        delais: district.delais || '3-5 business days',
                        searchText: searchText,
                        pickupDistrict: pickupDistrict
                    });
                }
            });

            // Convert Map to array
            const options = Array.from(optionsMap.values());

            this.districtOptions = options;

            // Set initial value if provided
            if (selectedDistrictId) {
                const selected = options.find(opt => opt.id == selectedDistrictId);
                if (selected) {
                    inputElement.value = selected.label;
                    hiddenInputElement.value = selected.id;
                }
            }

            // Setup autocomplete functionality
            this.setupAutocomplete(inputElement, hiddenInputElement, listElement, options);

            return districts;
        } catch (error) {
            console.error('Error initializing district autocomplete:', error);
            return this.initializeFallbackAutocomplete(inputElement, hiddenInputElement, listElement);
        }
    }

    /**
     * Setup autocomplete functionality
     */
    setupAutocomplete(inputElement, hiddenInputElement, listElement, options) {
        let filteredOptions = [];
        let selectedIndex = -1;

        // Filter function with multi-word search support
        const filterOptions = (query) => {
            if (!query || query.length < 2) {
                return [];
            }

            const lowerQuery = query.toLowerCase().trim();
            const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 0);

            // Filter options where all query words match
            const filtered = options.filter(opt => {
                const searchText = (opt.searchText || '').toLowerCase();
                const label = (opt.label || '').toLowerCase();
                const labelAr = (opt.labelAr || '').toLowerCase();
                const labelFr = (opt.labelFr || '').toLowerCase();
                const city = (opt.city || '').toLowerCase();
                const district = (opt.district || '').toLowerCase();
                const arabicName = (opt.arabicName || '').toLowerCase();

                // Check if all query words are found in any of the searchable fields (including Arabic)
                return queryWords.every(word =>
                    searchText.includes(word) ||
                    label.includes(word) ||
                    labelAr.includes(word) ||
                    labelFr.includes(word) ||
                    city.includes(word) ||
                    district.includes(word) ||
                    arabicName.includes(word)
                );
            });

            // Sort by relevance: exact matches first, then by position of first match
            filtered.sort((a, b) => {
                const aText = (a.searchText || '').toLowerCase();
                const bText = (b.searchText || '').toLowerCase();
                const aLabel = (a.label || '').toLowerCase();
                const bLabel = (b.label || '').toLowerCase();

                // Exact match bonus
                const aExact = aLabel === lowerQuery || aText === lowerQuery;
                const bExact = bLabel === lowerQuery || bText === lowerQuery;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;

                // Starts with query bonus
                const aStarts = aLabel.startsWith(lowerQuery) || aText.startsWith(lowerQuery);
                const bStarts = bLabel.startsWith(lowerQuery) || bText.startsWith(lowerQuery);
                if (aStarts && !bStarts) return -1;
                if (!aStarts && bStarts) return 1;

                // Position of first match
                const aIndex = Math.min(
                    aLabel.indexOf(lowerQuery),
                    aText.indexOf(lowerQuery),
                    aLabel.indexOf(queryWords[0]),
                    aText.indexOf(queryWords[0])
                );
                const bIndex = Math.min(
                    bLabel.indexOf(lowerQuery),
                    bText.indexOf(lowerQuery),
                    bLabel.indexOf(queryWords[0]),
                    bText.indexOf(queryWords[0])
                );

                if (aIndex !== bIndex) {
                    return (aIndex === -1 ? 999 : aIndex) - (bIndex === -1 ? 999 : bIndex);
                }

                // Alphabetical as tiebreaker
                return aLabel.localeCompare(bLabel);
            });

            return filtered.slice(0, 10); // Limit to 10 results for performance
        };

        // Render options with enhanced display (Arabic + French names, price, delivery)
        const renderOptions = (filtered) => {
            listElement.innerHTML = '';
            if (filtered.length === 0) {
                listElement.style.display = 'none';
                return;
            }

            // Get current language for display
            const currentLang = localStorage.getItem('language') || 'en';
            const isArabicMode = currentLang === 'ar';

            filtered.forEach((option, index) => {
                const item = document.createElement('div');
                item.className = 'district-autocomplete-item';
                item.dataset.value = option.id;
                item.dataset.index = index;

                // Build display with Arabic name if available
                const hasArabic = option.labelAr && option.labelAr.trim() !== '';
                const hasFrench = option.labelFr && option.labelFr.trim() !== '';

                // Create structured content
                const mainText = document.createElement('span');
                mainText.className = 'district-name-main';

                if (isArabicMode && hasArabic) {
                    // Arabic mode: Show Arabic as main, French as secondary
                    mainText.textContent = option.labelAr;
                    mainText.dir = 'rtl';

                    if (hasFrench && option.labelFr !== option.labelAr) {
                        const secondaryText = document.createElement('span');
                        secondaryText.className = 'district-name-secondary';
                        secondaryText.textContent = ` (${option.labelFr})`;
                        secondaryText.dir = 'ltr';
                        mainText.appendChild(secondaryText);
                    }
                } else {
                    // French/English mode: Show French as main, Arabic as secondary
                    mainText.textContent = option.labelFr || option.label;

                    if (hasArabic && option.labelAr !== option.labelFr) {
                        const secondaryText = document.createElement('span');
                        secondaryText.className = 'district-name-secondary';
                        secondaryText.textContent = ` (${option.labelAr})`;
                        secondaryText.dir = 'rtl';
                        mainText.appendChild(secondaryText);
                    }
                }

                item.appendChild(mainText);

                // Mark "Other" option with special class
                if (option.id === 'other' || option.label.toLowerCase().includes('other') || option.label.includes('أخرى')) {
                    item.classList.add('other-option');
                }

                if (index === selectedIndex) {
                    item.classList.add('selected');
                }

                item.addEventListener('click', () => {
                    // Store both Arabic and French labels
                    inputElement.value = isArabicMode && hasArabic ? option.labelAr : (option.labelFr || option.label);
                    inputElement.dataset.labelAr = option.labelAr || '';
                    inputElement.dataset.labelFr = option.labelFr || option.label;
                    hiddenInputElement.value = option.id;
                    listElement.style.display = 'none';
                    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
                });

                listElement.appendChild(item);
            });

            listElement.style.display = 'block';
        };

        // Input event
        inputElement.addEventListener('input', (e) => {
            const query = e.target.value;
            filteredOptions = filterOptions(query);
            selectedIndex = -1;
            renderOptions(filteredOptions);
        });

        // Keyboard navigation
        inputElement.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                selectedIndex = Math.min(selectedIndex + 1, filteredOptions.length - 1);
                renderOptions(filteredOptions);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                selectedIndex = Math.max(selectedIndex - 1, -1);
                renderOptions(filteredOptions);
            } else if (e.key === 'Enter' && selectedIndex >= 0 && filteredOptions[selectedIndex]) {
                e.preventDefault();
                const option = filteredOptions[selectedIndex];
                inputElement.value = option.label;
                hiddenInputElement.value = option.id;
                listElement.style.display = 'none';
                inputElement.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (e.key === 'Escape') {
                listElement.style.display = 'none';
            }
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!inputElement.contains(e.target) && !listElement.contains(e.target)) {
                listElement.style.display = 'none';
            }
        });
    }

    /**
     * Initialize fallback autocomplete with real Sendit district IDs
     */
    initializeFallbackAutocomplete(inputElement, hiddenInputElement, listElement) {
        // Real Sendit district IDs for major cities
        const currentLang = localStorage.getItem('language') || 'en';
        const isArabic = currentLang === 'ar';

        const fallbackDistricts = [
            { id: 46, label: 'Casablanca - Autres quartiers', labelAr: 'الدار البيضاء - أحياء أخرى', price: 19 },
            { id: 53, label: 'Rabat', labelAr: 'الرباط', price: 35 },
            { id: 56, label: 'Marrakech', labelAr: 'مراكش', price: 35 },
            { id: 139, label: 'Fes', labelAr: 'فاس', price: 35 },
            { id: 52, label: 'Tanger', labelAr: 'طنجة', price: 35 },
            { id: 54, label: 'Agadir', labelAr: 'أكادير', price: 35 },
            { id: 167, label: 'Meknes', labelAr: 'مكناس', price: 35 },
            { id: 73, label: 'Oujda', labelAr: 'وجدة', price: 35 },
            { id: 155, label: 'Kenitra', labelAr: 'القنيطرة', price: 35 },
            { id: 222, label: 'Tetouan', labelAr: 'تطوان', price: 39 },
            { id: 188, label: 'Safi', labelAr: 'آسفي', price: 35 }
        ];

        this.districtOptions = fallbackDistricts.map(district => ({
            id: district.id,
            value: district.id,
            label: isArabic && district.labelAr ? district.labelAr : district.label,
            labelFr: district.label,
            labelAr: district.labelAr,
            city: district.label,
            price: district.price,
            delais: '24h - 48h',
            searchText: `${district.label} ${district.labelAr}`.toLowerCase()
        }));

        this.setupAutocomplete(inputElement, hiddenInputElement, listElement, this.districtOptions);
    }

    /**
     * Populate city/district dropdown (legacy - kept for compatibility)
     */
    async populateDistrictDropdown(selectElement, selectedDistrictId = null) {
        try {
            // Check if Sendit is properly configured
            if (!this.config.PUBLIC_KEY || this.config.PUBLIC_KEY === 'YOUR_PUBLIC_KEY_HERE' ||
                !this.config.SECRET_KEY || this.config.SECRET_KEY === 'YOUR_SECRET_KEY_HERE') {
                console.warn('⚠️ Sendit not configured, using fallback cities');
                console.warn('   PUBLIC_KEY:', this.config.PUBLIC_KEY ? (this.config.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET');
                console.warn('   SECRET_KEY:', this.config.SECRET_KEY ? 'SET' : 'NOT SET');
                return this.populateFallbackDistricts(selectElement);
            }

            const districts = await this.getDistricts();

            // If no districts returned, use fallback
            if (!districts || districts.length === 0) {
                console.error('❌ No districts returned from Sendit API, using fallback cities');
                console.error('   This means Sendit districts API call failed or returned empty');
                console.error('   Check: 1) API authentication 2) Network connectivity 3) Sendit API status');
                return this.populateFallbackDistricts(selectElement);
            }

            // Clear existing options (except first option)
            const firstOption = selectElement.querySelector('option[value=""]');
            selectElement.innerHTML = '';
            if (firstOption) {
                const currentLang = localStorage.getItem('language') || 'en';
                const translation = typeof getTranslation === 'function'
                    ? getTranslation('checkout.form.districtSelect', currentLang)
                    : null;
                firstOption.textContent = translation || 'Select City / District (Optional)';
                selectElement.appendChild(firstOption);
            }

            // Group districts by city
            const citiesMap = new Map();
            districts.forEach(district => {
                const city = district.ville || 'Other';
                if (!citiesMap.has(city)) {
                    citiesMap.set(city, []);
                }
                citiesMap.get(city).push(district);
            });

            let totalOptionsAdded = 0;

            // Populate dropdown
            citiesMap.forEach((districts, city) => {
                if (districts.length === 1) {
                    // Single district for this city
                    const option = document.createElement('option');
                    option.value = districts[0].id;
                    // Format: "City" or "City - District Name" if district name is different
                    const displayName = districts[0].name && districts[0].name !== city
                        ? `${city} - ${districts[0].name}`
                        : (districts[0].name || districts[0].ville || city);
                    option.textContent = displayName;
                    option.dataset.price = districts[0].price || 0;
                    option.dataset.delais = districts[0].delais || '3-5 business days';
                    option.dataset.city = city; // Store city name for reference
                    if (selectedDistrictId && districts[0].id == selectedDistrictId) {
                        option.selected = true;
                    }
                    selectElement.appendChild(option);
                    totalOptionsAdded++;
                } else {
                    // Multiple districts (neighborhoods) for this city
                    districts.forEach(district => {
                        const option = document.createElement('option');
                        option.value = district.id;
                        // Format: "City - District Name" (e.g., "Casablanca - Ain Sebaa")
                        option.textContent = `${city} - ${district.name || district.ville}`;
                        option.dataset.price = district.price || 0;
                        option.dataset.delais = district.delais || '3-5 business days';
                        option.dataset.city = city; // Store city name for reference
                        if (selectedDistrictId && district.id == selectedDistrictId) {
                            option.selected = true;
                        }
                        selectElement.appendChild(option);
                        totalOptionsAdded++;
                    });
                }
            });


            return districts;
        } catch (error) {
            console.error('Error populating district dropdown:', error);
            // Use fallback on error
            return this.populateFallbackDistricts(selectElement);
        }
    }

    /**
     * Populate fallback districts (real Sendit district IDs for major Moroccan cities)
     * Used when Sendit API is not available or not configured
     */
    populateFallbackDistricts(selectElement) {
        const currentLang = localStorage.getItem('language') || 'en';
        const isArabic = currentLang === 'ar';

        // Real Sendit district IDs for major cities
        const fallbackDistricts = [
            { id: 46, name: 'Casablanca - Autres quartiers', nameAr: 'الدار البيضاء - أحياء أخرى', price: 19, delais: '24h - 48h' },
            { id: 53, name: 'Rabat', nameAr: 'الرباط', price: 35, delais: '24h - 48h' },
            { id: 56, name: 'Marrakech', nameAr: 'مراكش', price: 35, delais: '24h - 48h' },
            { id: 139, name: 'Fes', nameAr: 'فاس', price: 35, delais: '24h - 48h' },
            { id: 52, name: 'Tanger', nameAr: 'طنجة', price: 35, delais: '24h - 72h' },
            { id: 54, name: 'Agadir', nameAr: 'أكادير', price: 35, delais: '24h - 48h' },
            { id: 167, name: 'Meknes', nameAr: 'مكناس', price: 35, delais: '24h - 48h' },
            { id: 73, name: 'Oujda', nameAr: 'وجدة', price: 35, delais: '24h - 48h' },
            { id: 155, name: 'Kenitra', nameAr: 'القنيطرة', price: 35, delais: '24h - 48h' },
            { id: 222, name: 'Tetouan', nameAr: 'تطوان', price: 39, delais: '24h - 48h' },
            { id: 188, name: 'Safi', nameAr: 'آسفي', price: 35, delais: '24h - 48h' }
        ];

        // Clear existing options
        const firstOption = selectElement.querySelector('option[value=""]');
        selectElement.innerHTML = '';
        if (firstOption) {
            firstOption.textContent = getTranslation('checkout.form.districtSelect') || 'Select City / District (Optional)';
            selectElement.appendChild(firstOption);
        }

        // Add fallback districts with real Sendit IDs
        fallbackDistricts.forEach(district => {
            const option = document.createElement('option');
            option.value = district.id; // Real Sendit district ID
            option.textContent = isArabic && district.nameAr ? district.nameAr : district.name;
            option.dataset.price = district.price;
            option.dataset.delais = district.delais;
            selectElement.appendChild(option);
        });

        // Update help text to indicate fallback mode
        const helpText = selectElement.parentElement?.querySelector('.field-help');
        if (helpText && typeof getTranslation === 'function') {
            const translation = getTranslation('checkout.form.districtHelpFallback', currentLang);
            helpText.textContent = translation || 'Select your city for delivery.';
        }

        return fallbackDistricts;
    }

    /**
     * Update shipping cost display (always free)
     */
    updateShippingCost(districtId) {
        const shippingCostElement = document.getElementById('shippingCost');
        const shippingFreeElement = document.querySelector('.shipping-free');

        // Shipping is always free for customers
        if (shippingCostElement) {
            shippingCostElement.textContent = 'Free';
        }
        if (shippingFreeElement) {
            shippingFreeElement.textContent = getTranslation('cart.summary.shippingFree') || 'Free';
        }

        // Update total (no shipping cost added)
        this.updateOrderTotal();
    }

    /**
     * Update order total (shipping is always free)
     */
    updateOrderTotal() {
        const subtotal = cart.getTotalPrice();
        // Shipping is always free, so total = subtotal
        const total = subtotal;

        // Update display
        const totalElement = document.getElementById('checkoutTotal');
        if (totalElement) {
            totalElement.textContent = `${total.toFixed(2)} MAD`;
        }

        // Also update cart total if on cart page
        const cartTotalElement = document.getElementById('cartTotal');
        if (cartTotalElement) {
            cartTotalElement.textContent = `${total.toFixed(2)} MAD`;
        }
    }
}

// Initialize Sendit integration
const sendit = new SenditIntegration();

// Export for use in other scripts
if (typeof window !== 'undefined') {
    window.sendit = sendit;
    window.SenditIntegration = SenditIntegration;
}

