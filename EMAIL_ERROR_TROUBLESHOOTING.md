# Email Sending Error Troubleshooting

## Error: NetworkError when attempting to fetch resource

### What This Means

This error occurs when the browser cannot complete the network request to `/api/send-order-email`. This is **non-blocking** - your order still completes successfully, but the email might not be sent.

### Common Causes

1. **Network Connectivity Issues**
   - Temporary network interruption
   - Slow connection
   - Firewall blocking the request

2. **CORS Issues**
   - Browser blocking cross-origin requests
   - Missing CORS headers (should be fixed now)

3. **API Endpoint Issues**
   - Vercel serverless function timeout
   - API endpoint not responding
   - Rate limiting

4. **Resend API Issues**
   - Resend API temporarily unavailable
   - Rate limiting from Resend
   - Invalid API key

### What We've Fixed

✅ **Improved Error Handling:**
- Better retry logic with longer delays (2s, 4s, 6s)
- More detailed error logging
- Non-blocking errors (order completes even if email fails)

✅ **Enhanced API Endpoint:**
- Better CORS headers
- Timeout handling (25 seconds)
- Improved error messages

✅ **Better Request Management:**
- Increased delay between customer and admin emails (1s)
- Exponential backoff for retries

### Current Behavior

**Order Processing:**
- ✅ Order is **always processed** successfully
- ✅ Payment is **always captured**
- ✅ Order is saved to localStorage
- ✅ User is redirected to confirmation page
- ⚠️ Email sending is **non-blocking** (fails silently if needed)

**Email Sending:**
- Attempts to send customer email (3 retries)
- Waits 1 second
- Attempts to send admin email (3 retries)
- If both fail, order still completes

### How to Verify

1. **Check Order Completion:**
   - Order should appear on confirmation page
   - Order number should be displayed
   - Payment should be processed

2. **Check Email Status:**
   - Check Vercel logs: `https://vercel.com/[your-project]/logs`
   - Look for `/api/send-order-email` requests
   - Check for success/error messages

3. **Check Resend Dashboard:**
   - Go to: https://resend.com/emails
   - Check if emails were sent
   - Look for any errors or bounces

### Troubleshooting Steps

#### 1. Check Vercel Logs

Go to Vercel Dashboard → Your Project → Logs:
- Look for `/api/send-order-email` entries
- Check for error messages
- Verify RESEND_API_KEY is set

#### 2. Verify Environment Variables

In Vercel → Settings → Environment Variables, ensure:
- ✅ `RESEND_API_KEY` is set
- ✅ `ADMIN_EMAIL` is set (optional, defaults to info@your-domain.com)
- ✅ `FROM_EMAIL` is set (optional, defaults to noreply@your-domain.com)

#### 3. Test API Endpoint Directly

You can test the endpoint manually:
```bash
curl -X POST https://www.your-domain.com/api/send-order-email \
  -H "Content-Type: application/json" \
  -d '{"orderData": {...}, "emailType": "admin"}'
```

#### 4. Check Resend API Status

- Visit: https://status.resend.com
- Check if Resend API is operational
- Verify your Resend account is active

#### 5. Verify Domain in Resend

- Go to: https://resend.com/domains
- Ensure your domain is verified
- Check DNS records are correct

### If Error Persists

**Option 1: Check Vercel Function Logs**
- Go to Vercel Dashboard → Functions
- Check `/api/send-order-email` function logs
- Look for specific error messages

**Option 2: Test with Smaller Payload**
- The error might be due to large email content
- Try reducing order data size

**Option 3: Check Browser Console**
- Open browser DevTools (F12)
- Check Network tab for failed requests
- Look for CORS errors or timeout errors

### Important Notes

⚠️ **The error is non-blocking:**
- Orders complete successfully even if email fails
- Payment is processed correctly
- User sees confirmation page
- Order data is saved

📧 **Email is secondary:**
- Order processing is the priority
- Email sending happens asynchronously
- Failed emails don't affect order completion

### Monitoring

To monitor email sending:
1. Check Vercel logs regularly
2. Monitor Resend dashboard for delivery rates
3. Set up alerts for failed email attempts
4. Check customer feedback about missing emails

### Next Steps

If the error continues:
1. ✅ Verify RESEND_API_KEY is correct
2. ✅ Check Resend account status
3. ✅ Verify domain is verified in Resend
4. ✅ Check Vercel function logs for details
5. ✅ Test API endpoint directly

---

**Remember:** The NetworkError doesn't prevent order completion. The order is processed successfully, and the email error is logged for debugging.

