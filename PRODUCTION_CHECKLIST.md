# PayPal Production Mode Checklist

## ✅ Required Steps to Switch to Production

### 1. Environment Variables in Vercel

Go to **Vercel Dashboard** → **Settings** → **Environment Variables** and verify:

#### Required Variables:
- [ ] **`PAYPAL_USE_SANDBOX`** = `false` ✅ (You've done this)
- [ ] **`PAYPAL_CLIENT_ID_LIVE`** = Your live PayPal Client ID (from https://developer.paypal.com/dashboard/applications/live)
- [ ] **`PAYPAL_SECRET_LIVE`** = Your live PayPal Secret (for tracking API)

#### Optional but Recommended:
- [ ] **`PAYPAL_CLIENT_ID_SANDBOX`** = Keep this set (for easy switching back to testing)
- [ ] **`PAYPAL_MAD_TO_USD_RATE`** = Current exchange rate (e.g., `0.1`)

### 2. PayPal Developer Dashboard

Verify in [PayPal Developer Dashboard](https://developer.paypal.com/dashboard):

- [ ] **Live App Created**: You have a Live application (not just Sandbox)
- [ ] **Client ID & Secret**: You have both Live Client ID and Secret
- [ ] **Tracking API Permissions**: Live app has "Tracking API" permission enabled
  - Go to: Your Live App → Features → Enable "Tracking API"
- [ ] **Webhooks** (if using): Configured for live mode

### 3. PayPal Tracking API Configuration

The tracking API (`api/paypal-add-tracking.js`) uses these environment variables:

- [ ] **`PAYPAL_CLIENT_ID_LIVE`** = Set to your live client ID
- [ ] **`PAYPAL_SECRET_LIVE`** = Set to your live secret key

**Important:** The tracking API automatically uses LIVE credentials when `PAYPAL_USE_SANDBOX` is `false`.

### 4. Redeploy Application

After updating environment variables:

- [ ] **Redeploy** your Vercel application
- [ ] Wait for deployment to complete
- [ ] Verify deployment is successful

### 5. Verification Steps

After redeployment, verify production mode:

#### A. Check Browser Console
1. Go to checkout page: `https://your-domain.com/checkout.html`
2. Open browser console (F12)
3. Look for:
   ```
   🔧 PayPal Mode: LIVE (Production)
   🔧 PayPal Client ID: [your_live_id]... (Live)
   ```
4. ✅ If you see "LIVE (Production)" - you're good!

#### B. Test Payment Flow (Small Amount)
1. Add a product to cart
2. Go to checkout
3. Use a **real PayPal account** (not test account)
4. Complete a **small test payment** (e.g., 10 MAD)
5. Verify:
   - Payment processes successfully
   - Order confirmation appears
   - Email is sent
   - Tracking number is generated

#### C. Verify Tracking API
1. After a test order, check Vercel logs
2. Look for: `POST /api/paypal-add-tracking`
3. Should see: `200` status (not errors)
4. Check PayPal dashboard for tracking info

### 6. Security Checklist

- [ ] **Never commit** `paypal-config.local.js` with real credentials
- [ ] **Environment variables** are set in Vercel (not in code)
- [ ] **Live credentials** are different from sandbox credentials
- [ ] **Secret keys** are never exposed in client-side code
- [ ] **HTTPS** is enabled (Vercel does this automatically)

### 7. Post-Launch Monitoring

After going live, monitor:

- [ ] **Payment Success Rate**: Check Vercel logs for payment errors
- [ ] **Tracking API**: Verify tracking numbers are sent to PayPal
- [ ] **Email Delivery**: Confirm order emails are sent
- [ ] **Order Processing**: Verify orders are created correctly

## ⚠️ Important Notes

### What You've Done ✅
- Set `PAYPAL_USE_SANDBOX` to `false`
- Switched PayPal to live mode

### What You Still Need to Verify 🔍

1. **Environment Variables:**
   - `PAYPAL_CLIENT_ID_LIVE` is set correctly
   - `PAYPAL_SECRET_LIVE` is set (for tracking API)

2. **PayPal Dashboard:**
   - Live app exists and is active
   - Tracking API permission is enabled
   - Client ID and Secret are correct

3. **Redeploy:**
   - After changing environment variables, you MUST redeploy

4. **Test:**
   - Do a small real payment test
   - Verify everything works end-to-end

## 🚨 Common Issues

### Issue: "PayPal credentials not configured"
**Solution:** Make sure `PAYPAL_CLIENT_ID_LIVE` and `PAYPAL_SECRET_LIVE` are set in Vercel environment variables.

### Issue: "Tracking API returns 403 Forbidden"
**Solution:** Enable "Tracking API" permission in your Live PayPal app settings.

### Issue: Still seeing "SANDBOX" in console
**Solution:** 
1. Verify `PAYPAL_USE_SANDBOX=false` in Vercel
2. Redeploy the application
3. Clear browser cache

### Issue: Payments not processing
**Solution:**
1. Verify live Client ID is correct
2. Check PayPal account is active
3. Verify currency settings (USD conversion)
4. Check Vercel logs for errors

## 📋 Quick Verification Command

After deployment, check the console on checkout page. You should see:
```
🔧 PayPal Mode: LIVE (Production)
🔧 PayPal Client ID: [first 15 chars]... (Live)
```

If you see "SANDBOX" instead, the environment variable isn't being read correctly.

## ✅ Final Checklist

Before going fully live:

- [ ] All environment variables set correctly
- [ ] Application redeployed
- [ ] Console shows "LIVE (Production)"
- [ ] Small test payment successful
- [ ] Order confirmation received
- [ ] Email sent successfully
- [ ] Tracking API working (check logs)
- [ ] No errors in Vercel logs

---

**Status:** Ready for production once all items above are checked ✅

