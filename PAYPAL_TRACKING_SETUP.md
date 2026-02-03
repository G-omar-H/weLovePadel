# PayPal Tracking Integration Setup

## Overview

The system automatically sends Sendit tracking numbers to PayPal when orders are confirmed. This integration uses PayPal's Orders API v2 to add tracking information to completed transactions.

## How It Works

1. **Order Confirmation**: When a customer completes a PayPal payment, the order is processed
2. **Sendit Delivery Creation**: A delivery is created in Sendit and a tracking code is generated
3. **Automatic Tracking Update**: The tracking code is automatically sent to PayPal via the `/api/paypal-add-tracking` endpoint
4. **Non-Blocking**: If PayPal tracking update fails, the order still completes successfully

## Required Environment Variables

Add these to your Vercel project settings:

### For Sandbox (Testing)
- **PAYPAL_CLIENT_ID_SANDBOX**: Your PayPal sandbox client ID
- **PAYPAL_SECRET_SANDBOX**: Your PayPal sandbox secret key
- **PAYPAL_USE_SANDBOX**: Set to `true` for testing

### For Production (Live)
- **PAYPAL_CLIENT_ID_LIVE**: Your PayPal live client ID
- **PAYPAL_SECRET_LIVE**: Your PayPal live secret key
- **PAYPAL_USE_SANDBOX**: Set to `false` for production

## Getting PayPal API Credentials

1. **Go to PayPal Developer Dashboard**
   - Sandbox: https://developer.paypal.com/dashboard/applications/sandbox
   - Live: https://developer.paypal.com/dashboard/applications/live

2. **Create or Select an App**
   - Click "Create App" or select an existing app
   - Note your Client ID and Secret

3. **Add to Vercel**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Add the credentials above

## How It Works

### Automatic Flow

1. Customer completes PayPal payment
2. Order is processed and Sendit delivery is created
3. Tracking code is automatically sent to PayPal
4. PayPal notifies the customer (if configured)

### API Endpoint

**POST** `/api/paypal-add-tracking`

**Request Body:**
```json
{
  "paypalOrderId": "ORDER_ID_OR_TRANSACTION_ID",
  "trackingNumber": "SENDIT_TRACKING_CODE",
  "carrier": "OTHER"
}
```

**Response:**
```json
{
  "success": true,
  "result": { ... }
}
```

## Features

- ✅ **Automatic**: Tracking is sent immediately after Sendit delivery creation
- ✅ **Non-Blocking**: Order completion is not affected if PayPal update fails
- ✅ **Error Handling**: Comprehensive error handling with fallback methods
- ✅ **Logging**: Detailed console logs for debugging
- ✅ **Sandbox Support**: Works in both sandbox and live environments

## Troubleshooting

### Tracking Not Being Added

1. **Check Environment Variables**
   - Verify PayPal credentials are set in Vercel
   - Ensure `PAYPAL_USE_SANDBOX` is set correctly

2. **Check Console Logs**
   - Look for "📦 Sending tracking to PayPal" messages
   - Check for any error messages

3. **Verify PayPal Order ID**
   - The system uses the transaction ID (capture ID) from PayPal
   - If tracking fails, it may need to be added manually in PayPal dashboard

### Manual Tracking Addition

If automatic tracking fails, you can add tracking manually:

1. Go to PayPal Dashboard
2. Find the transaction
3. Click "Add Tracking"
4. Enter the Sendit tracking code
5. Select carrier as "Other" and enter "Sendit"

## Benefits

- **Faster Fund Release**: Adding tracking can help release held funds faster
- **Better Customer Experience**: Customers see tracking in their PayPal account
- **Reduced Disputes**: Tracking information helps resolve delivery disputes
- **Automated Workflow**: No manual steps required

## Notes

- The integration uses PayPal's Orders API v2
- Sendit is set as carrier "OTHER" since it's not in PayPal's standard list
- The system tries multiple methods to add tracking for maximum compatibility
- Errors are logged but don't block order completion

