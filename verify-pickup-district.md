# Verify Pickup District ID

## Quick Check

1. **Check Vercel Environment Variable:**
   - Go to: https://vercel.com/your-project/settings/environment-variables
   - Look for: `SENDIT_PICKUP_DISTRICT_ID`
   - Value should be: `1` (if your warehouse is in Casablanca - Al fida)

2. **Check API Response:**
   - Visit: https://www.your-domain.com/api/sendit-config.js
   - Look for: `"pickupDistrictId": 1`
   - This confirms what value is being used

3. **Check Browser Console:**
   - Open checkout page
   - Open browser console
   - Look for: `✅ Sendit config loaded from API:`
   - Check: `pickupDistrictId: 1`

## Current Configuration

- **Default Value:** `1` (Casablanca - Al fida)
- **Vercel API Endpoint:** Defaults to `1` if env var not set
- **Client Config:** Defaults to `1` if env var not set

## Is `1` Correct?

**District ID `1` = Casablanca - Al fida**

If your warehouse is:
- ✅ **In Casablanca - Al fida** → `1` is correct
- ❌ **In a different location** → Update to the correct district ID

## How to Find Your Correct District ID

1. Log in to Sendit dashboard: https://app.sendit.ma
2. Go to your warehouse/pickup location settings
3. Find the district ID for your warehouse location
4. Update `SENDIT_PICKUP_DISTRICT_ID` in Vercel to that value

## Update in Vercel

1. Go to: https://vercel.com/your-project/settings/environment-variables
2. Find or add: `SENDIT_PICKUP_DISTRICT_ID`
3. Set value to your warehouse district ID
4. Redeploy the application

