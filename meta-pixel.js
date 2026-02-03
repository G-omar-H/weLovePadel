/**
 * Meta Pixel Integration for StoreName
 * Pixel ID: 1211839740351838
 * 
 * This script handles client-side Meta Pixel tracking.
 * Server-side Conversions API is handled in server/index.js
 */

(function () {
    'use strict';

    const PIXEL_ID = '1211839740351838';

    // Meta Pixel Base Code & PageView are now initialized in HTML <head>
    // This file manages Helper Functions & CAPI Integration

    // Generate a unique event ID for deduplication with server-side events
    function generateEventId() {
        return 'evt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Get user data for enhanced matching (if available)
    function getUserData() {
        const userData = {};

        // Try to get from localStorage (if user has filled forms before)
        try {
            const savedEmail = localStorage.getItem('customer_email');
            const savedPhone = localStorage.getItem('customer_phone');
            const savedName = localStorage.getItem('customer_name');

            if (savedEmail) userData.em = savedEmail;
            if (savedPhone) userData.ph = savedPhone;
            if (savedName) {
                const names = savedName.split(' ');
                if (names.length > 0) userData.fn = names[0];
                if (names.length > 1) userData.ln = names[names.length - 1];
            }
        } catch (e) {
            // localStorage not available
        }

        return userData;
    }

    // Track ViewContent - when viewing a product
    window.trackMetaViewContent = function (productId, productName, price, currency = 'MAD') {
        const eventId = generateEventId();

        fbq('track', 'ViewContent', {
            content_type: 'product',
            content_ids: [productId],
            content_name: productName,
            value: price,
            currency: currency
        }, { eventID: eventId });

        // Also send to server for Conversions API
        sendServerEvent('ViewContent', {
            content_ids: [productId],
            content_type: 'product',
            content_name: productName,
            value: price,
            currency: currency
        }, eventId);
    };

    // Track AddToCart
    window.trackMetaAddToCart = function (productId, productName, price, quantity = 1, currency = 'MAD') {
        const eventId = generateEventId();

        fbq('track', 'AddToCart', {
            content_type: 'product',
            content_ids: [productId],
            content_name: productName,
            value: price * quantity,
            currency: currency,
            contents: [{ id: productId, quantity: quantity }]
        }, { eventID: eventId });

        sendServerEvent('AddToCart', {
            content_ids: [productId],
            content_type: 'product',
            content_name: productName,
            value: price * quantity,
            currency: currency,
            contents: [{ id: productId, quantity: quantity }]
        }, eventId);
    };

    // Track InitiateCheckout
    window.trackMetaInitiateCheckout = function (cartItems, totalValue, currency = 'MAD') {
        const eventId = generateEventId();
        const contentIds = cartItems.map(item => item.id);
        const contents = cartItems.map(item => ({ id: item.id, quantity: item.quantity }));

        fbq('track', 'InitiateCheckout', {
            content_type: 'product',
            content_ids: contentIds,
            contents: contents,
            value: totalValue,
            currency: currency,
            num_items: cartItems.length
        }, { eventID: eventId });

        sendServerEvent('InitiateCheckout', {
            content_ids: contentIds,
            content_type: 'product',
            contents: contents,
            value: totalValue,
            currency: currency,
            num_items: cartItems.length
        }, eventId);
    };

    // Track Purchase - most important event
    window.trackMetaPurchase = function (orderData) {
        const eventId = generateEventId();
        const contentIds = orderData.items ? orderData.items.map(item => item.id) : [orderData.productId];
        const contents = orderData.items ? orderData.items.map(item => ({ id: item.id, quantity: item.quantity }))
            : [{ id: orderData.productId, quantity: 1 }];

        fbq('track', 'Purchase', {
            content_type: 'product',
            content_ids: contentIds,
            contents: contents,
            value: orderData.totalAmount,
            currency: orderData.currency || 'MAD',
            num_items: orderData.items ? orderData.items.length : 1
        }, { eventID: eventId });

        // Send to server for Conversions API with user data for better attribution
        sendServerEvent('Purchase', {
            content_ids: contentIds,
            content_type: 'product',
            contents: contents,
            value: orderData.totalAmount,
            currency: orderData.currency || 'MAD',
            num_items: orderData.items ? orderData.items.length : 1,
            order_id: orderData.orderNumber
        }, eventId, {
            email: orderData.customerEmail,
            phone: orderData.customerPhone,
            name: orderData.customerName,
            city: orderData.city
        });
    };

    // Track Lead - when someone submits contact info
    window.trackMetaLead = function (value = 0, currency = 'MAD') {
        const eventId = generateEventId();

        fbq('track', 'Lead', {
            value: value,
            currency: currency
        }, { eventID: eventId });

        sendServerEvent('Lead', {
            value: value,
            currency: currency
        }, eventId);
    };

    // Track CompleteRegistration
    window.trackMetaCompleteRegistration = function () {
        const eventId = generateEventId();

        fbq('track', 'CompleteRegistration', {}, { eventID: eventId });
        sendServerEvent('CompleteRegistration', {}, eventId);
    };

    // Send event to server for Conversions API
    function sendServerEvent(eventName, customData, eventId, userData = null) {
        const payload = {
            eventName: eventName,
            eventId: eventId,
            eventSourceUrl: window.location.href,
            customData: customData,
            userData: userData || getUserData()
        };

        // Send to our backend, which forwards to Meta Conversions API
        fetch('/api/meta/event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(err => {
            console.warn('Meta Conversions API error:', err.message);
        });
    }

    // Store user data when forms are filled (for enhanced matching)
    document.addEventListener('DOMContentLoaded', function () {
        // Listen for form inputs to capture user data for enhanced matching
        const emailInputs = document.querySelectorAll('input[type="email"], input[name*="email"]');
        const phoneInputs = document.querySelectorAll('input[type="tel"], input[name*="phone"]');
        const nameInputs = document.querySelectorAll('input[name*="name"]');

        emailInputs.forEach(input => {
            input.addEventListener('blur', function () {
                if (this.value) {
                    try { localStorage.setItem('customer_email', this.value); } catch (e) { }
                }
            });
        });

        phoneInputs.forEach(input => {
            input.addEventListener('blur', function () {
                if (this.value) {
                    try { localStorage.setItem('customer_phone', this.value); } catch (e) { }
                }
            });
        });

        nameInputs.forEach(input => {
            input.addEventListener('blur', function () {
                if (this.value) {
                    try { localStorage.setItem('customer_name', this.value); } catch (e) { }
                }
            });
        });
    });

    console.log('✅ Meta Pixel initialized (ID: ' + PIXEL_ID + ')');
})();
