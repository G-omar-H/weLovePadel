# Sendit Shipping Integration Guide

This document explains how to configure and use the Sendit shipping integration for StoreName.

## Overview

The Sendit integration allows StoreName to:
- Calculate shipping costs based on delivery district
- Create deliveries automatically after order completion
- Track order status in real-time
- Generate shipping labels

## Setup Instructions

### 1. Get Sendit API Credentials

1. Sign up for a Sendit account at https://app.sendit.ma
2. Navigate to your account settings
3. Generate API credentials (Public Key and Secret Key)
4. Note your pickup district ID (where orders are shipped from)

### 2. Configure Credentials (Secure Method)

**⚠️ IMPORTANT: Never commit credentials to the repository!**

#### Option A: Local Config File (Recommended for Development)

1. Copy the example file:
   ```bash
   cp sendit-config.local.js.example sendit-config.local.js
   ```

2. Edit `sendit-config.local.js` and add your credentials:
   ```javascript
   window.SENDIT_LOCAL_CONFIG = {
       PUBLIC_KEY: 'your_actual_public_key',
       SECRET_KEY: 'your_actual_secret_key',
       PICKUP_DISTRICT_ID: 1, // Your warehouse district ID
   };
   ```

3. The file is automatically gitignored and won't be committed.

#### Option B: Environment Variables (For Production/Build Systems)

1. Copy the example file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   ```env
   SENDIT_PUBLIC_KEY=your_actual_public_key
   SENDIT_SECRET_KEY=your_actual_secret_key
   SENDIT_PICKUP_DISTRICT_ID=1
   ```

3. Configure your build system to inject these variables.

**See `SETUP_SENDIT.md` for detailed setup instructions.**

### 3. Test the Integration

1. Open the checkout page
2. The district dropdown should populate with cities from Sendit
3. Select a district to see shipping costs update
4. Complete a test order to verify delivery creation

## Features

### Dynamic Shipping Costs

- Shipping costs are calculated based on the selected district
- Costs are displayed in real-time as the user selects their district
- Free shipping is shown if the district has no shipping fee

### Automatic Delivery Creation

When an order is completed:
1. Order data is collected from the checkout form
2. A delivery is created in Sendit via API
3. Tracking code is stored with the order
4. Customer receives tracking information on confirmation page

### Order Tracking

Customers can:
- View tracking information on the confirmation page
- Use the tracking page (`track-order.html`) to check order status
- See delivery timeline and status updates
- Download shipping labels (if available)

## API Endpoints Used

- `POST /login` - Authentication
- `GET /districts` - Get list of cities/districts
- `GET /districts/{id}` - Get district details and shipping costs
- `POST /deliveries` - Create new delivery
- `GET /deliveries/{code}` - Get delivery details for tracking
- `GET /all-status-deliveries` - Get delivery status translations

## Error Handling

The integration is designed to be resilient:
- If Sendit API is unavailable, checkout continues with free shipping
- If delivery creation fails, order is still saved (without tracking)
- Cached district data is used if API is slow
- User-friendly error messages are displayed

## Troubleshooting

### Districts Not Loading

1. Check API credentials in `sendit-config.js`
2. Verify network connection
3. Check browser console for errors
4. Districts are cached for 24 hours - clear cache if needed

### Shipping Costs Not Updating

1. Ensure district dropdown is selected
2. Check that district has a valid price in Sendit
3. Verify API response in browser console

### Delivery Creation Fails

1. Verify all required fields are filled
2. Check that district ID is valid
3. Ensure phone number format is correct (Moroccan format)
4. Check Sendit API status

## Security Notes

- API credentials are stored in client-side JavaScript
- For production, consider moving authentication to a backend server
- Token is cached for 1 hour to reduce API calls
- All API requests use HTTPS

## Support

For Sendit API support:
- Email: contact@sendit.ma
- Documentation: See `Sendit_API_docs.txt`

For StoreName integration issues:
- Check browser console for errors
- Verify API credentials are correct
- Ensure all required files are included in HTML

## Files Modified/Created

- `sendit-config.js` - API configuration
- `sendit-integration.js` - Integration logic
- `checkout.js` - Updated to use Sendit
- `checkout.html` - Added district dropdown
- `confirmation.html` - Added tracking display
- `track-order.html` - New tracking page
- `translations.js` - Added shipping translations
- `styles.css` - Added tracking page styles

