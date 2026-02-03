// Save checkout form data to sessionStorage
function saveCheckoutFormData() {
    const form = document.getElementById('checkoutForm');
    if (!form) return;

    const formData = {
        firstName: document.getElementById('firstName')?.value || '',
        lastName: document.getElementById('lastName')?.value || '',
        email: document.getElementById('email')?.value || '',
        phone: document.getElementById('phone')?.value || '',
        address: document.getElementById('address')?.value || '',
        city: document.getElementById('city')?.value || document.getElementById('districtId')?.value || '',
        districtId: document.getElementById('districtIdValue')?.value || '',
        postalCode: document.getElementById('postalCode')?.value || '',
        country: document.getElementById('country')?.value || '',
        notes: document.getElementById('notes')?.value || ''
    };

    const storageKey = (typeof CONFIG !== 'undefined' && CONFIG.storagePrefix) ? CONFIG.storagePrefix + 'checkout_form' : 'storename_checkout_form';
    sessionStorage.setItem(storageKey, JSON.stringify(formData));
    console.log('💾 Checkout form data saved for language switch');
}

// Restore checkout form data from sessionStorage
function restoreCheckoutFormData() {
    const storageKey = (typeof CONFIG !== 'undefined' && CONFIG.storagePrefix) ? CONFIG.storagePrefix + 'checkout_form' : 'storename_checkout_form';
    const savedData = sessionStorage.getItem(storageKey);
    if (!savedData) return;

    try {
        const formData = JSON.parse(savedData);

        // Restore each field
        if (formData.firstName) document.getElementById('firstName').value = formData.firstName;
        if (formData.lastName) document.getElementById('lastName').value = formData.lastName;
        if (formData.email) document.getElementById('email').value = formData.email;
        if (formData.phone) document.getElementById('phone').value = formData.phone;
        if (formData.address) document.getElementById('address').value = formData.address;
        // Restore city field (new) or districtId (legacy)
        const cityInput = document.getElementById('city');
        if (cityInput && formData.city) {
            cityInput.value = formData.city;
            // Trigger matching if districtId was saved
            if (formData.districtId) {
                document.getElementById('districtIdValue').value = formData.districtId;
            }
        } else if (formData.city) {
            // Legacy: restore to districtId field
            const districtInput = document.getElementById('districtId');
            if (districtInput) districtInput.value = formData.city;
        }
        if (formData.postalCode) document.getElementById('postalCode').value = formData.postalCode;
        if (formData.country) document.getElementById('country').value = formData.country;
        if (formData.notes) document.getElementById('notes').value = formData.notes;

        console.log('✅ Checkout form data restored after language switch');

        // Clear from sessionStorage after restoring
        // sessionStorage.removeItem(storageKey); // Optional: keep it in case of refresh
    } catch (e) {
        console.warn('Error restoring form data:', e);
    }
}

// Checkout functionality
document.addEventListener('DOMContentLoaded', () => {
    const checkoutContent = document.getElementById('checkoutContent');
    const checkoutEmpty = document.getElementById('checkoutEmpty');

    // Check if cart is empty
    if (!cart || cart.items.length === 0) {
        checkoutContent.style.display = 'none';
        checkoutEmpty.style.display = 'block';
        return;
    }

    checkoutContent.style.display = 'grid';
    checkoutEmpty.style.display = 'none';

    renderCheckoutItems();

    // Restore form data if user switched language
    restoreCheckoutFormData();

    initCheckoutForm();
    initProgressSteps();
    initStickyPaymentInstructions();

    // Initialize Sendit integration
    // Load Sendit config from API first (for Vercel environment variables)
    if (typeof loadSenditConfigFromAPI === 'function') {
        loadSenditConfigFromAPI().then((apiConfig) => {
            // Update SENDIT_CONFIG with API values if available
            if (apiConfig && typeof SENDIT_CONFIG !== 'undefined') {
                let updated = false;
                Object.keys(apiConfig).forEach(key => {
                    if (apiConfig[key] !== 'YOUR_PUBLIC_KEY_HERE' &&
                        apiConfig[key] !== 'YOUR_SECRET_KEY_HERE' &&
                        apiConfig[key] !== null &&
                        apiConfig[key] !== undefined) {
                        SENDIT_CONFIG[key] = apiConfig[key];
                        updated = true;
                    }
                });
                if (updated) {
                    console.log('✅ Sendit config updated in checkout.js:', {
                        publicKey: SENDIT_CONFIG.PUBLIC_KEY ? (SENDIT_CONFIG.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET',
                        secretKey: SENDIT_CONFIG.SECRET_KEY ? 'SET' : 'NOT SET',
                        pickupDistrictId: SENDIT_CONFIG.PICKUP_DISTRICT_ID
                    });
                }
            }
            // Config loaded and updated, now initialize Sendit
            initSenditIntegration();
        }).catch((error) => {
            console.warn('⚠️ Could not load Sendit config from API, using defaults:', error);
            // API failed, try with defaults
            initSenditIntegration();
        });
    } else {
        // Function not available, initialize normally
        initSenditIntegration();
    }

    // Initialize PayPal after a short delay to ensure SDK has time to load
    // The SDK will trigger initPayPalAfterLoad when ready, but we also try here as fallback
    setTimeout(() => {
        initPayPal();
    }, 500);

    // Function to update progress steps based on form completion
    function initProgressSteps() {
        const form = document.getElementById('checkoutForm');
        if (!form) return;

        function updateProgress() {
            const firstName = document.getElementById('firstName')?.value.trim();
            const lastName = document.getElementById('lastName')?.value.trim();
            const email = document.getElementById('email')?.value.trim();
            const phone = document.getElementById('phone')?.value.trim();

            const address = document.getElementById('address')?.value.trim();
            // Check for new city input or legacy districtId
            const cityInput = document.getElementById('city');
            const city = cityInput ? cityInput.value.trim() : (document.getElementById('districtId')?.value.trim() || '');
            const postalCode = document.getElementById('postalCode')?.value.trim();
            const country = document.getElementById('country')?.value;

            // Step 1: Customer Information
            const step1 = firstName && lastName && email && phone;
            // Step 2: Shipping Information (city/district is required, postalCode is optional)
            const step2 = address && city && country;
            // Step 3: Payment (always active when we reach payment section)
            const step3 = step1 && step2;

            // Update step 1
            const step1El = document.querySelector('.progress-step[data-step="1"]');
            if (step1El) {
                if (step1) {
                    step1El.classList.add('active');
                } else {
                    step1El.classList.remove('active');
                }
            }

            // Update step 2
            const step2El = document.querySelector('.progress-step[data-step="2"]');
            if (step2El) {
                if (step2) {
                    step2El.classList.add('active');
                } else {
                    step2El.classList.remove('active');
                }
            }

            // Update step 3
            const step3El = document.querySelector('.progress-step[data-step="3"]');
            if (step3El) {
                if (step3) {
                    step3El.classList.add('active');
                } else {
                    step3El.classList.remove('active');
                }
            }
        }

        // Listen to all form inputs
        const inputs = form.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            input.addEventListener('input', updateProgress);
            input.addEventListener('change', updateProgress);
        });

        // Initial check - Step 1 is always active initially
        const step1El = document.querySelector('.progress-step[data-step="1"]');
        if (step1El) {
            step1El.classList.add('active');
        }
        updateProgress();
    }

    // Function to PROPERLY reload PayPal SDK with new locale
    // Includes complete cleanup to prevent "Request listener already exists" errors
    function reloadPayPalSDK(newLocale) {
        // Prevent multiple simultaneous reloads
        if (isReloadingSDK) {
            console.log('PayPal SDK reload already in progress, skipping...');
            return;
        }

        // Check if SDK is already loading from head script
        if (window.PAYPAL_SDK_LOADING) {
            console.log('PayPal SDK is already loading, skipping reload...');
            return;
        }

        // Clear any pending reload timeout
        if (reloadTimeout) {
            clearTimeout(reloadTimeout);
            reloadTimeout = null;
        }

        console.log('🔄 Reloading PayPal SDK with new locale:', newLocale);
        isReloadingSDK = true;

        // Show loading indicator immediately
        const container = document.getElementById('paypal-button-container');
        if (container) {
            container.innerHTML = '<div class="paypal-loading" id="paypal-loading"><div style="text-align: center; padding: 2rem;"><div style="margin-bottom: 1rem; font-size: 2rem;">⏳</div><p style="color: var(--text-dark); font-weight: 600;">Loading payment options in selected language...</p><p style="color: var(--text-light); font-size: 0.9rem;">Please wait a few seconds</p></div></div>';
        }

        // Step 1: Close existing button instance
        if (paypalButtonsInstance) {
            try {
                console.log('Closing PayPal button instance...');
                if (typeof paypalButtonsInstance.close === 'function') {
                    paypalButtonsInstance.close();
                }
            } catch (e) {
                console.warn('Error closing PayPal button instance:', e);
            }
            paypalButtonsInstance = null;
        }

        // Step 3: Reset all flags
        paypalButtonsRendered = false;
        window.paypalSDKReady = false;

        // Step 4: Remove old SDK script completely
        const oldScript = document.getElementById('paypal-sdk-loader');
        if (oldScript) {
            oldScript.remove();
            console.log('Old PayPal SDK script removed');
        }

        // Step 5: CRITICAL - Completely destroy PayPal global objects
        // This prevents "Request listener already exists" errors
        const paypalGlobalKeys = ['paypal', 'paypalSDK', 'PAYPAL'];
        paypalGlobalKeys.forEach(key => {
            if (typeof window[key] !== 'undefined') {
                try {
                    // Use delete operator
                    delete window[key];
                    console.log(`Deleted window.${key}`);
                } catch (e) {
                    // If delete fails, set to undefined
                    window[key] = undefined;
                    console.log(`Set window.${key} to undefined`);
                }
            }
        });

        // Step 6: Remove any PayPal-related iframes (they may hold listeners)
        const paypalIframes = document.querySelectorAll('iframe[name*="paypal"], iframe[src*="paypal"], iframe[name*="zoid"]');
        paypalIframes.forEach(iframe => {
            try {
                iframe.remove();
                console.log('Removed PayPal/Zoid iframe:', iframe.name || iframe.src.substring(0, 50));
            } catch (e) {
                console.warn('Error removing iframe:', e);
            }
        });

        // Step 7: Remove ALL remaining PayPal scripts (even duplicates)
        const allPayPalScripts = document.querySelectorAll('script[src*="paypal.com"]');
        console.log(`Found ${allPayPalScripts.length} PayPal script(s) to remove`);
        allPayPalScripts.forEach(script => {
            try {
                script.remove();
                console.log('Removed PayPal script:', script.src.substring(0, 80) + '...');
            } catch (e) {
                console.warn('Error removing PayPal script:', e);
            }
        });

        // Step 8: Clear any PayPal-related properties from window object
        // Including Zoid framework properties that persist
        const zoidKeys = Object.keys(window).filter(key =>
            key.toLowerCase().includes('paypal') ||
            key.toLowerCase().includes('zoid') ||
            key === '__paypal_checkout__'
        );
        zoidKeys.forEach(key => {
            try {
                delete window[key];
                console.log(`Deleted window.${key}`);
            } catch (e) {
                window[key] = undefined;
            }
        });

        // Step 9: Wait for cleanup to complete, then load new SDK
        console.log('⏳ Waiting for thorough cleanup (1200ms)...');
        setTimeout(() => {
            console.log('✨ Loading new PayPal SDK with locale:', newLocale);

            // Create new script element with new locale
            const newScript = document.createElement('script');
            newScript.id = 'paypal-sdk-loader';
            newScript.src = PAYPAL_CONFIG.getSDK_URL(newLocale);

            console.log('Loading SDK URL:', newScript.src);

            newScript.onload = function () {
                console.log('✅ PayPal SDK loaded successfully with locale:', newLocale);

                // Restart monitoring to detect the new SDK
                if (typeof window.restartPayPalMonitoring === 'function') {
                    window.restartPayPalMonitoring();
                }

                // Wait for SDK to fully initialize, then render buttons
                setTimeout(() => {
                    paypalButtonsRendered = false;
                    isReloadingSDK = false;
                    initPayPal();
                }, 1200); // Increased wait time for complete SDK initialization
            };

            newScript.onerror = function () {
                console.error('❌ Failed to reload PayPal SDK');
                isReloadingSDK = false;
                const loadingIndicator = document.getElementById('paypal-loading');
                if (loadingIndicator) {
                    loadingIndicator.innerHTML = '<p style="color: var(--primary-color);">Failed to load payment options. Please refresh the page.</p>';
                }
            };

            // Add to head
            document.head.appendChild(newScript);
        }, 1200); // Increased delay for more thorough cleanup (allow old SDK to fully terminate)
    }

    // Listen for language changes on CHECKOUT PAGE
    // SOLUTION: Reload entire page to get clean PayPal SDK state
    // This is the ONLY way to prevent PayPal's Zoid framework listener conflicts
    // Major e-commerce sites (Amazon, Shopify, eBay) do the same on checkout pages

    window.addEventListener('storage', (e) => {
        if (e.key === 'language') {
            const newLang = e.newValue || 'en';
            console.log('🔄 Language changed, reloading page for clean PayPal state...', newLang);

            // Save form data to sessionStorage before reload (preserve user input)
            saveCheckoutFormData();

            // Reload page to get fresh PayPal SDK with new locale
            // This prevents "Request listener already exists" errors
            setTimeout(() => {
                window.location.reload();
            }, 100);
        }
    });

    // Also listen for custom language change events (from script.js)
    document.addEventListener('languageChanged', (e) => {
        const newLang = e.detail?.lang || localStorage.getItem('language') || 'en';
        console.log('🔄 Language changed, reloading page for clean PayPal state...', newLang);

        // Save form data to sessionStorage before reload (preserve user input)
        saveCheckoutFormData();

        // Reload page to get fresh PayPal SDK with new locale
        setTimeout(() => {
            window.location.reload();
        }, 100);
    });

    // Track begin checkout
    if (typeof trackBeginCheckout === 'function' && cart.items.length > 0) {
        const totalValue = cart.getTotalPrice();
        trackBeginCheckout(cart.items, totalValue);
    }

    // Listen for language changes and re-render checkout items
    document.addEventListener('languageChanged', () => {
        renderCheckoutItems();
    });

    // Also listen for storage events (when language changes in another tab/window)
    window.addEventListener('storage', (e) => {
        if (e.key === 'language') {
            renderCheckoutItems();
        }
    });
});

function renderCheckoutItems() {
    const checkoutItems = document.getElementById('checkoutItems');
    const currentLang = localStorage.getItem('language') || 'en';
    let html = '';

    cart.items.forEach(item => {
        const productId = item.originalId || item.id;
        const product = products[productId];
        const name = product ? (product.name[currentLang] || product.name.en) : item.name;
        // Parse price - handle both "0.5 MAD" format and numeric values
        const currencySymbol = (typeof CONFIG !== 'undefined' && CONFIG.currency && CONFIG.currency.symbol) ? CONFIG.currency.symbol : 'MAD';

        // Parse price using cart helper if available, or generic cleanup
        let price = 0;
        if (cart && typeof cart.parsePrice === 'function') {
            price = cart.parsePrice(item.price || product?.price);
        } else {
            const priceStr = item.price || product?.price || '0';
            price = parseFloat(priceStr.toString().replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
        }
        const total = price * item.quantity;

        // Get image path - prefer item.image if stored, otherwise use variation image or product image
        let imagePath = '';
        let imageWebP = '';

        if (item.image) {
            // Image is stored in cart item (now likely a full URL or Path)
            // Use formatProductImageUrl from script.js
            const formatted = formatProductImageUrl(item.image, product?.imageExtension || 'jpg');
            imagePath = formatted.src;
            imageWebP = formatted.webp;
        } else if (item.variation && product?.variations && product.variations[item.variation] && product.variations[item.variation].images && product.variations[item.variation].images.length > 0) {
            // Use variation image if available
            const variationImage = product.variations[item.variation].images[0];
            const formatted = formatProductImageUrl(variationImage.path, variationImage.extension);
            imagePath = formatted.src;
            imageWebP = formatted.webp;
        } else if (product) {
            // Fallback to product image
            const mainImage = getProductMainImage(product);
            const formatted = formatProductImageUrl(mainImage.path, mainImage.extension);
            imagePath = formatted.src;
            imageWebP = formatted.webp;
        }

        html += `
            <div class="checkout-item">
                <div class="checkout-item-image">
                    ${imagePath ? `
                    <picture>
                        <source srcset="${imageWebP}" type="image/webp">
                        <img src="${imagePath}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                    </picture>
                    <div class="product-placeholder" style="display: none;"></div>` : `<div class="product-placeholder"></div>`}
                </div>
                <div class="checkout-item-details">
                    <h4>${name}</h4>
                    ${item.variation && product && product.variations && product.variations[item.variation] ? `<p class="checkout-item-variation">${product.variations[item.variation].name[currentLang] || product.variations[item.variation].name.en}</p>` : ''}
                    ${item.size ? `<p class="checkout-item-size">Size: ${item.size}</p>` : ''}
                    <p><span class="price-amount">${price % 1 === 0 ? price.toFixed(0) : price.toFixed(2)}</span> <span class="price-currency">${currencySymbol}</span> × ${item.quantity}</p>
                </div>
                <div class="checkout-item-total">
                    <span class="price-amount">${total % 1 === 0 ? total.toFixed(0) : total.toFixed(2)}</span> <span class="price-currency">${currencySymbol}</span>
                </div>
            </div>
        `;
    });

    checkoutItems.innerHTML = html;

    // Update totals
    const total = cart.getTotalPrice();
    const currencySymbol = (typeof CONFIG !== 'undefined' && CONFIG.currency && CONFIG.currency.symbol) ? CONFIG.currency.symbol : 'MAD';
    const formatPrice = (amount) => amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2);
    document.getElementById('checkoutSubtotal').textContent = formatPrice(total) + ' ' + currencySymbol;
    document.getElementById('checkoutTotal').textContent = formatPrice(total) + ' ' + currencySymbol;

    // Check if cart contains items tagged for express delivery
    const hasExpressProduct = cart.items.some(item => {
        const productId = item.originalId || item.id;
        // Look up product in catalog to check shipping tags
        const product = products[productId];
        return product && product.shipping && product.shipping.express;
    });

    // Update shipping info based on cart contents
    const shippingInfo = document.getElementById('checkoutShippingInfo');
    const shippingTimeIcon = document.getElementById('shippingTimeIcon');
    const shippingTimeText = document.getElementById('shippingTimeText');

    if (hasExpressProduct && shippingInfo && shippingTimeIcon && shippingTimeText) {
        shippingInfo.classList.add('express-delivery');
        shippingTimeIcon.textContent = '⚡';

        // Get translation for express delivery
        // Generic "Express Delivery" instead of hardcoded rules
        const expressText = typeof getTranslation === 'function'
            ? getTranslation('shipping.express', currentLang) || 'Express Delivery'
            : 'Express Delivery';

        shippingTimeText.innerHTML = `<span class="express-text"><strong>${expressText}</strong></span>`;
        shippingTimeText.removeAttribute('data-i18n');
    } else if (shippingInfo && shippingTimeIcon && shippingTimeText) {
        shippingInfo.classList.remove('express-delivery');
        shippingTimeIcon.textContent = '⏱️';
        shippingTimeText.setAttribute('data-i18n', 'productDetail.shippingInfo.deliveryTime');

        const deliveryText = typeof getTranslation === 'function'
            ? getTranslation('productDetail.shippingInfo.deliveryTime', currentLang) || '3-5 working days'
            : '3-5 working days';
        shippingTimeText.innerHTML = deliveryText;
    }

    // Update translations for data-i18n attributes
    setTimeout(() => {
        const lang = localStorage.getItem('language') || 'en';
        if (typeof getTranslation === 'function') {
            const checkoutContent = document.getElementById('checkoutContent');
            if (checkoutContent) {
                checkoutContent.querySelectorAll('[data-i18n]').forEach(element => {
                    const key = element.getAttribute('data-i18n');
                    const translation = getTranslation(key, lang);
                    if (translation) {
                        if (translation.includes('<span') || translation.includes('<')) {
                            element.innerHTML = translation;
                        } else {
                            element.textContent = translation;
                        }
                    }
                });
            }
        }
    }, 0);
}

function initCheckoutForm() {
    const form = document.getElementById('checkoutForm');
    const submitBtn = document.getElementById('submitOrder');

    // Real-time validation
    const inputs = form.querySelectorAll('input[required], select[required]');
    inputs.forEach(input => {
        input.addEventListener('blur', () => validateField(input));
        input.addEventListener('input', () => clearError(input));
    });

    // Handle payment method selection
    const paymentMethods = form.querySelectorAll('input[name="paymentMethod"]');
    const paypalContainer = document.getElementById('paypal-button-container');
    const codInfoSection = document.getElementById('cod-info-section');
    const manualOrderSection = document.getElementById('manual-order-section');
    const paymentInstructions = document.querySelector('.payment-instructions');

    function handlePaymentMethodChange() {
        const selectedMethod = form.querySelector('input[name="paymentMethod"]:checked')?.value;

        if (selectedMethod === 'cash_on_delivery') {
            // Show COD info, hide PayPal
            if (codInfoSection) codInfoSection.style.display = 'block';
            if (paypalContainer) paypalContainer.style.display = 'none';
            if (manualOrderSection) manualOrderSection.style.display = 'block';
            if (paymentInstructions) paymentInstructions.style.display = 'none';
        } else if (selectedMethod === 'paypal') {
            // Show PayPal, hide COD info
            if (codInfoSection) codInfoSection.style.display = 'none';
            if (paypalContainer) paypalContainer.style.display = 'block';
            if (manualOrderSection) manualOrderSection.style.display = 'none';
            if (paymentInstructions) paymentInstructions.style.display = 'block';
        }
    }

    // Listen for payment method changes
    paymentMethods.forEach(radio => {
        radio.addEventListener('change', handlePaymentMethodChange);
    });

    // Set default to Cash on Delivery (preferred in Morocco)
    const codRadio = document.getElementById('paymentCOD');
    if (codRadio) {
        codRadio.checked = true;
        handlePaymentMethodChange();
    }

    // PayPal will be initialized when SDK loads (via initPayPalAfterLoad)
    // or after timeout in DOMContentLoaded

    // Form submission (for COD and manual orders)
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        // Get selected payment method
        const selectedMethod = form.querySelector('input[name="paymentMethod"]:checked')?.value;

        // If PayPal is selected, let PayPal handle the submission
        if (selectedMethod === 'paypal') {
            // PayPal button will handle the payment
            return;
        }

        // Validate all fields for COD
        let isValid = true;
        inputs.forEach(input => {
            if (!validateField(input)) {
                isValid = false;
            }
        });

        if (!isValid) {
            const currentLang = localStorage.getItem('language') || 'en';
            const errors = {
                en: 'Please fill in all required fields correctly.',
                fr: 'Veuillez remplir tous les champs requis correctement.',
                ar: 'الرجاء ملء جميع الحقول المطلوبة بشكل صحيح.'
            };
            showFormError(errors[currentLang] || errors.en);
            return;
        }

        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = getTranslation('checkout.processing') || 'Processing...';
        }

        // Process COD order
        await processOrder('cash_on_delivery');
    });
}

async function initPayPal() {
    const paypalButtonContainer = document.getElementById('paypal-button-container');
    if (!paypalButtonContainer) {
        console.error('PayPal button container not found');
        return;
    }

    // Get PayPal SDK object (check multiple locations)
    const paypalObj = (typeof paypal !== 'undefined' && paypal)
        ? paypal
        : (typeof window.paypal !== 'undefined' && window.paypal)
            ? window.paypal
            : (window.paypalSDK) ? window.paypalSDK : null;

    // Check if PayPal SDK is ready
    if (paypalObj && paypalObj.Buttons) {
        console.log('PayPal SDK is ready, rendering buttons...');
        await renderPayPalButtons(paypalObj);
        return;
    }

    console.log('PayPal SDK not ready yet, waiting...');

    // Wait for PayPal SDK to load with timeout
    let attempts = 0;
    const maxAttempts = 100; // 10 seconds max wait (100 * 100ms)

    function waitForPayPal() {
        attempts++;
        // Only log every 10 attempts to reduce console spam
        if (attempts % 10 === 0 || attempts === 1) {
            console.log(`Waiting for PayPal SDK (attempt ${attempts}/${maxAttempts})...`);
        }

        const paypalObj = (typeof paypal !== 'undefined' && paypal)
            ? paypal
            : (typeof window.paypal !== 'undefined' && window.paypal)
                ? window.paypal
                : (window.paypalSDK) ? window.paypalSDK : null;

        if (paypalObj && paypalObj.Buttons) {
            console.log('PayPal SDK ready!');
            renderPayPalButtons(paypalObj).catch(err => {
                console.error('Error rendering PayPal buttons:', err);
            });
        } else if (attempts < maxAttempts) {
            // Retry after 100ms
            setTimeout(waitForPayPal, 100);
        } else {
            // Timeout - show error with debugging info
            console.error('PayPal SDK failed to load after timeout');
            console.log('Debug info:', {
                'typeof paypal': typeof paypal,
                'typeof window.paypal': typeof window.paypal,
                'window.paypalSDK': window.paypalSDK,
                'window.paypalSDKReady': window.paypalSDKReady
            });
            const loadingIndicator = document.getElementById('paypal-loading');
            if (loadingIndicator) {
                loadingIndicator.innerHTML = '<p style="color: var(--primary-color);">Payment options are taking longer than expected. Please check the browser console for errors and refresh the page.</p>';
            }
        }
    }

    waitForPayPal();
}

// Global function to be called when SDK loads
window.initPayPalAfterLoad = function () {
    console.log('initPayPalAfterLoad called');
    if (typeof initPayPal === 'function') {
        console.log('Calling initPayPal...');
        initPayPal();
    } else {
        console.error('initPayPal function not found');
    }
};

// Flag to prevent multiple renders
let paypalButtonsRendered = false;
let paypalButtonsInstance = null;
let isReloadingSDK = false;
let reloadTimeout = null;

// Get current language and map to PayPal locale
function getPayPalLocale() {
    const currentLang = localStorage.getItem('language') || 'en';
    if (typeof PAYPAL_CONFIG !== 'undefined' && PAYPAL_CONFIG.getLocale) {
        return PAYPAL_CONFIG.getLocale(currentLang);
    }
    // Fallback mapping
    const localeMap = {
        'en': 'en_US',
        'fr': 'fr_FR',
        'ar': 'ar_AE'
    };
    return localeMap[currentLang] || localeMap['en'];
}

// Get button style based on site theme
function getPayPalButtonStyle() {
    // Match site's primary color (#C8102E - red) with PayPal's available options
    // PayPal supports: 'gold', 'blue', 'silver', 'white', 'black'
    // Using 'gold' for premium look, or 'blue' for trust
    return {
        layout: 'vertical',
        color: 'gold', // Premium gold matches luxury brand feel
        shape: 'rect',
        label: 'paypal',
        height: 50 // Standard height
    };
}

async function renderPayPalButtons(paypalObj = null) {
    // Get container - check if it exists in DOM
    const paypalButtonContainer = document.getElementById('paypal-button-container');
    if (!paypalButtonContainer) {
        console.error('PayPal button container not found');
        return;
    }

    // Check if container is actually in the DOM
    if (!document.body.contains(paypalButtonContainer)) {
        console.error('PayPal button container is not in the DOM');
        return;
    }

    // Prevent multiple renders
    if (paypalButtonsRendered) {
        console.log('PayPal buttons already rendered, skipping...');
        return;
    }

    // Get PayPal SDK object
    if (!paypalObj) {
        paypalObj = (typeof paypal !== 'undefined' && paypal)
            ? paypal
            : (typeof window.paypal !== 'undefined' && window.paypal)
                ? window.paypal
                : (window.paypalSDK) ? window.paypalSDK : null;
    }

    // Check if PayPal SDK is available
    if (!paypalObj || !paypalObj.Buttons) {
        console.error('PayPal SDK not available', {
            paypalObj: paypalObj,
            'typeof paypal': typeof paypal,
            'typeof window.paypal': typeof window.paypal
        });
        const loadingIndicator = document.getElementById('paypal-loading');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p style="color: var(--primary-color);">PayPal SDK not loaded. Please refresh the page.</p>';
        }
        return;
    }

    // Check if cart has items
    if (!cart || !cart.items || cart.items.length === 0) {
        console.error('Cart is empty');
        const loadingIndicator = document.getElementById('paypal-loading');
        if (loadingIndicator) {
            loadingIndicator.innerHTML = '<p style="color: var(--primary-color);">Your cart is empty.</p>';
        }
        return;
    }

    // Hide loading indicator first
    const loadingIndicator = document.getElementById('paypal-loading');
    if (loadingIndicator) {
        loadingIndicator.style.display = 'none';
    }

    // Clear container content but preserve the container element itself
    // PayPal needs the container to exist in DOM when render() is called
    // We'll clear it carefully to avoid DOM removal issues
    const containerParent = paypalButtonContainer.parentNode;
    const containerNextSibling = paypalButtonContainer.nextSibling;

    // Store container attributes
    const containerId = paypalButtonContainer.id;
    const containerClass = paypalButtonContainer.className;

    // Clear inner content only (don't remove the container)
    paypalButtonContainer.innerHTML = '';

    // Verify container is still in DOM
    if (!document.body.contains(paypalButtonContainer)) {
        console.error('PayPal button container was removed from DOM after clearing');
        // Try to restore it
        if (containerParent) {
            const restoredContainer = document.createElement('div');
            restoredContainer.id = containerId;
            restoredContainer.className = containerClass;
            if (containerNextSibling) {
                containerParent.insertBefore(restoredContainer, containerNextSibling);
            } else {
                containerParent.appendChild(restoredContainer);
            }
            // Update reference
            const newContainer = document.getElementById('paypal-button-container');
            if (newContainer) {
                paypalButtonContainer = newContainer;
            } else {
                console.error('Failed to restore container');
                return;
            }
        } else {
            console.error('Cannot restore container - no parent found');
            return;
        }
    }

    // Get order total
    const total = cart.getTotalPrice();

    if (total <= 0) {
        console.error('Invalid order total:', total);
        paypalButtonContainer.innerHTML = '<p style="color: var(--primary-color); text-align: center;">Invalid order total. Please check your cart.</p>';
        return;
    }

    // Allow very small amounts (like 0.5 MAD for testing)
    // PayPal minimum is typically $0.01 USD, so 0.5 MAD = 0.05 USD is valid

    // Convert MAD to USD
    // Get conversion rate from config (preferably real-time) or use default
    let conversionRate = 0.1; // Default fallback

    if (typeof PAYPAL_CONFIG !== 'undefined') {
        // Try to get real-time rate if available
        if (typeof PAYPAL_CONFIG.getExchangeRate === 'function') {
            try {
                const realTimeRate = await PAYPAL_CONFIG.getExchangeRate();
                if (realTimeRate && !isNaN(realTimeRate)) {
                    conversionRate = realTimeRate;
                } else {
                    conversionRate = PAYPAL_CONFIG.MAD_TO_USD_RATE || 0.1;
                }
            } catch (error) {
                console.warn('Could not get real-time exchange rate, using configured rate:', error);
                conversionRate = PAYPAL_CONFIG.MAD_TO_USD_RATE || 0.1;
            }
        } else {
            conversionRate = PAYPAL_CONFIG.MAD_TO_USD_RATE || 0.1;
        }
    }

    const totalUSD = parseFloat((total * conversionRate).toFixed(2));

    if (totalUSD <= 0 || isNaN(totalUSD)) {
        console.error('Invalid USD total:', totalUSD);
        paypalButtonContainer.innerHTML = '<p style="color: var(--primary-color); text-align: center;">Invalid payment amount. Please check your cart.</p>';
        return;
    }

    try {
        console.log('Rendering PayPal buttons with amount:', totalUSD, 'USD');

        // Get fresh reference to container to ensure it's current
        const container = document.getElementById('paypal-button-container');
        if (!container || !document.body.contains(container)) {
            console.error('Container not in DOM before render');
            paypalButtonsRendered = false;
            return;
        }

        // Set flag to prevent re-rendering
        paypalButtonsRendered = true;

        // Get current locale and button style
        const locale = getPayPalLocale();
        const buttonStyle = getPayPalButtonStyle();

        console.log('Rendering PayPal buttons with locale:', locale, 'and style:', buttonStyle);

        // PayPal button configuration - use the container element directly
        paypalButtonsInstance = paypalObj.Buttons({
            style: buttonStyle,
            locale: locale, // Set locale for button language
            createOrder: function (data, actions) {
                // Validate form before creating order
                const form = document.getElementById('checkoutForm');
                if (!form) {
                    console.error('Checkout form not found');
                    throw new Error('FORM_NOT_FOUND');
                }

                const inputs = form.querySelectorAll('input[required], select[required]');
                let isValid = true;
                const missingFields = [];

                inputs.forEach(input => {
                    if (!validateField(input)) {
                        isValid = false;
                        const label = input.closest('.form-group')?.querySelector('label')?.textContent?.replace('*', '').trim() || input.name || 'field';
                        missingFields.push(label);
                    }
                });

                if (!isValid) {
                    // Show specific validation error message
                    const currentLang = localStorage.getItem('language') || 'en';
                    const messages = {
                        en: {
                            main: 'Please complete all required fields before proceeding with payment.',
                            help: 'Please fill in your name, email, phone, address, and select a city/district. Check the highlighted fields above for details.'
                        },
                        fr: {
                            main: 'Veuillez remplir tous les champs obligatoires avant de procéder au paiement.',
                            help: 'Veuillez remplir votre nom, email, téléphone, adresse et sélectionner une ville/quartier. Vérifiez les champs surlignés ci-dessus pour plus de détails.'
                        },
                        ar: {
                            main: 'يرجى إكمال جميع الحقول المطلوبة قبل المتابعة مع الدفع.',
                            help: 'يرجى ملء اسمك، البريد الإلكتروني، الهاتف، العنوان واختيار مدينة/حي. تحقق من الحقول المميزة أعلاه للتفاصيل.'
                        }
                    };
                    const msg = messages[currentLang] || messages.en;
                    showFormError(msg.main, msg.help);
                    // Scroll to first invalid field
                    const firstInvalid = form.querySelector('input.error, select.error');
                    if (firstInvalid) {
                        firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                    throw new Error('FORM_VALIDATION_FAILED');
                }

                // Create PayPal order - simple, no address collection
                // Address is already collected in checkout form, no need to ask again
                return actions.order.create({
                    purchase_units: [{
                        amount: {
                            value: totalUSD.toString(),
                            currency_code: 'USD'
                        },
                        description: `StoreName Order - ${cart.items.length} item(s)`
                    }],
                    application_context: {
                        shipping_preference: 'NO_SHIPPING' // Don't ask for shipping address in PayPal
                    }
                });
            },
            onApprove: function (data, actions) {
                return actions.order.capture().then(async function (details) {
                    // Payment successful
                    console.log('✅ Payment successful:', details);
                    console.log('🔄 Starting order processing with Sendit integration...');

                    // Determine funding source (credit card vs PayPal account)
                    // PayPal provides funding_source in data object for newer SDK versions
                    // Or we can check payment_source in details for more info
                    let fundingSource = 'paypal'; // default
                    if (data.fundingSource) {
                        fundingSource = data.fundingSource.toLowerCase(); // 'card' or 'paypal'
                    } else if (details.payment_source) {
                        // Check if card was used
                        if (details.payment_source.card) {
                            fundingSource = 'credit_card';
                        } else if (details.payment_source.paypal) {
                            fundingSource = 'paypal_account';
                        }
                    }
                    console.log('💳 Funding source:', fundingSource);

                    // Process order with PayPal payment details
                    try {
                        await processOrder('paypal', {
                            paypalOrderId: data.orderID,
                            paypalPayerId: details.payer.payer_id,
                            paypalEmail: details.payer.email_address,
                            transactionId: details.id,
                            fundingSource: fundingSource // credit_card, paypal_account, or paypal
                        });
                    } catch (orderError) {
                        console.error('❌ Order processing error:', orderError);
                        // Even if order processing fails, payment was successful
                        // Show error but don't block user
                        showFormError('Order processing encountered an issue. Your payment was successful. Please contact support with order ID: ' + data.orderID);
                    }
                }).catch(function (err) {
                    console.error('❌ Payment capture error:', err);
                    showFormError('Payment processing failed. Please try again.');
                });
            },
            onError: function (err) {
                console.error('PayPal error:', err);
                const currentLang = localStorage.getItem('language') || 'en';

                // Parse error message from various possible locations
                let errorMessage = err?.err || err?.message || err?.toString() || '';
                let errorString = typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage);

                // Check for JSON error strings (PayPal sometimes returns errors as JSON strings)
                try {
                    if (typeof errorMessage === 'string' && errorMessage.startsWith('{')) {
                        const parsed = JSON.parse(errorMessage);
                        if (parsed.message) {
                            errorMessage = parsed.message;
                            errorString = errorMessage;
                        }
                    }
                } catch (e) {
                    // Not JSON, continue with original error
                }

                // Check for errors in unhandledErrors array (PayPal SDK structure)
                if (err?.unhandledErrors && Array.isArray(err.unhandledErrors) && err.unhandledErrors.length > 0) {
                    const firstError = err.unhandledErrors[0];
                    if (firstError?.errors) {
                        try {
                            const parsedError = typeof firstError.errors === 'string'
                                ? JSON.parse(firstError.errors)
                                : firstError.errors;
                            if (parsedError?.message) {
                                errorMessage = parsedError.message;
                                errorString = errorMessage;
                            }
                        } catch (e) {
                            // Couldn't parse, use original
                        }
                    }
                }

                // Check for TRANSACTION_REFUSED or other specific payment errors
                const isTransactionRefused = errorString.includes('TRANSACTION_REFUSED') ||
                    errorString.includes('transaction_refused') ||
                    errorString.includes('CARD_DECLINED') ||
                    errorString.includes('card_declined') ||
                    errorString.includes('INSUFFICIENT_FUNDS') ||
                    errorString.includes('insufficient_funds');

                // Check if this is a form validation error
                const isValidationError = errorString.includes('FORM_VALIDATION_FAILED') ||
                    errorString.includes('Please fill in all required fields') ||
                    errorString.includes('Please complete all required fields') ||
                    errorString.includes('FORM_NOT_FOUND');

                if (isValidationError) {
                    // Validation error - show specific message (already shown in createOrder, but ensure it's visible)
                    const messages = {
                        en: {
                            main: 'Please complete all required fields before proceeding with payment.',
                            help: 'Please fill in your name, email, phone, address, and select a city/district. Check the highlighted fields above for details.'
                        },
                        fr: {
                            main: 'Veuillez remplir tous les champs obligatoires avant de procéder au paiement.',
                            help: 'Veuillez remplir votre nom, email, téléphone, adresse et sélectionner une ville/quartier. Vérifiez les champs surlignés ci-dessus pour plus de détails.'
                        },
                        ar: {
                            main: 'يرجى إكمال جميع الحقول المطلوبة قبل المتابعة مع الدفع.',
                            help: 'يرجى ملء اسمك، البريد الإلكتروني، الهاتف، العنوان واختيار مدينة/حي. تحقق من الحقول المميزة أعلاه للتفاصيل.'
                        }
                    };
                    const msg = messages[currentLang] || messages.en;
                    // Don't show duplicate error if already shown
                    const existingError = document.getElementById('formError');
                    if (!existingError || !existingError.textContent.includes(msg.main)) {
                        showFormError(msg.main, msg.help);
                    }
                } else if (isTransactionRefused) {
                    // Transaction refused / Card declined
                    const messages = {
                        en: {
                            main: 'Payment was declined by your bank or card issuer.',
                            help: 'Please try a different payment method, verify your card details, or contact your bank. You can also contact us for assistance at +212 667-951100.'
                        },
                        fr: {
                            main: 'Le paiement a été refusé par votre banque ou l\'émetteur de la carte.',
                            help: 'Veuillez essayer un autre moyen de paiement, vérifier les détails de votre carte ou contacter votre banque. Vous pouvez également nous contacter pour obtenir de l\'aide au +212 667-951100.'
                        },
                        ar: {
                            main: 'تم رفض الدفع من قبل البنك أو مصدر البطاقة.',
                            help: 'يرجى تجربة طريقة دفع أخرى، أو التحقق من تفاصيل بطاقتك، أو الاتصال ببنكك. يمكنك أيضًا الاتصال بنا للحصول على المساعدة على +212 667-951100.'
                        }
                    };
                    const msg = messages[currentLang] || messages.en;
                    showFormError(msg.main, msg.help);
                } else {
                    // Other payment errors
                    const messages = {
                        en: {
                            main: 'Payment couldn\'t be processed. Please try again.',
                            help: 'If this continues, please try a different payment method or contact us for assistance at +212 667-951100.'
                        },
                        fr: {
                            main: 'Le paiement n\'a pas pu être traité. Veuillez réessayer.',
                            help: 'Si cela continue, veuillez essayer un autre moyen de paiement ou contactez-nous pour obtenir de l\'aide au +212 667-951100.'
                        },
                        ar: {
                            main: 'لم يتم معالجة الدفع. يرجى المحاولة مرة أخرى.',
                            help: 'إذا استمر هذا، يرجى تجربة طريقة دفع أخرى أو الاتصال بنا للحصول على المساعدة على +212 667-951100.'
                        }
                    };
                    const msg = messages[currentLang] || messages.en;
                    showFormError(msg.main, msg.help);
                }
            },
            onCancel: function (data) {
                console.log('Payment cancelled:', data);
                // User cancelled, no action needed
            }
        });

        // Render buttons with enhanced error handling
        paypalButtonsInstance.render(container).then(function () {
            console.log('✅ PayPal buttons rendered successfully with locale:', locale);
        }).catch(function (err) {
            // Check if error is due to container removal (common during language switch/SDK reload)
            if (err && err.message && err.message.includes('removed from DOM')) {
                // This is EXPECTED during language changes - handle silently
                console.log('ℹ️ Container was removed during render (language change in progress). Buttons will re-render automatically.');
                // Reset flags and exit gracefully without logging error
                paypalButtonsRendered = false;
                paypalButtonsInstance = null;
                return; // Exit silently - this is normal behavior
            }

            // Only log UNEXPECTED errors
            console.error('❌ PayPal button render error:', err);

            // Reset flags on error
            paypalButtonsRendered = false;
            paypalButtonsInstance = null;

            // Show error message to user only for unexpected errors
            const errorContainer = document.getElementById('paypal-button-container');
            if (errorContainer && document.body.contains(errorContainer)) {
                errorContainer.innerHTML = '<p style="color: var(--primary-color); text-align: center; padding: var(--spacing-md);">Unable to load payment options. Please refresh the page or contact support.</p>';
            }
        });

        // Show loading state while button renders
        paypalButtonContainer.style.minHeight = '50px';
    } catch (error) {
        console.error('Error initializing PayPal buttons:', error);
        paypalButtonContainer.innerHTML = '<p style="color: var(--primary-color); text-align: center; padding: var(--spacing-md);">Error loading payment options. Please refresh the page.</p>';
    }
}

async function processOrder(paymentMethod, paymentDetails = null) {
    const form = document.getElementById('checkoutForm');
    const formData = new FormData(form);

    // Shipping is always free for customers
    const shippingCost = 0;

    // Store PayPal IDs for tracking update (if payment is via PayPal)
    const paypalTransactionId = paymentMethod === 'paypal' && paymentDetails ? paymentDetails.transactionId : null;
    const paypalOrderId = paymentMethod === 'paypal' && paymentDetails ? paymentDetails.paypalOrderId : null;

    const orderData = {
        customer: {
            firstName: formData.get('firstName'),
            lastName: formData.get('lastName'),
            email: formData.get('email'),
            phone: formData.get('phone')
        },
        shipping: {
            address: formData.get('address'),
            landmark: formData.get('landmark') || '', // Optional landmark
            districtId: formData.get('districtId') || document.getElementById('districtIdValue')?.value || '', // Sendit district ID (required) - get from hidden input
            postalCode: formData.get('postalCode') || '',
            country: formData.get('country'),
            notes: formData.get('notes') || ''
        },
        payment: {
            method: paymentMethod,
            details: paymentDetails
        },
        items: cart.items.map(item => {
            // Get product to determine image path
            const productId = item.originalId || item.id;
            const product = products[productId];

            // Calculate image path same way as renderCheckoutItems
            let imagePath = '';
            if (item.image) {
                const extension = product?.imageExtension || 'jpeg';
                imagePath = `/products/${item.image}.${extension}`;
            } else if (item.variation && product?.variations && product.variations[item.variation] && product.variations[item.variation].images && product.variations[item.variation].images.length > 0) {
                const variationImage = product.variations[item.variation].images[0];
                imagePath = `/products/${variationImage.path}.${variationImage.extension}`;
            } else if (product?.image) {
                imagePath = `/products/${product.image}.${product.imageExtension || 'jpeg'}`;
            }

            return {
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity,
                size: item.size || null,
                variation: item.variation || null,
                originalId: item.originalId || item.id,
                image: imagePath || null // Full image path
            };
        }),
        language: localStorage.getItem('language') || 'en', // Include user's language preference
        subtotal: cart.getTotalPrice(),
        shippingCost: 0, // Always free shipping
        total: cart.getTotalPrice(), // Total = subtotal (no shipping cost)
        orderNumber: 'TAR-' + Date.now()
    };

    try {
        // Validate required fields for Sendit
        // Check for city field first (new implementation), then fallback to districtId (legacy)
        const cityInput = document.getElementById('city');
        const cityValue = cityInput ? cityInput.value.trim() : '';
        const districtIdValue = orderData.shipping.districtId || document.getElementById('districtIdValue')?.value || '';

        if (!cityValue) {
            const currentLang = localStorage.getItem('language') || 'en';
            const errors = {
                en: 'Please enter your city name. This is required to process your order.',
                fr: 'Veuillez entrer le nom de votre ville. Ce champ est requis pour traiter votre commande.',
                ar: 'الرجاء إدخال اسم مدينتك. هذا الحقل مطلوب لمعالجة طلبك.'
            };
            alert(errors[currentLang] || errors.en);
            const submitBtn = document.getElementById('submitOrder');
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = getTranslation('checkout.placeOrder') || 'Place Order';
            }
            return;
        }

        // Always append city to the address we send to Sendit (better routing & clarity)
        if (cityValue) {
            const baseAddress = orderData.shipping.address || '';
            const normalizedBase = baseAddress.trim().toLowerCase();
            const normalizedCity = cityValue.trim().toLowerCase();
            // Avoid duplicating city if it's already at the end of the address
            if (!normalizedBase.endsWith(normalizedCity)) {
                orderData.shipping.address = baseAddress
                    ? `${baseAddress}, ${cityValue}`
                    : cityValue;
            }
        }

        // If districtId is not set but city is entered, try to match it one more time
        if (!districtIdValue && cityValue) {
            const match = matchCityWithDistrict(cityValue);
            if (match && match.id) {
                orderData.shipping.districtId = match.id;
                document.getElementById('districtIdValue').value = match.id;
                console.log(`✅ Last-minute match: "${cityValue}" -> district ID: ${match.id}`);
            } else {
                // No valid district match: use district_id = 46 (Casablanca - Autres quartiers) as fallback
                console.warn(`⚠️ No district match for "${cityValue}", falling back to district_id = 46 (Autres quartiers)`);
                orderData.shipping.districtId = 46;
                const hiddenDistrictInput = document.getElementById('districtIdValue');
                if (hiddenDistrictInput) {
                    hiddenDistrictInput.value = '46';
                }
            }
        }

        // Create delivery in Sendit (only if properly configured and district selected)
        let senditDelivery = null;
        const isSenditConfigured = typeof sendit !== 'undefined' &&
            typeof SENDIT_CONFIG !== 'undefined' &&
            SENDIT_CONFIG.PUBLIC_KEY &&
            SENDIT_CONFIG.PUBLIC_KEY !== 'YOUR_PUBLIC_KEY_HERE' &&
            SENDIT_CONFIG.SECRET_KEY &&
            SENDIT_CONFIG.SECRET_KEY !== 'YOUR_SECRET_KEY_HERE';

        // Log detailed configuration check
        console.log('🔍 Sendit Configuration Check:', {
            senditDefined: typeof sendit !== 'undefined',
            configDefined: typeof SENDIT_CONFIG !== 'undefined',
            publicKey: SENDIT_CONFIG?.PUBLIC_KEY ? (SENDIT_CONFIG.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET',
            secretKey: SENDIT_CONFIG?.SECRET_KEY ? 'SET' : 'NOT SET',
            districtId: orderData.shipping.districtId,
            districtIdType: typeof orderData.shipping.districtId,
            districtIdIsNumeric: !isNaN(parseInt(orderData.shipping.districtId)),
            country: orderData.shipping.country,
            isConfigured: isSenditConfigured,
            isMorocco: orderData.shipping.country === 'Morocco' || orderData.shipping.country === 'MA',
            paymentMethod: paymentMethod
        });

        // Check if order is for Morocco
        const isMorocco = orderData.shipping.country === 'Morocco' ||
            orderData.shipping.country === 'MA' ||
            orderData.shipping.country === 'Morocco';

        // Check if districtId is a valid Sendit ID (numeric) vs fallback city name
        const districtIdStr = String(orderData.shipping.districtId || '');
        const districtIdIsNumeric = !isNaN(parseInt(districtIdStr));
        const isFallbackCity = districtIdStr &&
            districtIdStr.match(/^(casablanca|rabat|marrakech|fes|tangier|agadir|meknes|oujda|kenitra|tetouan|safi|other)$/i);

        if (isSenditConfigured && isMorocco && orderData.shipping.districtId &&
            orderData.shipping.districtId !== '' &&
            !isFallbackCity && districtIdIsNumeric) {
            // Only create delivery if it's a real Sendit district ID (not fallback)
            try {
                senditDelivery = await sendit.createDelivery(orderData);

                if (!senditDelivery || !senditDelivery.deliveryCode) {
                    throw new Error('Sendit API returned invalid response: ' + JSON.stringify(senditDelivery));
                }

                // Store tracking information
                const trackingCode = senditDelivery.trackingCode || senditDelivery.deliveryCode;
                orderData.sendit = {
                    deliveryCode: senditDelivery.deliveryCode,
                    trackingCode: trackingCode,
                    trackingId: senditDelivery.deliveryData?.id || null,
                    labelUrl: senditDelivery.labelUrl || null,
                    createdAt: new Date().toISOString()
                };

                // Send tracking to PayPal if payment was via PayPal
                // Use transactionId (capture ID) if available, otherwise use orderId
                if (paymentMethod === 'paypal' && (paypalTransactionId || paypalOrderId)) {
                    const paypalId = paypalTransactionId || paypalOrderId;
                    sendTrackingToPayPal(paypalId, trackingCode).catch(error => {
                        console.error('PayPal tracking update error (non-blocking):', error);
                        // Don't block order completion if PayPal tracking update fails
                    });
                }

            } catch (senditError) {
                console.error('Sendit delivery creation failed:', senditError.message);

                // Save error to localStorage for debugging (minimal)
                const errorLog = {
                    timestamp: new Date().toISOString(),
                    orderNumber: orderData.orderNumber,
                    event: 'sendit_delivery_failed',
                    error: {
                        message: senditError?.message,
                        statusCode: senditError?.statusCode
                    }
                };
                localStorage.setItem(`sendit_error_${orderData.orderNumber}`, JSON.stringify(errorLog));
                // Show user-friendly error but allow order to proceed
                /* 
                // Suppressed per user request: Don't show technical/stock errors to customer
                // just proceed with the order confirmation.
                const currentLang = localStorage.getItem('language') || 'en';
                const messages = {
                    en: {
                        main: 'Delivery tracking setup is delayed, but your order is confirmed!',
                        help: 'We\'ll contact you with tracking information shortly. Your order will be processed normally.'
                    },
                    fr: {
                        main: 'La configuration du suivi de livraison est retardée, mais votre commande est confirmée!',
                        help: 'Nous vous contacterons avec les informations de suivi sous peu. Votre commande sera traitée normalement.'
                    },
                    ar: {
                        main: 'إعداد تتبع التسليم متأخر، لكن طلبك مؤكد!',
                        help: 'سنواصل معك بمعلومات التتبع قريبًا. سيتم معالجة طلبك بشكل طبيعي.'
                    }
                };
                const msg = messages[currentLang] || messages.en;
                // Show non-blocking notification
                showFormError(msg.main, msg.help);
                */
                console.log('⚠️ Sendit error suppressed from UI, proceeding with order.');
                // Continue with order even if Sendit fails
                // Order will be saved but without tracking
            }
        } else {
            const reasons = [];
            if (!isSenditConfigured) reasons.push('Sendit not configured (missing API keys)');
            if (!isMorocco) reasons.push(`Country is not Morocco (${orderData.shipping.country})`);
            if (!orderData.shipping.districtId || orderData.shipping.districtId === '') reasons.push('No district selected');
            if (isFallbackCity) reasons.push(`Using fallback city (${orderData.shipping.districtId}) - Please select a real Sendit district`);
            if (orderData.shipping.districtId && !districtIdIsNumeric) reasons.push(`District ID is not numeric (${orderData.shipping.districtId}) - Must be a numeric Sendit district ID`);

        }

        // Save order to localStorage
        const orders = JSON.parse(localStorage.getItem('storename_orders') || '[]');
        orders.push(orderData);
        localStorage.setItem('storename_orders', JSON.stringify(orders));

        // Save debug logs to localStorage before redirect (so they survive page reload)
        const debugLog = {
            timestamp: new Date().toISOString(),
            orderNumber: orderData.orderNumber,
            paymentMethod: paymentMethod,
            senditDelivery: senditDelivery ? {
                deliveryCode: senditDelivery.deliveryCode,
                trackingCode: senditDelivery.trackingCode,
                success: true
            } : null,
            senditConfig: {
                isConfigured: isSenditConfigured,
                publicKey: SENDIT_CONFIG?.PUBLIC_KEY ? (SENDIT_CONFIG.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET',
                secretKey: SENDIT_CONFIG?.SECRET_KEY ? 'SET' : 'NOT SET'
            },
            orderData: {
                districtId: orderData.shipping.districtId,
                districtIdIsNumeric: districtIdIsNumeric,
                isFallbackCity: !!isFallbackCity,
                country: orderData.shipping.country,
                isMorocco: isMorocco
            },
            senditAttempted: isSenditConfigured && isMorocco && orderData.shipping.districtId &&
                orderData.shipping.districtId !== '' &&
                !isFallbackCity && districtIdIsNumeric
        };

        // Save to localStorage with order number as key for easy lookup
        localStorage.setItem(`order_debug_${orderData.orderNumber}`, JSON.stringify(debugLog, null, 2));

        // Add Sendit delivery info to orderData if available
        if (senditDelivery) {
            orderData.sendit = {
                deliveryCode: senditDelivery.deliveryCode,
                trackingCode: senditDelivery.trackingCode
            };
        }

        // Add timestamp to orderData
        orderData.timestamp = new Date().toISOString();

        // Send confirmation emails (non-blocking - don't wait for response)
        sendOrderEmails(orderData).catch(error => {
            console.error('Email sending error (non-blocking):', error);
            // Don't block order completion if email fails
        });

        // Track purchase
        if (typeof trackPurchase === 'function') {
            trackPurchase(orderData.orderNumber, cart.items, orderData.total, shippingCost);
        }

        // Clear cart
        cart.clearCart();

        // Redirect to confirmation page with tracking info and payment method
        const paymentParam = paymentMethod === 'cash_on_delivery' ? 'cod' : 'paypal';
        const redirectUrl = senditDelivery
            ? `confirmation.html?order=${orderData.orderNumber}&tracking=${senditDelivery.trackingCode}&payment=${paymentParam}`
            : `confirmation.html?order=${orderData.orderNumber}&payment=${paymentParam}`;

        // Redirect to confirmation page
        setTimeout(() => {
            window.location.href = redirectUrl;
        }, 2000);

    } catch (error) {
        console.error('Order processing error:', error);
        const submitBtn = document.getElementById('submitOrder');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = getTranslation('checkout.placeOrder') || 'Place Order';
        }

        const currentLang = localStorage.getItem('language') || 'en';
        const messages = {
            en: {
                main: 'We couldn\'t complete your order. Don\'t worry, you weren\'t charged.',
                help: 'Please try again or contact us at +212 667-951100 for assistance.'
            },
            fr: {
                main: 'Nous n\'avons pas pu finaliser votre commande. Ne vous inquiétez pas, vous n\'avez pas été facturé.',
                help: 'Veuillez réessayer ou contactez-nous au +212 667-951100 pour obtenir de l\'aide.'
            },
            ar: {
                main: 'لم نتمكن من إتمام طلبك. لا تقلق، لم يتم خصمك.',
                help: 'يرجى المحاولة مرة أخرى أو الاتصال بنا على +212 667-951100 للحصول على المساعدة.'
            }
        };
        const msg = messages[currentLang] || messages.en;
        showFormError(msg.main, msg.help);
    }
}

// Function to send tracking number to PayPal
async function sendTrackingToPayPal(paypalOrderId, trackingNumber) {
    try {
        console.log('📦 Sending tracking to PayPal:', { paypalOrderId, trackingNumber });

        const response = await fetch('/api/paypal-add-tracking', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                paypalOrderId: paypalOrderId,
                trackingNumber: trackingNumber,
                carrier: 'OTHER' // Sendit is not in PayPal's standard carrier list
            })
        });

        if (response.ok) {
            const result = await response.json();
            if (result.success) {
                console.log('✅ Tracking sent to PayPal successfully:', result);
            } else {
                console.warn('⚠️ PayPal tracking warning:', result.warning || result.note);
            }
            return { success: true, result };
        } else {
            const error = await response.json();
            console.error('❌ PayPal tracking error:', error);
            return { success: false, error };
        }
    } catch (error) {
        console.error('❌ PayPal tracking request error:', error);
        return { success: false, error };
    }
}

// Send order confirmation emails to customer and admin
async function sendOrderEmails(orderData) {
    try {
        console.log('📧 Sending order confirmation emails...');

        // Helper function to send email with retry logic
        const sendEmail = async (emailType, retries = 2) => {
            for (let attempt = 0; attempt <= retries; attempt++) {
                try {
                    // Create AbortController for timeout
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

                    const response = await fetch('/api/send-order-email', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            orderData: orderData,
                            emailType: emailType
                        }),
                        signal: controller.signal
                    });

                    clearTimeout(timeoutId);

                    if (response.ok) {
                        const result = await response.json();
                        console.log(`✅ ${emailType} email sent:`, result.messageId);
                        return { success: true, result };
                    } else {
                        const error = await response.json();
                        console.error(`❌ ${emailType} email error (attempt ${attempt + 1}):`, error);
                        if (attempt === retries) {
                            return { success: false, error };
                        }
                    }
                } catch (fetchError) {
                    // NetworkError can occur due to CORS, network issues, or API unavailability
                    console.error(`❌ ${emailType} email fetch error (attempt ${attempt + 1}):`, fetchError);
                    console.error(`Error details:`, {
                        name: fetchError.name,
                        message: fetchError.message,
                        type: fetchError.constructor.name
                    });

                    // If it's a NetworkError and we have retries left, wait longer before retry
                    if (attempt < retries) {
                        const waitTime = 2000 * (attempt + 1); // Longer wait: 2s, 4s, 6s
                        console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                        await new Promise(resolve => setTimeout(resolve, waitTime));
                        continue; // Retry
                    }

                    // Final attempt failed
                    return { success: false, error: fetchError };
                }
            }
        };

        // Send customer confirmation email
        const customerEmailResult = await sendEmail('customer');
        if (customerEmailResult && customerEmailResult.success) {
            console.log('✅ Customer email sent successfully');
        } else {
            console.warn('⚠️ Customer email failed, but continuing with order...');
        }

        // Send admin notification email (Now handled by server side-effect on 'customer' email)
        console.log('📧 Customer email sent & Admin notification triggered via server side-effect');

    } catch (error) {
        console.error('❌ Email sending error:', error);
        // Silently fail - don't interrupt order flow
    }
}

function validateField(field) {
    const value = field.value.trim();
    const errorSpan = field.parentElement.querySelector('.error-message');
    let isValid = true;
    let errorMessage = '';

    // Required field check
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = getTranslation('checkout.required') || 'This field is required';
    }

    // Email validation
    if (field.type === 'email' && value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            isValid = false;
            errorMessage = getTranslation('checkout.invalidEmail') || 'Please enter a valid email address';
        }
    }

    // Phone validation (Moroccan format)
    if (field.type === 'tel' && value) {
        // Remove all non-digits
        const digitsOnly = value.replace(/\D/g, '');
        // Moroccan phone: 10 digits starting with 0, or 12 digits with country code
        const moroccanPhoneRegex = /^(0[5-7]\d{8}|212[5-7]\d{8})$/;
        if (digitsOnly.length < 10 || !moroccanPhoneRegex.test(digitsOnly)) {
            isValid = false;
            errorMessage = getTranslation('checkout.invalidPhone') || 'Please enter a valid Moroccan phone number (e.g., 0612345678)';
        }
    }

    // Postal code validation (5 digits)
    if (field.id === 'postalCode' && value) {
        const postalCodeRegex = /^\d{5}$/;
        if (!postalCodeRegex.test(value)) {
            isValid = false;
            errorMessage = getTranslation('checkout.invalidPostalCode') || 'Postal code must be 5 digits';
        }
    }

    // District validation (required for Sendit)
    // Check districtId - use hidden input if autocomplete is used
    if (field.id === 'districtId') {
        const hiddenInput = document.getElementById('districtIdValue');
        const districtValue = hiddenInput ? hiddenInput.value : value;
        if (field.hasAttribute('required') && !districtValue) {
            isValid = false;
            errorMessage = getTranslation('checkout.districtRequired') || 'Please select a city/district for delivery';
        }
    }

    // Update UI
    if (isValid) {
        field.classList.remove('error');
        if (errorSpan) {
            errorSpan.textContent = '';
            errorSpan.style.display = 'none';
        }
    } else {
        field.classList.add('error');
        if (errorSpan) {
            errorSpan.textContent = errorMessage;
            errorSpan.style.display = 'block';
        }
    }

    return isValid;
}

function clearError(field) {
    field.classList.remove('error');
    const errorSpan = field.parentElement.querySelector('.error-message');
    if (errorSpan) {
        errorSpan.textContent = '';
        errorSpan.style.display = 'none';
    }
}

function showFormError(message, helpText = null) {
    // Create or update error message
    let errorDiv = document.getElementById('formError');
    if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.id = 'formError';
        errorDiv.className = 'form-error';
        const form = document.getElementById('checkoutForm');
        if (form) {
            form.insertBefore(errorDiv, form.firstChild);
        }
    }

    // Enhanced error display with help text
    if (helpText) {
        errorDiv.innerHTML = `
            <div class="error-main">${message}</div>
            <div class="error-help">${helpText}</div>
        `;
    } else {
        errorDiv.textContent = message;
    }

    errorDiv.classList.add('show');
    errorDiv.style.display = 'block';

    // Scroll to error
    errorDiv.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Hide after 8 seconds (longer for better UX)
    setTimeout(() => {
        errorDiv.classList.remove('show');
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 300);
    }, 8000);
}

function getTranslation(key) {
    const currentLang = localStorage.getItem('language') || 'en';
    const keys = key.split('.');
    let value = translations[currentLang];

    for (const k of keys) {
        if (value && value[k]) {
            value = value[k];
        } else {
            return null;
        }
    }

    return value;
}

// City matching with SendIt districts (background)
let senditDistrictsCache = null;
let cityMatchingTimeout = null;

// Load SendIt districts in background
async function loadSenditDistrictsInBackground() {
    try {
        // Check if Sendit is configured
        const isSenditConfigured = typeof SENDIT_CONFIG !== 'undefined' &&
            typeof sendit !== 'undefined' &&
            SENDIT_CONFIG.PUBLIC_KEY &&
            SENDIT_CONFIG.PUBLIC_KEY !== 'YOUR_PUBLIC_KEY_HERE' &&
            SENDIT_CONFIG.SECRET_KEY &&
            SENDIT_CONFIG.SECRET_KEY !== 'YOUR_SECRET_KEY_HERE';

        if (!isSenditConfigured) {
            console.log('⚠️ Sendit not configured, skipping district loading');
            return;
        }

        console.log('🔄 Loading SendIt districts in background...');
        const districts = await sendit.getDistricts();

        if (districts && districts.length > 0) {
            senditDistrictsCache = districts;
            console.log(`✅ Loaded ${districts.length} districts from SendIt`);
        } else {
            console.warn('⚠️ No districts loaded from SendIt');
        }
    } catch (error) {
        console.error('❌ Error loading SendIt districts:', error);
        // Continue without districts - user can still enter city
    }
}

// Match city name with SendIt districts (supports both French and Arabic names)
function matchCityWithDistrict(cityName) {
    if (!senditDistrictsCache || !Array.isArray(senditDistrictsCache) || senditDistrictsCache.length === 0) {
        return null;
    }

    if (!cityName || cityName.trim().length < 2) {
        return null;
    }

    const cityLower = cityName.toLowerCase().trim();
    const cityWords = cityLower.split(/\s+/).filter(w => w.length > 0);

    // Check if input is Arabic (contains Arabic characters)
    const isArabicInput = /[\u0600-\u06FF]/.test(cityName);

    // Try to find best match
    let bestMatch = null;
    let bestScore = 0;

    senditDistrictsCache.forEach(district => {
        const districtCity = (district.ville || district.name || '').toLowerCase().trim();
        const districtName = (district.name || '').toLowerCase().trim();
        const districtArabic = (district.arabic_name || '').trim(); // Arabic name from cache

        // === ARABIC MATCHING ===
        if (isArabicInput && districtArabic) {
            // Exact Arabic match
            if (districtArabic === cityName.trim()) {
                bestMatch = district;
                bestScore = 100;
                return;
            }

            // Arabic starts with match
            if (districtArabic.startsWith(cityName.trim())) {
                if (bestScore < 85) {
                    bestMatch = district;
                    bestScore = 85;
                }
            }

            // Arabic contains match
            if (districtArabic.includes(cityName.trim())) {
                if (bestScore < 70) {
                    bestMatch = district;
                    bestScore = 70;
                }
            }

            // Arabic word-by-word match
            const arabicWords = districtArabic.split(/\s+/).filter(w => w.length > 0);
            const inputArabicWords = cityName.trim().split(/\s+/).filter(w => w.length > 0);
            const matchingArabicWords = inputArabicWords.filter(word =>
                arabicWords.some(aWord => aWord.includes(word) || word.includes(aWord))
            );

            if (matchingArabicWords.length > 0) {
                const arabicWordScore = (matchingArabicWords.length / inputArabicWords.length) * 65;
                if (arabicWordScore > bestScore) {
                    bestMatch = district;
                    bestScore = arabicWordScore;
                }
            }
        }

        // === FRENCH/ENGLISH MATCHING ===
        // Exact match
        if (districtCity === cityLower || districtName === cityLower) {
            bestMatch = district;
            bestScore = 100;
            return;
        }

        // Starts with match
        if (districtCity.startsWith(cityLower) || districtName.startsWith(cityLower)) {
            if (bestScore < 80) {
                bestMatch = district;
                bestScore = 80;
            }
        }

        // Contains match
        if (districtCity.includes(cityLower) || districtName.includes(cityLower)) {
            if (bestScore < 60) {
                bestMatch = district;
                bestScore = 60;
            }
        }

        // Word-by-word match (for multi-word cities like "Casablanca - California")
        const districtWords = districtCity.split(/\s+/).filter(w => w.length > 0);
        const matchingWords = cityWords.filter(word =>
            districtWords.some(dWord => dWord.includes(word) || word.includes(dWord))
        );

        if (matchingWords.length > 0 && matchingWords.length === cityWords.length) {
            const wordScore = (matchingWords.length / cityWords.length) * 50;
            if (wordScore > bestScore) {
                bestMatch = district;
                bestScore = wordScore;
            }
        }
    });

    if (bestMatch && bestScore >= 50) {
        console.log(`🎯 City match: "${cityName}" -> "${bestMatch.name}" (${bestMatch.arabic_name || 'no Arabic'}) ID: ${bestMatch.id} (score: ${bestScore})`);
    }

    return bestMatch && bestScore >= 50 ? bestMatch : null;
}

// Initialize city input with autocomplete and automatic matching
function initCityInputWithMatching() {
    const cityInput = document.getElementById('city');
    const districtHiddenInput = document.getElementById('districtIdValue');
    const autocompleteList = document.getElementById('cityAutocompleteList');

    if (!cityInput || !districtHiddenInput) {
        return;
    }

    // Load districts in background
    loadSenditDistrictsInBackground();

    let selectedIndex = -1;
    let currentSuggestions = [];

    // Get current language
    const getCurrentLang = () => localStorage.getItem('language') || 'en';

    // "Other" option translations
    const otherTranslations = {
        en: { primary: 'Other City', secondary: 'Not in the list? Select this option', info: 'We\'ll contact you to confirm delivery' },
        fr: { primary: 'Autre Ville', secondary: 'Pas dans la liste? Sélectionnez cette option', info: 'Nous vous contacterons pour confirmer la livraison' },
        ar: { primary: 'مدينة أخرى', secondary: 'غير موجودة في القائمة؟ اختر هذا الخيار', info: 'سنتصل بك لتأكيد التوصيل' }
    };

    // Common abbreviations and aliases for better matching
    const cityAliases = {
        'casa': 'casablanca',
        'd': 'dar',
        'dar': 'casablanca',  // Dar el Beida = Casablanca
        'beida': 'casablanca',
        'rb': 'rabat',
        'rab': 'rabat',
        'mk': 'marrakech',
        'mar': 'marrakech',
        'mkch': 'marrakech',
        'tng': 'tangier',
        'tan': 'tangier',
        'tang': 'tangier',
        'ag': 'agadir',
        'fes': 'fes',
        'fs': 'fes',
        'mek': 'meknes',
        'mkn': 'meknes',
        'ouj': 'oujda',
        'tet': 'tetouan',
        'ken': 'kenitra',
        'saf': 'safi',
        'el': 'al',
        'al': 'al',
        'bni': 'beni',
        'bn': 'beni',
        'si': 'sidi',
        'sd': 'sidi',
        'mly': 'moulay',
        'ml': 'moulay'
    };

    // Expand abbreviations in query
    const expandAbbreviations = (word) => {
        const lower = word.toLowerCase();
        return cityAliases[lower] || lower;
    };

    // Calculate match score for a district against query words
    const calculateMatchScore = (district, queryWords, isArabicQuery) => {
        const name = (district.name || '').toLowerCase();
        const ville = (district.ville || '').toLowerCase();
        const arabicName = (district.arabic_name || '').toLowerCase();

        // Combine all searchable text
        const searchText = `${ville} ${name} ${arabicName}`.toLowerCase();
        const searchWords = searchText.split(/[\s\-_,]+/).filter(w => w.length > 0);

        let score = 0;
        let matchedWords = 0;
        let consecutiveBonus = 0;

        // For Arabic queries, prioritize Arabic name matching
        if (isArabicQuery) {
            const queryText = queryWords.join(' ');
            if (arabicName.includes(queryText)) {
                score += 100;
                matchedWords = queryWords.length;
            } else {
                // Check word-by-word Arabic matching
                queryWords.forEach((qWord, idx) => {
                    if (arabicName.includes(qWord)) {
                        score += 20;
                        matchedWords++;
                        // Consecutive word bonus
                        if (idx > 0 && arabicName.includes(queryWords[idx - 1] + ' ' + qWord)) {
                            consecutiveBonus += 10;
                        }
                    }
                });
            }
            // Also check Latin names for mixed queries
            queryWords.forEach(qWord => {
                const expanded = expandAbbreviations(qWord);
                searchWords.forEach(sWord => {
                    if (sWord.startsWith(expanded) || expanded.startsWith(sWord.substring(0, 3))) {
                        score += 5;
                    }
                });
            });
        } else {
            // Latin query matching with fuzzy support
            queryWords.forEach((qWord, idx) => {
                const expanded = expandAbbreviations(qWord);
                let wordMatched = false;
                let bestWordScore = 0;

                searchWords.forEach(sWord => {
                    // Exact word match
                    if (sWord === expanded) {
                        bestWordScore = Math.max(bestWordScore, 30);
                        wordMatched = true;
                    }
                    // Word starts with query
                    else if (sWord.startsWith(expanded)) {
                        bestWordScore = Math.max(bestWordScore, 25);
                        wordMatched = true;
                    }
                    // Query starts with word (abbreviation)
                    else if (expanded.startsWith(sWord.substring(0, Math.min(3, sWord.length)))) {
                        bestWordScore = Math.max(bestWordScore, 15);
                        wordMatched = true;
                    }
                    // Contains match (less weight)
                    else if (sWord.includes(expanded) && expanded.length >= 3) {
                        bestWordScore = Math.max(bestWordScore, 10);
                        wordMatched = true;
                    }
                    // Partial match for longer words
                    else if (expanded.length >= 4 && sWord.includes(expanded.substring(0, 4))) {
                        bestWordScore = Math.max(bestWordScore, 8);
                        wordMatched = true;
                    }
                });

                if (wordMatched) {
                    matchedWords++;
                    score += bestWordScore;

                    // Check consecutive words match in original string
                    if (idx > 0) {
                        const prevExpanded = expandAbbreviations(queryWords[idx - 1]);
                        if (searchText.includes(prevExpanded) && searchText.includes(expanded)) {
                            const prevIdx = searchText.indexOf(prevExpanded);
                            const currIdx = searchText.indexOf(expanded);
                            if (currIdx > prevIdx && currIdx - prevIdx < 20) {
                                consecutiveBonus += 15;
                            }
                        }
                    }
                }
            });
        }

        // Bonus for matching all query words
        if (matchedWords === queryWords.length && queryWords.length > 1) {
            score += 30;
        }

        // Bonus for exact city name match
        if (ville && queryWords.some(qw => ville.startsWith(expandAbbreviations(qw)))) {
            score += 10;
        }

        // Add consecutive bonus
        score += consecutiveBonus;

        // Penalize very long names if query is short (prefer simpler matches)
        if (queryWords.length <= 2 && name.length > 30) {
            score -= 5;
        }

        return { score, matchedWords, total: queryWords.length };
    };

    // Filter and get autocomplete suggestions with advanced fuzzy matching
    const getAutocompleteSuggestions = (query) => {
        if (!senditDistrictsCache || senditDistrictsCache.length === 0 || query.length < 2) {
            return [];
        }

        const queryLower = query.toLowerCase().trim();
        const isArabicQuery = /[\u0600-\u06FF]/.test(query);

        // Split query into words, filter out very short ones except known abbreviations
        const queryWords = queryLower.split(/[\s\-_,]+/)
            .map(w => w.trim())
            .filter(w => w.length >= 1 && (w.length >= 2 || cityAliases[w]));

        if (queryWords.length === 0) {
            return [];
        }

        // Score all districts
        const scoredMatches = [];

        senditDistrictsCache.forEach(district => {
            const result = calculateMatchScore(district, queryWords, isArabicQuery);

            // Only include if at least one word matched and score is reasonable
            if (result.matchedWords > 0 && result.score >= 8) {
                scoredMatches.push({
                    district,
                    score: result.score,
                    matchedWords: result.matchedWords,
                    matchRatio: result.matchedWords / result.total
                });
            }
        });

        // Sort by score (descending), then by match ratio, then alphabetically
        scoredMatches.sort((a, b) => {
            // Prioritize full matches (all query words found)
            if (a.matchRatio === 1 && b.matchRatio < 1) return -1;
            if (b.matchRatio === 1 && a.matchRatio < 1) return 1;

            // Then by score
            if (b.score !== a.score) return b.score - a.score;

            // Then by match ratio
            if (b.matchRatio !== a.matchRatio) return b.matchRatio - a.matchRatio;

            // Finally alphabetically
            const aName = (a.district.name || '').toLowerCase();
            const bName = (b.district.name || '').toLowerCase();
            return aName.localeCompare(bName);
        });

        // Return top 8 matches
        return scoredMatches.slice(0, 8).map(m => m.district);
    };

    // Helper to reset autocomplete position/styling
    const resetAutocompletePosition = () => {
        autocompleteList.classList.remove('show', 'position-above');
        autocompleteList.style.maxHeight = '';
    };

    // Render autocomplete dropdown
    const renderAutocomplete = (suggestions) => {
        if (!autocompleteList) return;

        autocompleteList.innerHTML = '';
        currentSuggestions = suggestions;
        selectedIndex = -1;

        // Reset positioning before showing
        autocompleteList.classList.remove('position-above');
        autocompleteList.style.maxHeight = '';

        if (suggestions.length === 0 && cityInput.value.trim().length < 2) {
            resetAutocompletePosition();
            return;
        }

        const currentLang = getCurrentLang();
        const isArabic = currentLang === 'ar';

        // Add matching suggestions
        suggestions.forEach((district, index) => {
            const item = document.createElement('div');
            item.className = 'city-autocomplete-item';
            item.dataset.index = index;
            item.dataset.id = district.id;

            const primaryName = document.createElement('div');
            primaryName.className = 'city-name-primary';

            const secondaryName = document.createElement('div');
            secondaryName.className = 'city-name-secondary';

            const infoLine = document.createElement('div');
            infoLine.className = 'city-info';

            if (isArabic && district.arabic_name) {
                // Arabic mode: Arabic as primary
                primaryName.textContent = district.arabic_name;
                primaryName.dir = 'rtl';
                if (district.name !== district.arabic_name) {
                    secondaryName.textContent = district.name;
                    secondaryName.dir = 'ltr';
                }
            } else {
                // French/English mode
                primaryName.textContent = district.name || district.ville;
                if (district.arabic_name) {
                    secondaryName.textContent = district.arabic_name;
                    secondaryName.dir = 'rtl';
                }
            }

            // Price and delivery info
            if (district.price) {
                infoLine.textContent = `${district.price} DH · ${district.delais || '24h-48h'}`;
            }

            item.appendChild(primaryName);
            if (secondaryName.textContent) item.appendChild(secondaryName);
            if (infoLine.textContent) item.appendChild(infoLine);

            item.addEventListener('click', () => selectSuggestion(district));
            item.addEventListener('mouseenter', () => {
                selectedIndex = index;
                updateSelectedItem();
            });

            autocompleteList.appendChild(item);
        });

        // Add "Other" option at the end
        const otherItem = document.createElement('div');
        otherItem.className = 'city-autocomplete-item other-option';
        otherItem.dataset.index = suggestions.length;
        otherItem.dataset.id = '46'; // Fallback to district 46

        const otherText = otherTranslations[currentLang] || otherTranslations.en;

        const otherPrimary = document.createElement('div');
        otherPrimary.className = 'city-name-primary';
        otherPrimary.textContent = otherText.primary;
        if (isArabic) otherPrimary.dir = 'rtl';

        const otherSecondary = document.createElement('div');
        otherSecondary.className = 'city-name-secondary';
        otherSecondary.textContent = otherText.secondary;
        if (isArabic) otherSecondary.dir = 'rtl';

        const otherInfo = document.createElement('div');
        otherInfo.className = 'city-info';
        otherInfo.textContent = otherText.info;
        if (isArabic) otherInfo.dir = 'rtl';

        otherItem.appendChild(otherPrimary);
        otherItem.appendChild(otherSecondary);
        otherItem.appendChild(otherInfo);

        otherItem.addEventListener('click', () => {
            const currentLang = getCurrentLang();
            cityInput.value = otherTranslations[currentLang]?.primary || 'Other City';
            districtHiddenInput.value = '46';
            resetAutocompletePosition();

            // Blur the input to dismiss keyboard on mobile
            if (window.innerWidth <= 768) {
                cityInput.blur();
            }

            console.log('✅ Selected "Other" - using fallback district ID: 46');
        });

        autocompleteList.appendChild(otherItem);
        autocompleteList.classList.add('show');
    };

    // Select a suggestion
    const selectSuggestion = (district) => {
        const currentLang = getCurrentLang();
        const isArabic = currentLang === 'ar';

        // Set the input value based on language
        if (isArabic && district.arabic_name) {
            cityInput.value = district.arabic_name;
        } else {
            cityInput.value = district.name || district.ville;
        }

        districtHiddenInput.value = district.id;
        resetAutocompletePosition();

        // Blur the input to dismiss keyboard on mobile
        if (window.innerWidth <= 768) {
            cityInput.blur();
        }

        console.log(`✅ Selected: "${district.name}" (${district.arabic_name || 'no Arabic'}) ID: ${district.id}`);
    };

    // Update selected item highlight
    const updateSelectedItem = () => {
        const items = autocompleteList.querySelectorAll('.city-autocomplete-item');
        items.forEach((item, idx) => {
            item.classList.toggle('selected', idx === selectedIndex);
        });
    };

    // Handle city input
    cityInput.addEventListener('input', (e) => {
        const cityName = e.target.value.trim();

        // Clear previous timeout
        if (cityMatchingTimeout) {
            clearTimeout(cityMatchingTimeout);
        }

        // Clear previous district ID
        districtHiddenInput.value = '';

        // Show autocomplete with debounce
        cityMatchingTimeout = setTimeout(() => {
            const suggestions = getAutocompleteSuggestions(cityName);
            renderAutocomplete(suggestions);

            // Also try to match for hidden field
            const match = matchCityWithDistrict(cityName);
            if (match && match.id) {
                districtHiddenInput.value = match.id;
            }
        }, 150); // 150ms debounce for responsive feel
    });

    // Show dropdown on focus if there's text
    cityInput.addEventListener('focus', () => {
        const cityName = cityInput.value.trim();
        if (cityName.length >= 2) {
            const suggestions = getAutocompleteSuggestions(cityName);
            renderAutocomplete(suggestions);
        }

        // Mobile keyboard optimization: ensure input stays visible
        // Only scroll if the input is in the lower half of the screen (where keyboard would cover it)
        if (window.innerWidth <= 768) {
            setTimeout(() => {
                const inputRect = cityInput.getBoundingClientRect();
                const viewportHeight = window.innerHeight;

                // Only scroll if input is in the lower 50% of the screen
                // This prevents unnecessary scrolling when input is already visible
                if (inputRect.top > viewportHeight * 0.5) {
                    // Use scrollIntoView with block: 'center' for safe, predictable scrolling
                    cityInput.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                        inline: 'nearest'
                    });
                }
            }, 100); // Short delay for keyboard to start appearing
        }
    });

    // Keyboard navigation
    cityInput.addEventListener('keydown', (e) => {
        const items = autocompleteList.querySelectorAll('.city-autocomplete-item');
        const totalItems = items.length;

        if (!autocompleteList.classList.contains('show') || totalItems === 0) {
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % totalItems;
            updateSelectedItem();
            items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = selectedIndex <= 0 ? totalItems - 1 : selectedIndex - 1;
            updateSelectedItem();
            items[selectedIndex]?.scrollIntoView({ block: 'nearest' });
        } else if (e.key === 'Enter' && selectedIndex >= 0) {
            e.preventDefault();
            items[selectedIndex]?.click();
        } else if (e.key === 'Escape') {
            resetAutocompletePosition();
            cityInput.blur(); // Dismiss keyboard on mobile
        }
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!cityInput.contains(e.target) && !autocompleteList.contains(e.target)) {
            resetAutocompletePosition();
        }
    });

    // Also close on blur (helps with mobile when tapping elsewhere)
    cityInput.addEventListener('blur', (e) => {
        // Small delay to allow click on dropdown items to register first
        setTimeout(() => {
            if (!autocompleteList.contains(document.activeElement)) {
                resetAutocompletePosition();
            }
        }, 150);
    });
}

// Initialize Sendit integration
async function initSenditIntegration() {
    // Check if using new city input (simple text field)
    const cityInput = document.getElementById('city');
    if (cityInput) {
        // New simple city input - initialize matching
        initCityInputWithMatching();
        return;
    }

    // Legacy autocomplete/select code (kept for backward compatibility)
    const districtInput = document.getElementById('districtId');
    const districtHiddenInput = document.getElementById('districtIdValue');
    const districtAutocompleteList = document.getElementById('districtAutocompleteList');
    const districtSelect = document.getElementById('districtId');

    // Use autocomplete if input exists, otherwise use select
    const useAutocomplete = districtInput && districtInput.tagName === 'INPUT' && districtAutocompleteList;

    if (!useAutocomplete && !districtSelect) {
        return;
    }

    // Check if Sendit is configured
    // Re-check configuration in case it was updated from API
    const isSenditConfigured = typeof SENDIT_CONFIG !== 'undefined' &&
        typeof sendit !== 'undefined' &&
        SENDIT_CONFIG.PUBLIC_KEY &&
        SENDIT_CONFIG.PUBLIC_KEY !== 'YOUR_PUBLIC_KEY_HERE' &&
        SENDIT_CONFIG.SECRET_KEY &&
        SENDIT_CONFIG.SECRET_KEY !== 'YOUR_SECRET_KEY_HERE';


    if (useAutocomplete) {
        // Use autocomplete for better UX with many districts
        try {
            // Show loading state
            districtInput.placeholder = getTranslation('checkout.loadingDistricts') || 'Loading cities...';
            districtInput.disabled = true;


            // Save districts loading status
            const districtsLoadingStatus = {
                timestamp: new Date().toISOString(),
                attemptStarted: true,
                senditConfigured: isSenditConfigured,
                publicKey: SENDIT_CONFIG?.PUBLIC_KEY ? (SENDIT_CONFIG.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET',
                secretKey: SENDIT_CONFIG?.SECRET_KEY ? 'SET' : 'NOT SET'
            };
            localStorage.setItem('sendit_districts_loading_status', JSON.stringify(districtsLoadingStatus));

            let districts;
            try {
                districts = await sendit.initializeDistrictAutocomplete(
                    districtInput,
                    districtHiddenInput,
                    districtAutocompleteList
                );
            } catch (error) {
                console.error('❌ Error initializing autocomplete:', error);
                throw error;
            }

            districtInput.disabled = false;
            districtInput.placeholder = 'Type to search city or district...';

            // Update loading status
            districtsLoadingStatus.completed = true;
            districtsLoadingStatus.districtsCount = districts?.length || 0;
            localStorage.setItem('sendit_districts_loading_status', JSON.stringify(districtsLoadingStatus));

            // Add change listener to update shipping cost
            districtHiddenInput.addEventListener('change', (e) => {
                const selectedDistrictId = e.target.value;
                if (selectedDistrictId && isSenditConfigured) {
                    sendit.updateShippingCost(selectedDistrictId);
                }
            });

            districtInput.addEventListener('change', (e) => {
                const selectedDistrictId = districtHiddenInput.value;
                if (selectedDistrictId && isSenditConfigured) {
                    sendit.updateShippingCost(selectedDistrictId);
                }
            });

            console.log('✅ Autocomplete initialized with', districts?.length || 0, 'districts');
        } catch (error) {
            console.error('Error initializing autocomplete:', error);
            districtInput.disabled = false;
            districtInput.placeholder = 'Type to search city or district...';
        }
        return;
    }

    // Legacy select dropdown code
    if (!isSenditConfigured) {
        if (typeof sendit !== 'undefined') {
            sendit.populateFallbackDistricts(districtSelect);
        } else {
            populateBasicFallback(districtSelect);
        }
        districtSelect.disabled = false;
        return;
    }

    try {
        districtSelect.disabled = true;
        const loadingOption = document.createElement('option');
        loadingOption.value = '';
        loadingOption.textContent = getTranslation('checkout.loadingDistricts') || 'Loading cities...';
        districtSelect.innerHTML = '';
        districtSelect.appendChild(loadingOption);


        const districtsLoadingStatus = {
            timestamp: new Date().toISOString(),
            attemptStarted: true,
            senditConfigured: isSenditConfigured,
            publicKey: SENDIT_CONFIG?.PUBLIC_KEY ? (SENDIT_CONFIG.PUBLIC_KEY.substring(0, 10) + '...') : 'NOT SET',
            secretKey: SENDIT_CONFIG?.SECRET_KEY ? 'SET' : 'NOT SET'
        };
        localStorage.setItem('sendit_districts_loading_status', JSON.stringify(districtsLoadingStatus));

        let districts;
        try {
            districts = await sendit.populateDistrictDropdown(districtSelect);
        } catch (error) {
            console.error('❌ Error in populateDistrictDropdown:', error);
            districtsLoadingStatus.error = {
                message: error?.message,
                statusCode: error?.statusCode,
                stack: error?.stack
            };
            localStorage.setItem('sendit_districts_loading_status', JSON.stringify(districtsLoadingStatus));
            throw error;
        }

        districtSelect.disabled = false;

        const hasRealDistricts = districts && districts.length > 0 &&
            districts.some(d => typeof d === 'object' && d.id && !isNaN(parseInt(d.id)));
        const hasFallbackCities = districtSelect.querySelector('option[value="casablanca"], option[value="rabat"], option[value="marrakech"]');

        districtsLoadingStatus.completed = true;
        districtsLoadingStatus.hasRealDistricts = hasRealDistricts;
        districtsLoadingStatus.hasFallbackCities = !!hasFallbackCities;
        districtsLoadingStatus.districtsCount = districts?.length || 0;
        localStorage.setItem('sendit_districts_loading_status', JSON.stringify(districtsLoadingStatus));


        districtSelect.addEventListener('change', (e) => {
            const selectedDistrictId = e.target.value;
            const isFallback = selectedDistrictId && selectedDistrictId.match(/^(casablanca|rabat|marrakech|fes|tangier|agadir|meknes|oujda|kenitra|tetouan|safi|other)$/i);
            if (isFallback) {
            }

            if (selectedDistrictId && isSenditConfigured) {
                sendit.updateShippingCost(selectedDistrictId);
            } else {
                const shippingCostElement = document.getElementById('shippingCost');
                if (shippingCostElement) {
                    shippingCostElement.textContent = 'Free';
                }
                if (typeof sendit !== 'undefined') {
                    sendit.updateOrderTotal();
                }
            }
        });

        if (districtSelect.value && isSenditConfigured) {
            sendit.updateShippingCost(districtSelect.value);
        }
    } catch (error) {
        console.error('Error initializing Sendit integration:', error);
        if (typeof sendit !== 'undefined') {
            sendit.populateFallbackDistricts(districtSelect);
        } else {
            populateBasicFallback(districtSelect);
        }
        districtSelect.disabled = false;
    }
}

// Basic fallback if sendit module is not loaded - uses real Sendit district IDs
function populateBasicFallback(selectElement) {
    // Real Sendit district IDs for major cities
    const fallbackDistricts = [
        { id: 46, name: 'Casablanca - Autres quartiers', nameAr: 'الدار البيضاء - أحياء أخرى', price: 19 },
        { id: 53, name: 'Rabat', nameAr: 'الرباط', price: 35 },
        { id: 56, name: 'Marrakech', nameAr: 'مراكش', price: 35 },
        { id: 139, name: 'Fes', nameAr: 'فاس', price: 35 },
        { id: 52, name: 'Tanger', nameAr: 'طنجة', price: 35 },
        { id: 54, name: 'Agadir', nameAr: 'أكادير', price: 35 },
        { id: 167, name: 'Meknes', nameAr: 'مكناس', price: 35 },
        { id: 73, name: 'Oujda', nameAr: 'وجدة', price: 35 },
        { id: 155, name: 'Kenitra', nameAr: 'القنيطرة', price: 35 },
        { id: 222, name: 'Tetouan', nameAr: 'تطوان', price: 39 },
        { id: 188, name: 'Safi', nameAr: 'آسفي', price: 35 }
    ];

    selectElement.innerHTML = '';
    const firstOption = document.createElement('option');
    firstOption.value = '';
    const currentLang = localStorage.getItem('language') || 'en';
    const isArabic = currentLang === 'ar';
    const translation = typeof getTranslation === 'function'
        ? getTranslation('checkout.form.districtSelect', currentLang)
        : null;
    firstOption.textContent = translation || 'Select City / District (Optional)';
    selectElement.appendChild(firstOption);

    fallbackDistricts.forEach(district => {
        const option = document.createElement('option');
        option.value = district.id; // Use real Sendit district ID
        option.textContent = isArabic && district.nameAr ? district.nameAr : district.name;
        option.dataset.price = district.price;
        selectElement.appendChild(option);
    });
}

// Initialize sticky payment instructions
function initStickyPaymentInstructions() {
    const paymentInstructions = document.querySelector('.payment-instructions');
    if (!paymentInstructions) return;

    // Wait for layout to be ready
    setTimeout(() => {
        // Check if CSS sticky is actually working by testing scroll behavior
        const initialTop = paymentInstructions.getBoundingClientRect().top;
        const navbarHeight = 70;
        const expectedStickyTop = navbarHeight + 16; // 16px spacing

        // Force a reflow to ensure CSS sticky is applied
        void paymentInstructions.offsetHeight;

        // Use IntersectionObserver to detect when element should stick
        // This helps ensure sticky positioning works even if parent containers interfere
        let isSticking = false;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                const shouldStick = entry.boundingClientRect.top <= expectedStickyTop && window.scrollY > 100;

                if (shouldStick && !isSticking) {
                    isSticking = true;
                    // Ensure sticky is applied
                    paymentInstructions.style.position = 'sticky';
                    paymentInstructions.style.top = `${expectedStickyTop}px`;
                } else if (!shouldStick && isSticking) {
                    isSticking = false;
                }
            });
        }, {
            threshold: [0, 0.1, 0.5, 1],
            rootMargin: `-${expectedStickyTop}px 0px 0px 0px`
        });

        observer.observe(paymentInstructions);

        // Also handle scroll events to ensure sticky works
        let ticking = false;
        function handleScroll() {
            if (ticking) return;
            ticking = true;

            requestAnimationFrame(() => {
                const rect = paymentInstructions.getBoundingClientRect();
                const parentRect = paymentInstructions.parentElement.getBoundingClientRect();

                // If element is above sticky position and still within parent
                if (rect.top < expectedStickyTop && parentRect.top <= expectedStickyTop && window.scrollY > 100) {
                    paymentInstructions.style.position = 'sticky';
                    paymentInstructions.style.top = `${expectedStickyTop}px`;
                }

                ticking = false;
            });
        }

        window.addEventListener('scroll', handleScroll, { passive: true });
        window.addEventListener('resize', handleScroll, { passive: true });
    }, 100);
}

