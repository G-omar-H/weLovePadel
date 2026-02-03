// Language Management
// Note: Language detection happens EARLY in <head> of all HTML pages
// This script uses the already-detected language from localStorage for consistency

// Get language from localStorage (set by early detection script in <head>)
// Fallback to 'en' if not set (shouldn't happen, but safety check)
var currentLang = localStorage.getItem('language') || 'en';

// Ensure HTML lang and dir attributes are set (in case script.js loads before early script)
if (document.documentElement.lang !== currentLang) {
    document.documentElement.lang = currentLang;
    document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';
}

// Initialize language on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Use language from localStorage (already set by early detection script)
    const storedLang = localStorage.getItem('language') || 'en';

    // Inject configuration values first
    if (typeof injectConfigValues === 'function') {
        injectConfigValues();
    }

    setLanguage(storedLang);
    initMobileMenu();
    initProductFilters();
    initSmoothScroll();
    initAnimations();
    updateCopyrightYear();
    initHeroSpacing(); // Initialize hero spacing based on navbar height

    // Render featured products
    if (typeof renderFeaturedProducts === 'function') {
        renderFeaturedProducts();
    }
});

// Update copyright year automatically
function updateCopyrightYear() {
    const copyrightYear = document.getElementById('copyright-year');
    if (copyrightYear) {
        const currentYear = new Date().getFullYear();
        copyrightYear.textContent = currentYear;
    }
}

// Set language function
function setLanguage(lang) {
    const previousLang = currentLang;
    currentLang = lang;
    localStorage.setItem('language', lang);

    // Update HTML lang attribute
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';

    // Update active language button
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.lang === lang) {
            btn.classList.add('active');
        }
    });

    // Update all translatable elements
    document.querySelectorAll('[data-i18n]').forEach(element => {
        const key = element.getAttribute('data-i18n');
        let translation = getTranslation(key, lang);
        if (translation) {
            // Interpolate {brandName} if CONFIG is available
            if (typeof CONFIG !== 'undefined' && CONFIG.brandName) {
                translation = translation.replace(/{brandName}/g, CONFIG.brandName);
            }

            // For option elements, preserve the selected state
            if (element.tagName === 'OPTION') {
                const wasSelected = element.selected;
                element.textContent = translation;
                if (wasSelected) {
                    element.selected = true;
                }
            } else {
                // Use innerHTML if translation contains HTML (for highlighted keywords)
                if (translation.includes('<span') || translation.includes('<')) {
                    element.innerHTML = translation;
                } else {
                    element.textContent = translation;
                }
            }
        }
    });

    // Update placeholders
    document.querySelectorAll('[data-i18n-placeholder]').forEach(element => {
        const key = element.getAttribute('data-i18n-placeholder');
        const translation = getTranslation(key, lang);
        if (translation) {
            element.placeholder = translation;
        }
    });

    // Track language change (only if language actually changed)
    if (previousLang !== lang && typeof trackLanguageChange === 'function') {
        trackLanguageChange(lang);
    }

    // Dispatch custom event for language change (for PayPal button re-rendering)
    if (previousLang !== lang) {
        document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
    }
}

// Get translation by key
function getTranslation(key, lang) {
    const keys = key.split('.');
    let value = translations[lang];

    for (const k of keys) {
        if (value && typeof value === 'object') {
            value = value[k];
        } else {
            return null;
        }
    }

    return value || translations.en[key.split('.').reduce((obj, k) => obj?.[k], translations.en)];
}

// Language switcher event listeners
document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        setLanguage(lang);
    });
});

// Mobile menu toggle
function initMobileMenu() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    const body = document.body;
    const html = document.documentElement;
    let scrollPosition = 0;

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navMenu.classList.toggle('active');

            // Prevent body scroll when menu is open
            if (navMenu.classList.contains('active')) {
                // Save current scroll position
                scrollPosition = window.pageYOffset || window.scrollY || document.documentElement.scrollTop;

                // Prevent scrolling
                body.style.overflow = 'hidden';
                body.style.position = 'fixed';
                body.style.top = `-${scrollPosition}px`;
                body.style.width = '100%';
                html.style.overflow = 'hidden';
            } else {
                // Restore scrolling
                body.style.overflow = '';
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
                html.style.overflow = '';

                // Restore scroll position
                window.scrollTo(0, scrollPosition);
            }
        });

        // Close menu when clicking on a link
        document.querySelectorAll('.nav-menu a').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');

                // Restore scrolling
                body.style.overflow = '';
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
                html.style.overflow = '';

                // Restore scroll position
                window.scrollTo(0, scrollPosition);
            });
        });

        // Close menu when clicking on backdrop (if it exists)
        navMenu.addEventListener('click', (e) => {
            if (e.target === navMenu || e.target.classList.contains('nav-menu')) {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');

                // Restore scrolling
                body.style.overflow = '';
                body.style.position = '';
                body.style.top = '';
                body.style.width = '';
                html.style.overflow = '';

                // Restore scroll position
                window.scrollTo(0, scrollPosition);
            }
        });
    }
}

// Product filters
function initProductFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const productItems = document.querySelectorAll('.product-item');

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Update active button
            filterButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            const filter = button.dataset.filter;

            // Track filter event
            if (typeof trackFilter === 'function' && filter !== 'all') {
                trackFilter(filter);
            }

            // Filter products
            productItems.forEach(item => {
                if (filter === 'all' || item.dataset.category === filter) {
                    item.style.display = 'block';
                    setTimeout(() => {
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, 10);
                } else {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(20px)';
                    setTimeout(() => {
                        item.style.display = 'none';
                    }, 300);
                }
            });
        });
    });
}

// Smooth scroll
function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href !== '#' && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            }
        });
    });
}

// Scroll animations
function initAnimations() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, observerOptions);

    // Observe elements
    document.querySelectorAll('.value-card, .product-card, .product-item, .about-content, .contact-content').forEach(el => {
        observer.observe(el);
    });
}

// Navbar scroll effect
let lastScroll = 0;
window.addEventListener('scroll', () => {
    const navbar = document.querySelector('.navbar');
    const currentScroll = window.pageYOffset;

    if (currentScroll > 100) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }

    lastScroll = currentScroll;
});

// Set hero margin-top to match exact navbar height
function initHeroSpacing() {
    const navbar = document.querySelector('.navbar');
    const hero = document.querySelector('.hero');

    if (navbar && hero) {
        function updateHeroSpacing() {
            const navbarHeight = navbar.offsetHeight;
            hero.style.marginTop = `${navbarHeight}px`;
        }

        // Update on load
        updateHeroSpacing();

        // Update on resize (navbar height may change)
        window.addEventListener('resize', updateHeroSpacing);

        // Update when navbar scrolls (padding changes)
        const observer = new MutationObserver(updateHeroSpacing);
        observer.observe(navbar, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

// Hero buttons appear on scroll
function initHeroScrollAnimation() {
    const heroButtons = document.querySelector('.hero-buttons');
    if (!heroButtons) {
        // Make buttons visible immediately if animation fails
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    // Small delay to ensure smooth animation
                    setTimeout(() => {
                        entry.target.classList.add('visible');
                    }, 300);
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px'
        });

        observer.observe(heroButtons);
    } else {
        // If buttons exist but observer setup fails, make them visible anyway
        setTimeout(() => {
            const buttons = document.querySelector('.hero-buttons');
            if (buttons) buttons.classList.add('visible');
        }, 500);
    }
}


// Form submission with validation - Enhanced with inline errors
document.querySelectorAll('.contact-form').forEach(form => {
    // Clear all errors function
    function clearAllErrors() {
        form.querySelectorAll('.error-message').forEach(err => {
            err.textContent = '';
            err.style.display = 'none';
        });
        form.querySelectorAll('.form-group').forEach(group => {
            group.classList.remove('error');
        });
    }

    // Show field error
    function showFieldError(field, message) {
        clearAllErrors();
        const formGroup = field.closest('.form-group');
        if (formGroup) {
            formGroup.classList.add('error');
            const errorSpan = formGroup.querySelector('.error-message');
            if (errorSpan) {
                errorSpan.textContent = message;
                errorSpan.style.display = 'flex';
            }
            field.focus();
            field.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // Show success message
    function showSuccessMessage(message) {
        const successDiv = document.createElement('div');
        successDiv.className = 'contact-success-message';
        successDiv.textContent = message;
        form.insertBefore(successDiv, form.firstChild);

        setTimeout(() => {
            successDiv.classList.add('show');
        }, 10);

        setTimeout(() => {
            successDiv.classList.remove('show');
            setTimeout(() => successDiv.remove(), 300);
        }, 5000);
    }

    // Real-time validation
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('blur', () => {
            validateContactField(input);
        });
        input.addEventListener('input', () => {
            const formGroup = input.closest('.form-group');
            if (formGroup) {
                formGroup.classList.remove('error');
                const errorSpan = formGroup.querySelector('.error-message');
                if (errorSpan) {
                    errorSpan.textContent = '';
                    errorSpan.style.display = 'none';
                }
            }
        });
    });

    // Validate single field
    function validateContactField(field) {
        const value = field.value.trim();
        const currentLang = localStorage.getItem('language') || 'en';
        const errors = {
            en: {
                name: 'Please enter your name',
                email: 'Please enter a valid email address',
                message: 'Please enter a message'
            },
            fr: {
                name: 'Veuillez entrer votre nom',
                email: 'Veuillez entrer une adresse email valide',
                message: 'Veuillez entrer un message'
            },
            ar: {
                name: 'الرجاء إدخال اسمك',
                email: 'الرجاء إدخال عنوان بريد إلكتروني صالح',
                message: 'الرجاء إدخال رسالة'
            }
        };

        if (field.hasAttribute('required') && !value) {
            const fieldName = field.type === 'email' ? 'email' : (field.tagName === 'TEXTAREA' ? 'message' : 'name');
            showFieldError(field, errors[currentLang]?.[fieldName] || errors.en[fieldName]);
            return false;
        }

        if (field.type === 'email' && value) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
                showFieldError(field, errors[currentLang]?.email || errors.en.email);
                return false;
            }
        }

        return true;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearAllErrors();

        const formData = new FormData(form);
        const name = formData.get('name') || form.querySelector('input[type="text"]')?.value;
        const email = formData.get('email') || form.querySelector('input[type="email"]')?.value;
        const message = formData.get('message') || form.querySelector('textarea')?.value;

        // Validation
        const currentLang = localStorage.getItem('language') || 'en';
        const errors = {
            en: {
                name: 'Please enter your name',
                email: 'Please enter a valid email address',
                message: 'Please enter a message'
            },
            fr: {
                name: 'Veuillez entrer votre nom',
                email: 'Veuillez entrer une adresse email valide',
                message: 'Veuillez entrer un message'
            },
            ar: {
                name: 'الرجاء إدخال اسمك',
                email: 'الرجاء إدخال عنوان بريد إلكتروني صالح',
                message: 'الرجاء إدخال رسالة'
            }
        };

        const success = {
            en: 'Thank you! We will contact you soon.',
            fr: 'Merci! Nous vous contacterons bientôt.',
            ar: 'شكراً لك! سنتواصل معك قريباً.'
        };

        let isValid = true;
        const nameField = form.querySelector('input[type="text"]');
        const emailField = form.querySelector('input[type="email"]');
        const messageField = form.querySelector('textarea');

        if (!name || name.trim() === '') {
            if (nameField) showFieldError(nameField, errors[currentLang]?.name || errors.en.name);
            isValid = false;
        }

        if (!email || !email.includes('@')) {
            if (emailField) showFieldError(emailField, errors[currentLang]?.email || errors.en.email);
            isValid = false;
        } else if (emailField && !validateContactField(emailField)) {
            isValid = false;
        }

        if (!message || message.trim() === '') {
            if (messageField) showFieldError(messageField, errors[currentLang]?.message || errors.en.message);
            isValid = false;
        }

        if (!isValid) return;

        // Disable submit button
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            const originalText = submitBtn.textContent;
            submitBtn.textContent = currentLang === 'ar' ? 'جاري الإرسال...' : (currentLang === 'fr' ? 'Envoi en cours...' : 'Sending...');

            try {
                // Here you would typically send the form data to a server
                // Example: await fetch('/api/contact', { method: 'POST', body: formData })

                // Simulate API call
                await new Promise(resolve => setTimeout(resolve, 1000));

                showSuccessMessage(success[currentLang] || success.en);
                form.reset();
            } catch (error) {
                console.error('Error submitting contact form:', error);
                const errorMsg = {
                    en: 'Failed to send message. Please try again or contact us directly.',
                    fr: 'Échec de l\'envoi du message. Veuillez réessayer ou nous contacter directement.',
                    ar: 'فشل إرسال الرسالة. يرجى المحاولة مرة أخرى أو الاتصال بنا مباشرة.'
                };
                showFieldError(submitBtn, errorMsg[currentLang] || errorMsg.en);
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = originalText;
                }
            }
        }
    });
});

// Product overlay interactions
document.querySelectorAll('.product-overlay .btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // Here you would typically open a product detail modal
        console.log('View product details');
    });
});

// Add to cart functionality
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('btn-cart') || e.target.closest('.btn-cart')) {
        e.preventDefault();
        e.stopPropagation();

        const btn = e.target.classList.contains('btn-cart') ? e.target : e.target.closest('.btn-cart');
        const productId = btn.getAttribute('data-product-id');

        if (productId && products && products[productId]) {
            const product = products[productId];
            const currentLang = localStorage.getItem('language') || 'en';
            const name = product.name[currentLang] || product.name.en;

            cart.addItem({
                id: product.id,
                name: name,
                price: product.price + ' MAD',
                category: product.category,
                image: product.image
            });
        } else {
            // Fallback for products without data attributes
            const productName = btn.closest('.product-details')?.querySelector('h3')?.textContent || 'Product';
            const currentLang = localStorage.getItem('language') || 'en';
            const messages = {
                en: `${productName} added to cart!`,
                fr: `${productName} ajouté au panier!`,
                ar: `تمت إضافة ${productName} إلى السلة!`
            };
            alert(messages[currentLang] || messages.en);
        }
    }
});

// Dynamic Content Rendering & Configuration

function injectThemeSettings() {
    if (typeof CONFIG === 'undefined' || !CONFIG.colors) return;

    const root = document.documentElement;
    const colors = CONFIG.colors;

    // Set CSS Variables
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--primary-dark', colors.primaryDark);
    root.style.setProperty('--primary-light', colors.primaryLight);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--secondary-dark', colors.secondaryDark);
    root.style.setProperty('--accent-color', colors.accent);
    root.style.setProperty('--accent-light', colors.accentLight);

    // Theme Settings
    if (CONFIG.theme) {
        if (CONFIG.theme.fontFamily) {
            document.body.style.fontFamily = CONFIG.theme.fontFamily;
        }
        if (CONFIG.theme.borderRadius) {
            // This is a bit harder to override globally without specific CSS vars for it, 
            // but we can try setting a common var if we had one.
            // For now, let's leave it or assume styles.css handles it via variable if we added one.
        }

        // Handle Mosaic Patterns
        if (CONFIG.theme.mosaicPattern === false) {
            // Disable mosaic patterns by hiding them or setting distinct opacity
            const style = document.createElement('style');
            style.textContent = `
                .mosaic-pattern::before, 
                .mosaic-star::before, 
                .navbar::before, 
                .mosaic-accent::after { 
                    display: none !important; 
                }
             `;
            document.head.appendChild(style);
        }
    }
}

function injectJsonLd() {
    if (typeof CONFIG === 'undefined') return;

    const existingScript = document.querySelector('script[type="application/ld+json"]');
    if (existingScript) existingScript.remove(); // Remove static one if exists

    const schema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": CONFIG.brandName,
        "url": window.location.origin,
        "logo": window.location.origin + '/' + CONFIG.logoConfig.image,
        "description": CONFIG.brandTagline,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": CONFIG.contact.address, // Simplification
            "addressCountry": "Country" // Could be dynamic if needed
        },
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": CONFIG.contact.phone,
            "contactType": "customer service",
            "email": CONFIG.contact.email
        },
        "sameAs": Object.values(CONFIG.social).filter(url => url.length > 0)
    };

    const script = document.createElement('script');
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
}

// Dynamic Content Rendering & Configuration

function injectThemeSettings() {
    if (typeof CONFIG === 'undefined' || !CONFIG.colors) return;

    const root = document.documentElement;
    const colors = CONFIG.colors;

    // Set CSS Variables
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--primary-dark', colors.primaryDark);
    root.style.setProperty('--primary-light', colors.primaryLight);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--secondary-dark', colors.secondaryDark);
    root.style.setProperty('--accent-color', colors.accent);
    root.style.setProperty('--accent-light', colors.accentLight);

    // Theme Settings
    if (CONFIG.theme && CONFIG.theme.mosaicPattern === false) {
        const style = document.createElement('style');
        style.textContent = `
            .mosaic-pattern::before, 
            .mosaic-star::before, 
            .navbar::before, 
            .mosaic-accent::after { 
                display: none !important; 
            }
         `;
        document.head.appendChild(style);
    }
}

function injectJsonLd() {
    if (typeof CONFIG === 'undefined') return;

    const schema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": CONFIG.brandName,
        "url": window.location.origin,
        "logo": window.location.origin + '/' + CONFIG.logoConfig.image,
        "description": CONFIG.brandTagline,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": CONFIG.contact.address,
            "addressCountry": "Country"
        },
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": CONFIG.contact.phone,
            "contactType": "customer service",
            "email": CONFIG.contact.email
        },
        "sameAs": Object.values(CONFIG.social).filter(url => url.length > 0)
    };

    const script = document.createElement('script');
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
}

function injectThemeSettings() {
    if (typeof CONFIG === 'undefined' || !CONFIG.colors) return;

    const root = document.documentElement;
    const colors = CONFIG.colors;

    // Set CSS Variables
    root.style.setProperty('--primary-color', colors.primary);
    root.style.setProperty('--primary-dark', colors.primaryDark);
    root.style.setProperty('--primary-light', colors.primaryLight);
    root.style.setProperty('--secondary-color', colors.secondary);
    root.style.setProperty('--secondary-dark', colors.secondaryDark);
    root.style.setProperty('--accent-color', colors.accent);
    root.style.setProperty('--accent-light', colors.accentLight);

    // Theme Settings
    if (CONFIG.theme && CONFIG.theme.mosaicPattern === false) {
        const style = document.createElement('style');
        style.textContent = `
            .mosaic-pattern::before, 
            .mosaic-star::before, 
            .navbar::before, 
            .mosaic-accent::after { 
                display: none !important; 
            }
         `;
        document.head.appendChild(style);
    }
}

function injectJsonLd() {
    if (typeof CONFIG === 'undefined') return;

    const schema = {
        "@context": "https://schema.org",
        "@type": "Organization",
        "name": CONFIG.brandName,
        "url": window.location.origin,
        "logo": window.location.origin + '/' + CONFIG.logoConfig.image,
        "description": CONFIG.brandTagline,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": CONFIG.contact.address,
            "addressCountry": "Country"
        },
        "contactPoint": {
            "@type": "ContactPoint",
            "telephone": CONFIG.contact.phone,
            "contactType": "customer service",
            "email": CONFIG.contact.email
        },
        "sameAs": Object.values(CONFIG.social).filter(url => url.length > 0)
    };

    const script = document.createElement('script');
    script.type = "application/ld+json";
    script.textContent = JSON.stringify(schema, null, 2);
    document.head.appendChild(script);
}

function injectConfigValues() {
    if (typeof CONFIG === 'undefined') return;

    // Brand Name
    document.querySelectorAll('.brand-name').forEach(el => {
        el.textContent = CONFIG.brandName;
    });

    // Contact Info
    const emailLinks = document.querySelectorAll('a[href^="mailto:"]');
    emailLinks.forEach(link => {
        link.href = `mailto:${CONFIG.contact.email}`;
        link.textContent = CONFIG.contact.email;
    });

    const phoneLinks = document.querySelectorAll('a[href^="tel:"]');
    phoneLinks.forEach(link => {
        link.href = `tel:${CONFIG.contact.phone.replace(/\s/g, '')}`;
        // Only update text if it looks like a phone number placehoder or is generic
        if (link.textContent.includes('123') || link.textContent.includes('XXX')) {
            link.textContent = CONFIG.contact.phone;
        }
    });

    // Social Links
    Object.keys(CONFIG.social).forEach(platform => {
        const link = CONFIG.social[platform];
        const icon = document.querySelector(`.social-icon.${platform}`);
        if (icon) {
            if (link) {
                icon.href = link;
                icon.style.display = 'inline-flex';
            } else {
                icon.style.display = 'none';
            }
        }
    });
}

function renderFeaturedProducts() {
    const container = document.querySelector('.products-preview');
    if (!container || typeof products === 'undefined') return;

    const currentLang = localStorage.getItem('language') || 'en';
    let html = '';

    // Filter featured products
    const featuredProducts = Object.values(products).filter(p => p.featured);

    if (featuredProducts.length === 0) {
        container.innerHTML = '<p class="text-center">No featured products available.</p>';
        return;
    }

    featuredProducts.forEach(product => {
        // Fallback to English if translation missing
        const name = product.name[currentLang] || product.name.en;
        const price = product.price; // Assuming standard currency

        // Handle badge
        let badgeHtml = '';
        if (product.badge) {
            // Simplified badge logic - can be expanded
            const badgeText = product.badge.toUpperCase();
            badgeHtml = `<div class="product-badge">${badgeText}</div>`;
        }

        html += `
            <a href="product-detail.html?id=${product.id}" class="product-card">
                <div class="product-image">
                    ${badgeHtml}
                    <img src="${product.image}" alt="${name}" loading="lazy" onerror="this.onerror=null; this.src='https://placehold.co/600x600?text=Product';">
                </div>
                <div class="product-info">
                    <h3>${name}</h3>
                    <p class="product-price">${price} ${CONFIG?.currency || 'MAD'}</p>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
}

// Re-render on language change
document.addEventListener('languageChanged', () => {
    renderFeaturedProducts();
});

// Also trigger on manual setLanguage call (handled in setLanguage function via event, but let's be safe)
