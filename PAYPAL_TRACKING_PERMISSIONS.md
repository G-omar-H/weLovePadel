# PayPal Tracking API Permissions Fix

## Issue: 403 Forbidden Error

If you're getting a `403 Forbidden` error when trying to add tracking to PayPal, it means your PayPal app doesn't have the required permissions for the Tracking API.

## Error Message
```
PayPal tracking failed: { 
  status: 403, 
  statusText: 'Forbidden', 
  error: { errors: [...] } 
}
```

## Solution

### Option 1: Enable Tracking API Permissions (Recommended)

1. **Go to PayPal Developer Dashboard**
   - Sandbox: https://developer.paypal.com/dashboard/applications/sandbox
   - Live: https://developer.paypal.com/dashboard/applications/live

2. **Select Your App**
   - Click on the app you're using for credentials

3. **Check App Permissions**
   - Look for "Features" or "Permissions" section
   - Verify that "Tracking API" or "Shipping Tracking" is enabled

4. **If Not Enabled:**
   - Contact PayPal Support to enable Tracking API access
   - Or create a new app and request Tracking API permissions during creation

### Option 2: Request Permissions via PayPal Support

1. **Contact PayPal Developer Support**
   - Go to: https://developer.paypal.com/support
   - Submit a ticket requesting Tracking API access
   - Provide your app Client ID
   - Mention you need access to `/v1/shipping/trackers-batch` endpoint

2. **What to Request:**
   - Enable "Tracking API" or "Shipping Tracking" permissions
   - For your sandbox/live app (specify which)
   - With Client ID: `YOUR_CLIENT_ID`

### Option 3: Manual Tracking (Temporary Workaround)

Until permissions are enabled, you can add tracking manually:

1. Go to PayPal Dashboard
2. Find the transaction
3. Click "Add Tracking"
4. Enter tracking number
5. Select carrier as "Other" and enter "Sendit"

## Required Permissions/Scopes

The Tracking API requires one of these permissions:
- `https://api.paypal.com/v1/shipping/trackers-batch` (Tracking API)
- Or equivalent shipping/tracking scope

## Verification

After enabling permissions, test again. You should see:
- Status: 200 (instead of 403)
- Success message in logs
- Tracking number appears in PayPal transaction

## Notes

- The 403 error doesn't block order completion - orders still process successfully
- Tracking can be added manually in PayPal dashboard as a workaround
- Permissions are app-specific - each app needs its own permissions enabled

