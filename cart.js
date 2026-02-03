// Shopping Cart Functionality
class ShoppingCart {
    constructor() {
        this.items = this.loadCart();
        this.updateCartUI();
    }

    // Load cart from localStorage
    loadCart() {
        try {
            const storageKey = (typeof CONFIG !== 'undefined' && CONFIG.storagePrefix) ? CONFIG.storagePrefix + 'cart' : 'storename_cart';
            const savedCart = localStorage.getItem(storageKey);
            if (!savedCart) return [];

            const parsed = JSON.parse(savedCart);
            // Validate cart structure
            if (Array.isArray(parsed)) {
                return parsed;
            }
            return [];
        } catch (error) {
            console.warn('Error loading cart from storage:', error);
            // Show user-friendly notification
            this.showErrorNotification('cartError');
            return [];
        }
    }

    // Save cart to localStorage
    saveCart() {
        try {
            const storageKey = (typeof CONFIG !== 'undefined' && CONFIG.storagePrefix) ? CONFIG.storagePrefix + 'cart' : 'storename_cart';
            localStorage.setItem(storageKey, JSON.stringify(this.items));
            this.updateCartUI();
        } catch (error) {
            console.error('Error saving cart to storage:', error);
            // Show user-friendly notification
            this.showErrorNotification('cartError');
            // Try to continue anyway - cart is in memory
            this.updateCartUI();
        }
    }

    // Show error notification
    showErrorNotification(errorKey) {
        const currentLang = localStorage.getItem('language') || 'en';
        // Use global translations if available
        let message, help;
        if (typeof getTranslation === 'function') {
            message = getTranslation('error.cartSave', currentLang);
            help = getTranslation('error.cartSaveHelp', currentLang);
        }

        // Fallback defaults if translation missing
        if (!message) message = currentLang === 'ar' ? 'لم نتمكن من حفظ سلة التسوق الخاصة بك.' : (currentLang === 'fr' ? 'Nous n\'avons pas pu enregistrer votre panier.' : 'We couldn\'t save your cart.');
        if (!help) help = currentLang === 'ar' ? 'حاول تحديث الصفحة.' : (currentLang === 'fr' ? 'Essayez de rafraîchir la page.' : 'Try refreshing the page.');

        // Create notification
        const notification = document.createElement('div');
        notification.className = 'cart-error-notification';
        notification.innerHTML = `
            <div class="error-icon">⚠️</div>
            <div class="error-content">
                <div class="error-message">${message}</div>
                <div class="error-help">${help}</div>
            </div>
        `;
        document.body.appendChild(notification);

        setTimeout(() => notification.classList.add('show'), 10);
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 5000);
    }

    // Add item to cart
    addItem(product, quantity = 1) {
        // For products with sizes and/or variations, use unique IDs to find existing items
        // This allows same product with different sizes/variations to be separate cart items
        const existingItem = this.items.find(item => {
            // Match by originalId (base product), size, and variation
            const sameBase = (item.originalId || item.id) === (product.originalId || product.id);
            const sameSize = (!item.size && !product.size) || (item.size === product.size);
            const sameVariation = (!item.variation && !product.variation) || (item.variation === product.variation);

            return sameBase && sameSize && sameVariation;
        });

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            this.items.push({
                ...product,
                quantity: quantity
            });
        }

        this.saveCart();
        this.showCartNotification(quantity);

        // Track add to cart event
        if (typeof trackAddToCart === 'function') {
            const price = this.parsePrice(product.price);
            trackAddToCart(product.id, product.name, price, product.category || 'Unknown', existingItem ? existingItem.quantity : quantity);
        }
    }

    // Remove item from cart
    removeItem(productId) {
        const item = this.items.find(item => item.id === productId);
        if (item && typeof trackRemoveFromCart === 'function') {
            const price = this.parsePrice(item.price);
            trackRemoveFromCart(item.id, item.name, price, item.category || 'Unknown', item.quantity);
        }
        this.items = this.items.filter(item => item.id !== productId);
        this.saveCart();
    }

    // Update item quantity
    updateQuantity(productId, quantity) {
        const item = this.items.find(item => item.id === productId);
        if (item) {
            if (quantity <= 0) {
                this.removeItem(productId);
            } else {
                item.quantity = quantity;
                this.saveCart();
            }
        }
    }

    // Get total items count
    getTotalItems() {
        return this.items.reduce((total, item) => total + item.quantity, 0);
    }

    // Get total price
    getTotalPrice() {
        try {
            return this.items.reduce((total, item) => {
                if (!item || !item.price) return total;
                const price = this.parsePrice(item.price);
                if (isNaN(price)) {
                    console.warn('Invalid price for item:', item);
                    return total;
                }
                return total + (price * (item.quantity || 1));
            }, 0);
        } catch (error) {
            console.error('Error calculating total price:', error);
            return 0;
        }
    }

    // Update cart UI (cart count badge)
    updateCartUI() {
        const cartCount = document.getElementById('cartCount');
        if (cartCount) {
            const count = this.getTotalItems();
            cartCount.textContent = count;
            cartCount.style.display = count > 0 ? 'flex' : 'none';
        }
    }

    // Show cart notification
    showCartNotification() {
        // Get current language
        const currentLang = localStorage.getItem('language') || 'en';
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'cart-notification';

        let message = 'Item added to cart!';
        if (typeof getTranslation === 'function') {
            message = getTranslation('cart.itemAdded', currentLang) || message;
        } else {
            const defaults = {
                en: 'Item added to cart!',
                fr: 'Article ajouté au panier!',
                ar: 'تمت إضافة العنصر إلى السلة!'
            };
            message = defaults[currentLang] || defaults.en;
        }

        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(notification);
            }, 300);
        }, 2000);
    }

    // Clear cart
    clearCart() {
        this.items = [];
        this.saveCart();
    }

    // Helper to parse price string to number
    parsePrice(priceStr) {
        if (typeof priceStr === 'number') return priceStr;
        if (!priceStr) return 0;
        // Remove everything except digits, dots and commas
        // Handle common formats: "1 234.56 MAD", "1,234.56 MAD", "1.234,56 €"
        // For this specific template we assume standard format or cleaned string
        // Simple generic parser: keep digits and dot/comma, then normalize
        const cleanStr = priceStr.toString().replace(/[^0-9.,]/g, '');
        // If comma is used as decimal separator (last generic assumption)
        // But here we had "150 MAD" or "100"
        return parseFloat(cleanStr.replace(',', '.')) || 0;
    }
}

// Initialize cart
const cart = new ShoppingCart();

// Product data structure
// products are now loaded from products.js

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { cart }; // products is global or imported
}
