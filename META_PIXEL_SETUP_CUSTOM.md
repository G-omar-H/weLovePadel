# Meta Pixel Setup for Custom-Coded Websites

## Quick Answer: What to Choose in Meta Business Suite

When Meta asks: **"Choisissez le site web que vous voulez associer..."**

### ✅ CORRECT CHOICE for Custom Websites:

1. **"Autre"** (Other) - Best option
2. **"Personnalisé"** (Custom) - Alternative
3. **"Manuel"** (Manual) - Alternative
4. **"Je n'utilise pas d'outil"** (I don't use a tool) - If available
5. **Skip/Passer** - If available, then choose "Installation manuelle"

### ❌ DO NOT CHOOSE:
- Shopify
- WordPress
- Wix
- Squarespace
- Any third-party platform

## Step-by-Step for Custom Websites

### Method 1: Via "Autre" (Other)

1. In the dropdown, select **"Autre"** (Other)
2. Click **"Continuer"** (Continue)
3. Meta will show you the Pixel code
4. **You don't need to copy the code** - we already have it implemented!
5. Just copy the **Pixel ID** (15-digit number)
6. Add it to `analytics.js` → `META_PIXEL_ID: 'YOUR_ID_HERE'`

### Method 2: Via Developer Instructions

1. Click **"Consignes développeur"** (Developer Instructions)
2. This will show manual installation steps
3. You'll see your Pixel ID displayed
4. Copy the **Pixel ID** only (not the full code)
5. Add it to `analytics.js`

### Method 3: Skip Platform Selection

1. Look for **"Passer"** (Skip) or **"Ignorer"** button
2. Click it to skip platform selection
3. Choose **"Installation manuelle"** (Manual Installation)
4. Copy your **Pixel ID** from the displayed code

## What You Need (Already Implemented!)

✅ **Good News**: The Pixel code is already implemented in your website!

You only need:
- Your **Pixel ID** (15-digit number)
- Add it to `analytics.js` line 15

## After Getting Your Pixel ID

1. Open `analytics.js`
2. Find line 15: `META_PIXEL_ID: ''`
3. Replace with: `META_PIXEL_ID: '123456789012345'` (your actual ID)
4. Save and deploy

## Verification

After adding your Pixel ID:

1. Visit your website
2. Open browser console (F12)
3. Look for: `Meta Pixel: Initialized with ID 123456789012345`
4. Use [Facebook Pixel Helper](https://chrome.google.com/webstore/detail/facebook-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc) to verify

## Why "Autre" (Other)?

- Third-party platforms (Shopify, WordPress) have built-in integrations
- Custom websites need manual installation
- "Autre" tells Meta you'll install manually
- This is correct for your custom-coded website

---

**Note**: The Pixel code is already in your website. You just need the Pixel ID from Meta!

