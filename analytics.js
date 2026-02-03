/**
 * Analytics Configuration and Tracking
 * Supports Vercel Analytics and Google Analytics with E-commerce tracking
 */

// Analytics Configuration
const ANALYTICS_CONFIG = {
    // Google Analytics 4 Measurement ID
    // Dashboard: https://analytics.google.com/
    GA_MEASUREMENT_ID: 'G-E803QJZ09B',

    // Meta Pixel ID for Facebook/Instagram Ads
    // Dashboard: https://business.facebook.com/events_manager2/list/pixel
    META_PIXEL_ID: '1211839740351838',

    // Enable/Disable analytics
    ENABLE_GA: true,
    ENABLE_VERCEL: false, // Disabled - only works on Vercel-hosted sites
    ENABLE_META_PIXEL: false // Disabled in favor of meta-pixel.js which handles CAPI
};

// Initialize Google Analytics
function initGoogleAnalytics() {
    if (!ANALYTICS_CONFIG.ENABLE_GA || !ANALYTICS_CONFIG.GA_MEASUREMENT_ID || ANALYTICS_CONFIG.GA_MEASUREMENT_ID === 'G-XXXXXXXXXX') {
        console.log('Google Analytics: Not configured or disabled');
        return;
    }

    // Load Google Analytics script
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = `https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_CONFIG.GA_MEASUREMENT_ID}`;
    document.head.appendChild(script1);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    function gtag() {
        dataLayer.push(arguments);
    }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', ANALYTICS_CONFIG.GA_MEASUREMENT_ID, {
        send_page_view: true,
        anonymize_ip: true,
        cookie_flags: 'SameSite=None;Secure'
    });

    console.log('Google Analytics: Initialized');
}

// Initialize Vercel Analytics
function initVercelAnalytics() {
    if (!ANALYTICS_CONFIG.ENABLE_VERCEL) {
        console.log('Vercel Analytics: Disabled');
        return;
    }

    // Vercel Speed Insights
    const speedInsights = document.createElement('script');
    speedInsights.defer = true;
    speedInsights.src = 'https://cdn.vercel-insights.com/v1/script.js';
    document.head.appendChild(speedInsights);

    // Vercel Web Analytics (if using @vercel/analytics package)
    // For static sites, we can use the script approach
    // Note: Vercel Web Analytics requires the package to be installed during build
    // This is a placeholder - actual implementation depends on build setup

    console.log('Vercel Analytics: Speed Insights initialized');
}

// Initialize Meta Pixel
function initMetaPixel() {
    if (!ANALYTICS_CONFIG.ENABLE_META_PIXEL || !ANALYTICS_CONFIG.META_PIXEL_ID || ANALYTICS_CONFIG.META_PIXEL_ID === '') {
        console.log('Meta Pixel: Not configured or disabled');
        return;
    }

    // Check if Pixel is already loaded and initialized (from HTML head)
    // Don't reinitialize to avoid duplicate pixel warning
    if (window.fbq && window.fbq.loaded) {
        console.log('Meta Pixel: Already initialized in HTML head, skipping duplicate init');
        return;
    }

    // If fbq exists but not fully loaded, just log and return
    if (window.fbq) {
        console.log('Meta Pixel: Already present, skipping');
        return;
    }

    // Meta Pixel base code - only load if not already present
    !function (f, b, e, v, n, t, s) {
        if (f.fbq) return; n = f.fbq = function () {
            n.callMethod ?
                n.callMethod.apply(n, arguments) : n.queue.push(arguments)
        };
        if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
        n.queue = []; t = b.createElement(e); t.async = !0;
        t.src = v; s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s)
    }(window, document, 'script',
        'https://connect.facebook.net/en_US/fbevents.js');

    // Wait for Pixel to load, then initialize
    setTimeout(function () {
        if (window.fbq) {
            fbq('init', ANALYTICS_CONFIG.META_PIXEL_ID);
            fbq('track', 'PageView');
            console.log('Meta Pixel: Initialized with ID', ANALYTICS_CONFIG.META_PIXEL_ID);
        } else {
            console.error('Meta Pixel: Failed to load fbq function');
        }
    }, 100);
}

// Track Page View
function trackPageView(pageName, pagePath) {
    try {
        // Google Analytics
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', 'page_view', {
                page_title: pageName,
                page_location: window.location.href,
                page_path: pagePath || window.location.pathname
            });
        }

        // Meta Pixel - PageView is automatically tracked on init
        // But we can track custom page views if needed
        if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            fbq('track', 'PageView', {
                content_name: pageName,
                content_category: 'page_view'
            });
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Track Product View
function trackProductView(productId, productName, price, category) {
    try {
        const priceNum = parseFloat(price) || 0;

        // Google Analytics
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', 'view_item', {
                currency: 'MAD',
                value: priceNum,
                items: [{
                    item_id: productId,
                    item_name: productName,
                    item_category: category || 'Unknown',
                    price: priceNum,
                    quantity: 1
                }]
            });
        }

        // Meta Pixel - ViewContent event
        if (typeof window.trackMetaViewContent === 'function') {
            window.trackMetaViewContent(productId, productName, priceNum, 'MAD');
        } else if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            fbq('track', 'ViewContent', {
                content_name: productName,
                content_ids: [productId],
                content_type: 'product',
                content_category: category || 'Unknown',
                value: priceNum,
                currency: 'MAD'
            });
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Track Add to Cart
function trackAddToCart(productId, productName, price, category, quantity = 1) {
    try {
        const priceNum = parseFloat(price) || 0;
        const totalValue = priceNum * quantity;

        // Google Analytics
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', 'add_to_cart', {
                currency: 'MAD',
                value: totalValue,
                items: [{
                    item_id: productId,
                    item_name: productName,
                    item_category: category || 'Unknown',
                    price: priceNum,
                    quantity: quantity
                }]
            });
        }

        // Meta Pixel - AddToCart event
        if (typeof window.trackMetaAddToCart === 'function') {
            window.trackMetaAddToCart(productId, productName, priceNum, quantity, 'MAD');
        } else if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            fbq('track', 'AddToCart', {
                content_name: productName,
                content_ids: [productId],
                content_type: 'product',
                content_category: category || 'Unknown',
                value: totalValue,
                currency: 'MAD',
                num_items: quantity
            });
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Track Remove from Cart
function trackRemoveFromCart(productId, productName, price, category, quantity = 1) {
    if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
        gtag('event', 'remove_from_cart', {
            currency: 'MAD',
            value: parseFloat(price) * quantity,
            items: [{
                item_id: productId,
                item_name: productName,
                item_category: category,
                price: parseFloat(price),
                quantity: quantity
            }]
        });
    }
}

// Track Cart View
function trackCartView(items, totalValue) {
    if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
        const cartItems = items.map(item => ({
            item_id: item.id,
            item_name: item.name,
            item_category: item.category || 'Unknown',
            price: parseFloat(item.price.replace(' MAD', '').replace(',', '')),
            quantity: item.quantity
        }));

        gtag('event', 'view_cart', {
            currency: 'MAD',
            value: totalValue,
            items: cartItems
        });
    }
}

// Track Begin Checkout
function trackBeginCheckout(items, totalValue) {
    try {
        const cartItems = items.map(item => ({
            item_id: item.id,
            item_name: item.name,
            item_category: item.category || 'Unknown',
            price: parseFloat(item.price.replace(' MAD', '').replace(',', '')),
            quantity: item.quantity
        }));

        // Google Analytics
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', 'begin_checkout', {
                currency: 'MAD',
                value: totalValue,
                items: cartItems
            });
        }

        // Meta Pixel - InitiateCheckout event
        if (typeof window.trackMetaInitiateCheckout === 'function') {
            window.trackMetaInitiateCheckout(items, totalValue, 'MAD');
        } else if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            const contentIds = cartItems.map(item => item.item_id);
            const contentNames = cartItems.map(item => item.item_name);
            const numItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

            fbq('track', 'InitiateCheckout', {
                content_ids: contentIds,
                content_name: contentNames.join(', '),
                content_type: 'product',
                value: totalValue,
                currency: 'MAD',
                num_items: numItems
            });
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Track Purchase (when checkout is completed)
function trackPurchase(transactionId, items, totalValue, shipping = 0, tax = 0) {
    try {
        const cartItems = items.map(item => ({
            item_id: item.id,
            item_name: item.name,
            item_category: item.category || 'Unknown',
            price: parseFloat(item.price.replace(' MAD', '').replace(',', '')),
            quantity: item.quantity
        }));

        // Google Analytics
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', 'purchase', {
                transaction_id: transactionId,
                value: totalValue,
                currency: 'MAD',
                shipping: shipping,
                tax: tax,
                items: cartItems
            });
        }

        // Meta Pixel - Purchase event (most important for conversion tracking)
        if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            const contentIds = cartItems.map(item => item.item_id);
            const contentNames = cartItems.map(item => item.item_name);
            const numItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

            fbq('track', 'Purchase', {
                content_ids: contentIds,
                content_name: contentNames.join(', '),
                content_type: 'product',
                value: totalValue,
                currency: 'MAD',
                num_items: numItems
            });

            // Also track Lead event for lead generation campaigns
            fbq('track', 'Lead', {
                content_name: 'Purchase Completed',
                value: totalValue,
                currency: 'MAD'
            });
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Track Search
function trackSearch(searchTerm) {
    if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
        gtag('event', 'search', {
            search_term: searchTerm
        });
    }
}

// Track Filter
function trackFilter(filterCategory) {
    if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
        gtag('event', 'filter', {
            filter_category: filterCategory
        });
    }
}

// Track Language Change
function trackLanguageChange(language) {
    if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
        gtag('event', 'language_change', {
            language: language
        });
    }
}

// Track Custom Event
function trackEvent(eventName, eventParams = {}) {
    try {
        if (window.gtag && ANALYTICS_CONFIG.ENABLE_GA) {
            gtag('event', eventName, eventParams);
        }
    } catch (error) {
        console.warn('Analytics tracking error:', error);
    }
}

// Initialize analytics on page load
document.addEventListener('DOMContentLoaded', () => {
    initGoogleAnalytics();
    initVercelAnalytics();
    initMetaPixel();

    // Track initial page view
    const pageName = document.title || 'Unknown Page';
    const pagePath = window.location.pathname;
    trackPageView(pageName, pagePath);
});

// Meta Pixel Custom Event Tracking
function trackMetaPixelEvent(eventName, eventParams = {}) {
    try {
        if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
            fbq('track', eventName, eventParams);
        }
    } catch (error) {
        console.warn('Meta Pixel tracking error:', error);
    }
}

// Track Search (for Meta Pixel)
function trackSearchMeta(searchTerm) {
    if (window.fbq && ANALYTICS_CONFIG.ENABLE_META_PIXEL && ANALYTICS_CONFIG.META_PIXEL_ID) {
        fbq('track', 'Search', {
            search_string: searchTerm
        });
    }
}

// Export functions for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        trackPageView,
        trackProductView,
        trackAddToCart,
        trackRemoveFromCart,
        trackCartView,
        trackBeginCheckout,
        trackPurchase,
        trackSearch,
        trackFilter,
        trackLanguageChange,
        trackEvent,
        trackMetaPixelEvent,
        trackSearchMeta,
        ANALYTICS_CONFIG
    };
}

