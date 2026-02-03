/**
 * Main Configuration File
 *
 * This file contains all the brand-specific settings for your store.
 * Change these values to customize the template for your brand.
 */

const CONFIG = {
    // Brand Identity
    brandName: "WeLove Padel",
    brandTagline: "WeLove Padel. We Play Padel.",
    logoConfig: {
        text: "WeLove Padel", // Used if image is not set or fails to load
        image: "assets/logo/logo.png", // Path to your logo image
        width: "120px"
    },

    // Contact Information
    contact: {
        email: "contact@welovepadel.ma",
        phone: "+212 6XX-XXXXXX",
        address: "Technopark, 103, Casablanca, 20000, Maroc",
        whatsapp: "+2126XXXXXXXX" // International format without spaces for links
    },

    // Social Media Links (leave empty to hide)
    social: {
        instagram: "https://instagram.com/",
        facebook: "https://facebook.com/",
        tiktok: "",
        twitter: ""
    },

    // Feature Toggles
    features: {
        enablePayPal: true,
        enableCOD: true, // Cash on Delivery
        enableWhatsAppChat: true,
        showLanguageSelector: true
    },

    // Localization
    defaultLanguage: "en", // 'en', 'fr', 'ar'
    currency: {
        code: "MAD",
        symbol: "MAD"
    },

    // Storage Configuration
    // This prefix is used for localStorage keys to prevent conflicts
    storagePrefix: "storename_"
};

// Make config available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
} else {
    window.CONFIG = CONFIG;
}
