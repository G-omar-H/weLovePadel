# Generic E-commerce Template - Implementation & Branding Guide

This guide provides step-by-step instructions on how to turn this generic template into your own fully branded e-commerce store.

---

## 📋 Table of Contents
1.  [Initial Setup](#1-initial-setup)
2.  [Brand Identity](#2-brand-identity)
3.  [Product Catalog](#3-product-catalog)
4.  [Content & Translations](#4-content--translations)
5.  [Configurations (Payments & Shipping)](#5-configurations-payments--shipping)
6.  [Deployment](#6-deployment)

---

## 1. Initial Setup

### Prerequisites
-   **Node.js** (v18 or higher) installed on your machine.
-   A text editor (VS Code recommended).

### Installation
1.  Open your terminal and navigate to the project folder.
2.  Copy the environment example file:
    ```bash
    cp .env.example .env
    ```
3.  Install dependencies:
    ```bash
    cd server
    npm install
    ```
4.  Start the local server to verify everything works:
    ```bash
    npm start
    ```
    Visit `http://localhost:3000` in your browser.

---

## 2. Brand Identity

### Logo Replacement
The template uses two logo files located in `assets/logo/`.
1.  **Prepare your logo:**
    -   `storename_logo.png` (Recommended size: 200x60px, transparent background)
    -   `storename_logo.webp` (Optimized version of the same logo)
2.  **Replace files:** Overwrite the existing placeholder files in `assets/logo/` with your own.

### Favicon
Replace the files in `assets/favicon/` with your brand's favicon. Use a generator like [RealFaviconGenerator](https://realfavicongenerator.net/) to generate all necessary sizes (ico, png, manifest).

### Colors & Fonts
The visual theme is controlled via **CSS Variables** in `styles.css`.
Open `styles.css` and modify the `:root` section:

```css
:root {
    /* Primary Brand Color (Buttons, Highlights) */
    --primary-color: #C8102E; 
    
    /* Secondary/Accent Color */
    --secondary-color: #bfa57d;
    
    /* Backgrounds */
    --background-color: #ffffff;
    --paper-color: #f9f9f9;
    
    /* Text */
    --text-color: #333333;
    --heading-font: 'Cinzel', serif; /* Change font family here */
    --body-font: 'Lato', sans-serif;
}
```

### Hero Images
The main banner images are defined in `styles.css` under the `.hero` class or directly in `index.html`.
-   **Update `styles.css`:** Look for `.hero` and replace the `background-image` URL.
-   **Update `index.html`:** Look for any `<img class="hero-bg">` or similar tags.

---

## 3. Product Catalog

Your products are defined in a central file: `products.js`. This allows you to manage inventory without touching HTML.

**File Location:** `./products.js`

### How to Add a Product
Add a new entry to the `products` object:

```javascript
'my-new-product-id': {
    id: 'my-new-product-id',
    name: {
        en: 'Luxury Watch',
        fr: 'Montre de Luxe',
        ar: 'ساعة فاخرة'
    },
    price: '1500', // Price in your local currency
    category: 'accessories',
    image: 'assets/products/watch-01.jpg', // Path to your image
    description: {
        en: 'A beautiful timepiece...',
        fr: 'Une belle montre...',
        ar: 'ساعة جميلة...'
    },
    badge: 'new', // Optional: 'new', 'sale', or null
    // Sizes (Optional)
    sizes: [
        { code: 'S', cm: 'Standard' }
    ]
}
```

### Image Management
1.  Create a folder `assets/products/`.
2.  Place your product images there.
3.  Reference them in `products.js` using the path `/assets/products/filename.jpg`.

---

## 4. Content & Translations

Text content is managed via `translations.js` for the frontend and `server/email-translations.js` for emails.

### Frontend Text (`translations.js`)
Edit this file to change button labels, headers, and static text.
```javascript
const translations = {
    en: {
        "hero.title": "Welcome to My Brand",
        "hero.subtitle": "The best products in town",
        // ...
    },
    // ... French and Arabic sections
};
```

### Email Notifications (`server/email-translations.js`)
Customize the emails sent to customers and admins.
-   **Brand Name:** Set `BRAND_NAME="My Store"` in your `.env` file.
-   **Email Content:** Edit the messages in `server/email-translations.js`.

---

## 5. Configurations (Payments & Shipping)

### Environment Variables (`.env`)
Configure these keys in your `.env` file:

```ini
# General
BRAND_NAME=My Store
PORT=3000

# PayPal (Payments)
PAYPAL_USE_SANDBOX=true (Set to false for Live)
PAYPAL_CLIENT_ID_SANDBOX=your_sandbox_client_id
PAYPAL_CLIENT_ID_LIVE=your_live_client_id

# Sendit (Shipping - Morocco)
SENDIT_PUBLIC_KEY=your_public_key
SENDIT_SECRET_KEY=your_secret_key

# Email (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
FROM_EMAIL=noreply@yourdomain.com
ADMIN_EMAIL=orders@yourdomain.com
```

### PayPal Setup
1.  Go to [developer.paypal.com](https://developer.paypal.com).
2.  Create a generic App.
3.  Copy the **Client ID** for Sandbox and Live.
4.  Paste them into your `.env` file.

---

## 6. Deployment

### Using Nginx (Recommended for VPS)
1.  Copy `server/nginx-generic.conf` to `/etc/nginx/sites-available/your-domain.conf`.
2.  Edit the file:
    -   Replace `your-domain.com` with your actual domain.
    -   Update `/var/www/your-domain.com/public` to your project path.
3.  Symlink to `sites-enabled` and reload Nginx.

### Using PM2 (Node Process Manager)
To keep your server running in the background:
```bash
npm install -g pm2
cd server
pm2 start index.js --name "ecommerce-api"
pm2 save
```

### SSL (HTTPS)
Use Certbot to secure your domain:
```bash
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

---

**Need Help?**
Refer to `ERROR_HANDLING_REPORT.md` (if available) or check the server logs (`pm2 logs`) for troubleshooting.
