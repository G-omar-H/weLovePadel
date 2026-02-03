# Switch PayPal to Sandbox Mode

## Required Environment Variables

To switch to sandbox mode, you need these environment variables in Vercel:

### Required:
1. **`PAYPAL_USE_SANDBOX`** = `true` (switches to sandbox mode)
2. **`PAYPAL_CLIENT_ID_SANDBOX`** = Your sandbox client ID (get from https://developer.paypal.com/dashboard/applications/sandbox)

### Optional (but recommended to keep):
3. **`PAYPAL_CLIENT_ID_LIVE`** = Your live client ID (keep this set for easy switching back)
4. **`PAYPAL_MAD_TO_USD_RATE`** = Exchange rate (optional, defaults to 0.1)

## Quick Switch Steps

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Set or verify these variables:
   - `PAYPAL_USE_SANDBOX` = `true`
   - `PAYPAL_CLIENT_ID_SANDBOX` = `your_sandbox_client_id`
   - (Keep `PAYPAL_CLIENT_ID_LIVE` set for later)
4. **Redeploy** your application

After redeploy, PayPal will use sandbox mode for testing.

## Switch Back to Production

To switch back to live/production mode:

1. Go to Vercel → **Settings** → **Environment Variables**
2. Set `PAYPAL_USE_SANDBOX` to: `false`
3. **Redeploy** your application

## Local Testing (Development)

For local testing, create or update `paypal-config.local.js`:

```javascript
window.PAYPAL_LOCAL_CONFIG = {
    CLIENT_ID_SANDBOX: 'your_sandbox_client_id_here',
    CLIENT_ID_LIVE: 'your_live_client_id_here',
    USE_SANDBOX: true,  // Set to true for sandbox, false for production
    MAD_TO_USD_RATE: 0.1
};
```

## Verify Mode

After switching, check the browser console on the checkout page. You should see:
- `🔧 PayPal Mode: SANDBOX (Testing)` - if in sandbox mode
- `🔧 PayPal Mode: LIVE (Production)` - if in live mode

## Test Accounts

When in sandbox mode, use PayPal test accounts:
- Go to: https://developer.paypal.com/dashboard/accounts
- Use the sandbox test accounts provided by PayPal
- These accounts don't process real payments

## Important Notes

- **Sandbox mode**: No real payments are processed, perfect for testing
- **Live mode**: Real payments are processed, use only in production
- Always test in sandbox before switching to live mode
- The mode is controlled by `PAYPAL_USE_SANDBOX` environment variable
- Console logs will show which mode is active

## Environment Variables Summary

| Variable | Required | Description |
|----------|----------|-------------|
| `PAYPAL_USE_SANDBOX` | ✅ Yes | Set to `true` for sandbox, `false` for live |
| `PAYPAL_CLIENT_ID_SANDBOX` | ✅ Yes (for sandbox) | Your PayPal sandbox client ID |
| `PAYPAL_CLIENT_ID_LIVE` | ✅ Yes (for production) | Your PayPal live client ID (keep set) |
| `PAYPAL_MAD_TO_USD_RATE` | ❌ No | Exchange rate (defaults to 0.1 if not set) |

**Note**: Even when using sandbox mode, it's recommended to keep `PAYPAL_CLIENT_ID_LIVE` set in your environment variables so you can easily switch back to production later.

