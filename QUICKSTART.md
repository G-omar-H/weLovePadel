# Generic E-commerce Template - Quickstart Guide

Welcome to your new e-commerce project! This template is designed to be a flexible, lightweight, and high-performance foundation for selling products online. It includes built-in integrations for PayPal (payments) and Sendit (shipping in Morocco), along with a Node.js API server.

## 🚀 Getting Started

### 1. Configuration
The project is designed to be configured primarily via environment variables or local configuration files.

**Backend Configuration:**
- Copy `.env.example` to `.env` (if not present, create one based on requirements).
- Set your `BRAND_NAME` in the environment variables.
- Configure PayPal Client IDs in `paypal-config.local.js` or via environment variables (`PAYPAL_CLIENT_ID_SANDBOX`, `PAYPAL_CLIENT_ID_LIVE`).
- Configure Sendit API keys in `.env`: `SENDIT_PUBLIC_KEY` and `SENDIT_SECRET_KEY`.

**Frontend Configuration:**
- **Product Catalog**: Edit `products.js` to define your products, prices, and images.
- **Translations**: Edit `translations.js` to customize text for English, French, and Arabic.
- **Brand Info**: Update `index.html` metadata (Title, Description, Keywords) and contact information (Phone, Address).
- **Logo**: Replace `assets/logo/storename_logo.png` and `storename_logo.webp` with your own brand logo.

### 2. Deployment

**Node.js Server:**
The backend is a Node.js Express server located in `server/`.
1. Navigate to the `server` directory: `cd server`
2. Install dependencies: `npm install`
3. Start the server: `npm start`
   - The server serves both the API and the static frontend files (from the parent directory).

**Nginx Setup (Recommended):**
A sample Nginx configuration is provided in `server/nginx-generic.conf`.
1. Modify `server_name` and paths to match your domain and directory.
2. Link the file to your Nginx sites-enabled directory.
3. Reload Nginx.

### 3. Key Files Structure
- **`index.html`**: The main landing page.
- **`products.js`**: Central product definition file. Apps load data from here.
- **`translations.js`**: Client-side translations.
- **`server/`**: Backend API logic, email notifications, and order management.
- **`scripts/`**: Utility scripts, e.g., `update-districts-cache.js` for fetching shipping districts.

## 📦 Shipping Integration (Sendit)
This template integrates with Sendit for shipping in Morocco.
- Ensure your `SENDIT_PUBLIC_KEY` and `SENDIT_SECRET_KEY` are set.
- Run `node scripts/update-districts-cache.js` periodically to keep the list of shipping cities updated.

## 💳 Payments (PayPal)
- The checkout process handles PayPal smart buttons.
- Ensure `paypal-config.js` is properly configured with your Client IDs.
- Toggle `PAYPAL_USE_SANDBOX` in `.env` to switch between Sandbox and Live modes.

## 🎨 Customization
- **Images**: Place your product images in `assets/` or host them externally. Update `products.js` with the correct paths.
- **Styles**: Modify `styles.css` for visual changes. The template uses a clean, responsive CSS structure.

Happy Selling!
