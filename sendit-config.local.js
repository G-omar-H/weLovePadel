// Sendit API Local Configuration
// This file is gitignored and will not be committed to the repository
// Get your credentials from: https://app.sendit.ma
//
// This file will be automatically loaded by sendit-config.js
// DO NOT commit this file with real credentials!

window.SENDIT_LOCAL_CONFIG = {
    // Authentication credentials
    PUBLIC_KEY: '9a8a46843e3b20b922f67690ff1f27e0',
    SECRET_KEY: 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG',
    
    // REQUIRED: Your warehouse/pickup location district ID (1 = Casablanca - Al fida)
    PICKUP_DISTRICT_ID: 1,
    
    // Stock configuration - products come from Sendit warehouse
    PRODUCTS_FROM_STOCK: 1, // 1 = products from stock, 0 = no stock
    PACKAGING_ID: 8,        // 8 = Carton box 3 (30cm x 20cm x 13cm)
    
    // Delivery options
    ALLOW_OPEN: 1,          // Allow opening package before payment
    ALLOW_TRY: 1,           // Allow trying products before payment
    OPTION_EXCHANGE: 0      // Exchange option disabled
};

// If the core config is already loaded, immediately refresh it with these local values
if (typeof window.refreshSenditConfigFromLocal === 'function') {
    window.refreshSenditConfigFromLocal();
}
