# Sendit API Setup Instructions

## 🔒 Security Notice

**Never commit your Sendit API credentials to the repository!** They are sensitive and should be kept private.

## Quick Setup (Recommended)

### Option 1: Local Config File (Easiest for Development)

1. **Copy the example file:**
   ```bash
   cp sendit-config.local.js.example sendit-config.local.js
   ```

2. **Edit `sendit-config.local.js`** and add your credentials:
   ```javascript
   window.SENDIT_LOCAL_CONFIG = {
       PUBLIC_KEY: 'your_actual_public_key',
       SECRET_KEY: 'your_actual_secret_key',
       PICKUP_DISTRICT_ID: 1, // Your warehouse district ID
   };
   ```

3. **Done!** The file is automatically gitignored and won't be committed.

### Option 2: Environment Variables (For Build Systems)

1. **Copy the example file:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** and add your credentials:
   ```env
   SENDIT_PUBLIC_KEY=your_actual_public_key
   SENDIT_SECRET_KEY=your_actual_secret_key
   SENDIT_PICKUP_DISTRICT_ID=1
   ```

3. **Configure your build system** to inject these variables:
   - **Vite**: Variables are automatically available as `import.meta.env.VITE_SENDIT_PUBLIC_KEY`
   - **Webpack**: Use `process.env.SENDIT_PUBLIC_KEY`
   - **Vercel**: Add in project settings → Environment Variables

## Getting Your Credentials

1. Log in to https://app.sendit.ma
2. Navigate to your account settings or API section
3. Generate or copy:
   - **Public Key**
   - **Secret Key**
   - **Pickup District ID** (your warehouse location)

## File Structure

```
storename/
├── .env                          # Gitignored - Your actual credentials
├── .env.example                  # Template - Safe to commit
├── sendit-config.js              # Main config - Loads from local/env
├── sendit-config.local.js         # Gitignored - Your local credentials
└── sendit-config.local.js.example # Template - Safe to commit
```

## Verification

After setup, test your configuration:

1. Open `test-sendit.html` in your browser
2. Click "Check Configuration" - should show ✅ for both keys
3. Click "Test Login" - should authenticate successfully

## Production Deployment

### For Static Hosting (Vercel, Netlify, etc.)

1. **Add environment variables** in your hosting platform:
   - `SENDIT_PUBLIC_KEY`
   - `SENDIT_SECRET_KEY`
   - `SENDIT_PICKUP_DISTRICT_ID`

2. **Update build process** to inject these into `sendit-config.js`

### For Server-Side Rendering

If you're using a build system, environment variables will be automatically available.

## Troubleshooting

### Credentials Not Loading

1. **Check file exists:**
   - `sendit-config.local.js` should exist (not the .example file)
   - `.env` should exist (not the .example file)

2. **Check file format:**
   - JSON syntax must be valid
   - No trailing commas
   - Strings must be in quotes

3. **Check browser console:**
   - Look for errors loading `sendit-config.local.js`
   - Check if `window.SENDIT_LOCAL_CONFIG` is defined

### Still Using Placeholder Values

1. Make sure you're editing the correct file (not .example)
2. Clear browser cache
3. Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
4. Check browser console for errors

## Security Best Practices

✅ **DO:**
- Use `sendit-config.local.js` for local development
- Use environment variables for production
- Keep `.env` and `sendit-config.local.js` in `.gitignore`
- Share `.env.example` and `sendit-config.local.js.example` as templates

❌ **DON'T:**
- Commit actual credentials to git
- Share credentials in chat/email
- Hardcode credentials in `sendit-config.js`
- Commit `.env` or `sendit-config.local.js`

## Need Help?

- Check `SENDIT_TESTING_GUIDE.md` for testing instructions
- Check `SENDIT_INTEGRATION_README.md` for integration details
- Contact Sendit support: contact@sendit.ma

