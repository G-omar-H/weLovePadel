/**
 * Generic API Server
 * Express server to handle API endpoints (migrated from Vercel serverless functions)
 */

import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { writeFile, rename } from 'fs/promises';

import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';
import rateLimit from 'express-rate-limit';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { initAutomation } from './automation.js';

// Get current file directory for ES modules
const __filename_module = fileURLToPath(import.meta.url);
const __dirname_module = dirname(__filename_module);

// Load environment variables
config({ path: '../.env.local' });
config({ path: '.env' });

const app = express();
// Enable trust proxy for Nginx
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;

// Rate Limiters
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Increased: Limit each IP to 500 requests per windowMs (checkout needs many)
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' }
});

const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 100, // Limit each IP to 100 submissions per hour (relaxed for testing)
    message: { error: 'Too many submissions, please try again later.' }
});

// Apply general limiter to all requests
app.use(apiLimiter);

// Middleware - Allow all origins for API
app.use(cors()); // Handles all CORS headers correctly
app.use(express.json({ limit: '10mb' }));
app.use(express.text({ type: 'text/plain', limit: '10mb' })); // For sendBeacon

// Manual CORS headers removed to prevent "Multiple Allow-Origin" errors
// app.use(cors()) does this automatically

// ============================================
// Meta Conversions API Configuration
// ============================================
const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || '';
const META_API_VERSION = 'v19.0';


// Helper to hash user data for Meta (SHA-256)
async function hashData(data) {
    if (!data) return null;
    // Normalize: lowercase, remove whitespace
    const normalized = data.trim().toLowerCase();
    // Simple SHA-256 implementation using crypto
    const { createHash } = await import('crypto');
    return createHash('sha256').update(normalized).digest('hex');
}

// Meta Conversions API Endpoint
app.post('/api/meta/event', async (req, res) => {
    try {
        const { eventName, eventId, eventSourceUrl, customData, userData } = req.body;

        // Client IP and User Agent are required for good matching
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'];

        // Prepare User Data
        // We need to hash PII (Personally Identifiable Information)
        const userDataPayload = {
            client_ip_address: clientIp,
            client_user_agent: userAgent,
        };

        if (userData) {
            if (userData.em) userDataPayload.em = [await hashData(userData.em)];
            if (userData.ph) userDataPayload.ph = [await hashData(userData.ph)];
            if (userData.fn) userDataPayload.fn = [await hashData(userData.fn)];
            if (userData.ln) userDataPayload.ln = [await hashData(userData.ln)];
            if (userData.city) userDataPayload.ct = [await hashData(userData.city)];

            // Handle direct passed email/phone/name (from server-side triggers)
            if (userData.email) userDataPayload.em = [await hashData(userData.email)];
            if (userData.phone) userDataPayload.phone = [await hashData(userData.phone)];
            if (userData.name) {
                // simple split attempt
                const parts = userData.name.trim().split(' ');
                if (parts.length > 0) userDataPayload.fn = [await hashData(parts[0])];
                if (parts.length > 1) userDataPayload.ln = [await hashData(parts[parts.length - 1])];
            }
        }

        // Construct Event Payload
        const eventPayload = {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_source_url: eventSourceUrl,
            event_id: eventId, // Critical for deduplication
            action_source: 'website',
            user_data: userDataPayload,
            custom_data: customData
        };

        // Send to Meta Graph API
        const response = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                access_token: META_ACCESS_TOKEN,
                data: [eventPayload]
                // test_event_code: 'TEST12345' // Use this for testing in Events Manager if needed
            })
        });

        const result = await response.json();

        if (response.ok) {
            // console.log(`✅ Meta Event Sent: ${eventName}`);
            res.json({ success: true, fb_trace_id: result.fbtrace_id });
        } else {
            console.error('❌ Meta API Error:', result);
            res.status(400).json({ success: false, error: result });
        }

    } catch (error) {
        console.error('❌ Server Meta CAPI Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Serve static files from the project root (../)
app.use(express.static(join(__dirname_module, '../')));

// ============================================
// Nodemailer SMTP Configuration (Local Postfix)
// ============================================
const smtpTransporter = nodemailer.createTransport({
    host: 'localhost',
    port: 25,
    secure: false, // true for 465, false for other ports
    tls: {
        rejectUnauthorized: false
    },
    // Optimization for local delivery
    pool: true,
    maxConnections: 5,
    maxMessages: 100
});

// Verify SMTP connection on startup
smtpTransporter.verify((error, success) => {
    if (error) {
        console.error('❌ SMTP connection failed:', error.message);
    } else {
        console.log('✅ SMTP server ready to send emails');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Handle Vercel-specific endpoints (return empty success)
app.all('/_vercel/*', (req, res) => {
    res.status(200).json({ ok: true });
});

// Handle local config file requests (return empty config)
app.get('/sendit-config.local.js', (req, res) => {
    res.type('application/javascript').send('// Production mode - config loaded from API\nwindow.SENDIT_LOCAL_CONFIG = {};');
});
app.get('/paypal-config.local.js', (req, res) => {
    res.type('application/javascript').send('// Production mode - config loaded from API\nwindow.PAYPAL_LOCAL_CONFIG = {};');
});

// ============================================
// GitHub Webhook for Auto-Deploy
// ============================================
const deployWebhookHandler = async (req, res) => {
    const secret = process.env.DEPLOY_WEBHOOK_SECRET || 'deploy-secret-2026';
    const signature = req.headers['x-hub-signature-256'];

    // Simple secret check (for basic security)
    const providedSecret = req.headers['x-deploy-secret'] || req.query.secret;
    if (providedSecret !== secret && !signature) {
        console.log('❌ Deploy webhook: Unauthorized request');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    console.log('🚀 Deploy webhook triggered at:', new Date().toISOString());

    // Respond immediately to prevent timeout
    res.json({ success: true, message: 'Deploy triggered, running in background' });

    // Run deploy in background (don't await)
    try {
        const { exec } = await import('child_process');

        // Simple git pull command - more reliable than external script
        // Added cd server before npm install because package.json is in server/
        const deployCommand = 'git fetch origin && git reset --hard origin/main && npm install && pm2 restart all && echo "Deploy complete"';

        exec(deployCommand, { timeout: 120000 }, (error, stdout, stderr) => {
            if (error) {
                console.error('❌ Deploy error:', error.message);
                return;
            }
            console.log('✅ Deploy output:', stdout);
            if (stderr) console.log('Deploy stderr:', stderr);
        });
    } catch (error) {
        console.error('❌ Deploy execution error:', error);
    }
};

// Support both /deploy-webhook and /api/deploy-webhook
app.post('/deploy-webhook', deployWebhookHandler);
app.post('/api/deploy-webhook', deployWebhookHandler);

// ============================================
// PayPal Configuration Endpoint
// ============================================
const paypalConfigHandler = (req, res) => {
    const config = {
        CLIENT_ID_LIVE: process.env.PAYPAL_CLIENT_ID_LIVE || null,
        CLIENT_ID_SANDBOX: process.env.PAYPAL_CLIENT_ID_SANDBOX || null,
        USE_SANDBOX: process.env.PAYPAL_USE_SANDBOX === 'true' || false,
        MAD_TO_USD_RATE: parseFloat(process.env.PAYPAL_MAD_TO_USD_RATE || '0.1')
    };
    res.json(config);
};
app.get('/paypal-config', paypalConfigHandler);
app.get('/paypal-config.js', paypalConfigHandler); // Alias for backward compatibility

// ============================================
// Exchange Rate Endpoint
// ============================================
const exchangeRateHandler = async (req, res) => {
    try {
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');

        if (!response.ok) {
            throw new Error(`Exchange rate API returned ${response.status}`);
        }

        const data = await response.json();
        const usdToMad = data.rates?.MAD;

        if (!usdToMad || isNaN(usdToMad)) {
            throw new Error('Invalid MAD rate from API');
        }

        const madToUsd = 1 / usdToMad;

        res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        res.json({
            rate: parseFloat(madToUsd.toFixed(6)),
            usdToMad: parseFloat(usdToMad.toFixed(4)),
            timestamp: new Date().toISOString(),
            source: 'exchangerate-api.com'
        });

    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        const fallbackRate = parseFloat(process.env.PAYPAL_MAD_TO_USD_RATE || '0.1');
        res.json({
            rate: fallbackRate,
            usdToMad: 1 / fallbackRate,
            timestamp: new Date().toISOString(),
            source: 'fallback',
            error: error.message
        });
    }
};
app.get('/exchange-rate', exchangeRateHandler);
app.get('/exchange-rate.js', exchangeRateHandler); // Alias for backward compatibility

// ============================================
// Sendit Configuration Endpoint
// ============================================
const senditConfigHandler = (req, res) => {
    res.json({
        PUBLIC_KEY: process.env.SENDIT_PUBLIC_KEY || '',
        SECRET_KEY: process.env.SENDIT_SECRET_KEY || '',
        PICKUP_DISTRICT_ID: parseInt(process.env.SENDIT_PICKUP_DISTRICT_ID || '1', 10),
        ALLOW_OPEN: parseInt(process.env.SENDIT_ALLOW_OPEN || '1', 10),
        ALLOW_TRY: parseInt(process.env.SENDIT_ALLOW_TRY || '1', 10),
        OPTION_EXCHANGE: parseInt(process.env.SENDIT_OPTION_EXCHANGE || '0', 10),
        // IMPORTANT: Products ALWAYS from stock - hardcoded to 1 to ensure correct behavior
        PRODUCTS_FROM_STOCK: 1,  // Always from stock (PRA13E/PRA13F codes)
        PACKAGING_ID: 8          // Carton box 3 (30cm x 20cm x 13cm)
    });
};
app.get('/sendit-config', senditConfigHandler);
app.get('/sendit-config.js', senditConfigHandler); // Alias for backward compatibility

// ============================================
// Sendit Districts Cache Endpoint
// ============================================
// In-memory cache for districts data
let districtsCache = null;
let districtsCacheTime = null;
const DISTRICTS_MEMORY_CACHE_DURATION = 60 * 60 * 1000; // 1 hour

function loadDistrictsCache() {
    const now = Date.now();

    // Return in-memory cache if still fresh
    if (districtsCache && districtsCacheTime && (now - districtsCacheTime) < DISTRICTS_MEMORY_CACHE_DURATION) {
        return districtsCache;
    }

    // Try multiple possible paths for the cache file
    const possiblePaths = [
        join(__dirname_module, '..', 'data', 'sendit-districts.json'),
        join(process.cwd(), 'data', 'sendit-districts.json'),
        '/var/www/your-domain.com/public/data/sendit-districts.json',
        '/var/www/your-domain.com/data/sendit-districts.json'
    ];

    for (const cachePath of possiblePaths) {
        if (existsSync(cachePath)) {
            try {
                const fileContent = readFileSync(cachePath, 'utf8');
                districtsCache = JSON.parse(fileContent);
                districtsCacheTime = now;
                console.log(`📍 Districts cache loaded from: ${cachePath}`);
                return districtsCache;
            } catch (error) {
                console.error(`Error loading districts cache from ${cachePath}:`, error);
            }
        }
    }

    console.warn('⚠️ No districts cache file found');
    return null;
}

const senditDistrictsHandler = (req, res) => {
    // Cache for 1 hour on CDN/browser
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

    // Load cached districts
    const data = loadDistrictsCache();

    if (!data) {
        return res.status(503).json({
            success: false,
            error: 'Districts cache not available. Run: node scripts/update-districts-cache.js',
            fallback: true
        });
    }

    // Query parameters for filtering
    const { search, city, id } = req.query;

    // If specific ID requested
    if (id) {
        const district = data.byId ? data.byId[id] : null;
        if (district) {
            return res.json({ success: true, data: district });
        }
        return res.status(404).json({ success: false, error: `District ${id} not found` });
    }

    // If specific city requested
    if (city) {
        const cityDistricts = data.byCity ? (data.byCity[city] || []) : [];
        return res.json({
            success: true,
            data: cityDistricts,
            meta: { city: city, count: cityDistricts.length }
        });
    }

    // If search query provided
    if (search && search.length >= 2) {
        const searchLower = search.toLowerCase();
        const filtered = (data.districts || []).filter(d =>
            (d.name || '').toLowerCase().includes(searchLower) ||
            (d.ville || '').toLowerCase().includes(searchLower)
        ).slice(0, 50);

        return res.json({
            success: true,
            data: filtered,
            meta: { query: search, count: filtered.length }
        });
    }

    // Return all districts
    return res.json({
        success: true,
        data: data.districts || [],
        meta: data.meta || {},
        cities: data.cities || []
    });
};

app.get('/sendit-districts', senditDistrictsHandler);

// ============================================
// PayPal Add Tracking Endpoint
// ============================================
app.post('/paypal-add-tracking', async (req, res) => {
    const { orderId, trackingNumber, carrier = 'OTHER' } = req.body;

    if (!orderId || !trackingNumber) {
        return res.status(400).json({ error: 'Missing orderId or trackingNumber' });
    }

    const clientId = process.env.PAYPAL_USE_SANDBOX === 'true'
        ? process.env.PAYPAL_CLIENT_ID_SANDBOX
        : process.env.PAYPAL_CLIENT_ID_LIVE;
    const clientSecret = process.env.PAYPAL_USE_SANDBOX === 'true'
        ? process.env.PAYPAL_SECRET_SANDBOX
        : process.env.PAYPAL_SECRET_LIVE;
    const baseUrl = process.env.PAYPAL_USE_SANDBOX === 'true'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';

    try {
        // Get access token
        const authResponse = await fetch(`${baseUrl}/v1/oauth2/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: 'grant_type=client_credentials'
        });

        if (!authResponse.ok) {
            throw new Error(`Auth failed: ${authResponse.status}`);
        }

        const authData = await authResponse.json();
        const accessToken = authData.access_token;

        // Add tracking info
        const trackingResponse = await fetch(`${baseUrl}/v1/shipping/trackers-batch`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                trackers: [{
                    transaction_id: orderId,
                    tracking_number: trackingNumber,
                    status: 'SHIPPED',
                    carrier: carrier
                }]
            })
        });

        const trackingData = await trackingResponse.json();

        if (!trackingResponse.ok) {
            console.error('PayPal tracking error:', trackingData);
            return res.status(trackingResponse.status).json({
                error: 'Failed to add tracking',
                details: trackingData
            });
        }

        res.json({ success: true, data: trackingData });

    } catch (error) {
        console.error('PayPal tracking error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ============================================
// Email Translations (Full Version)
// ============================================
import emailTranslations, { getEmailT } from './email-translations.js';

// The helper function getEmailT is now imported from the module


// Review Request Email Translations
const reviewEmailTranslations = {
    en: {
        subject: (orderNumber) => `⭐ Your Opinion Matters — Share Your StoreName Experience #${orderNumber}`,
        preheader: "We value your feedback! Share your experience and get 10% off your next order",
        greeting: (name) => `Dear ${name},`,
        title: "How Did We Do?",
        intro: "Your order has arrived! We hope your new StoreName brings you as much pride as it does style. Your honest feedback helps us maintain our commitment to excellence and guides fellow customers in their journey.",
        yourOrder: "Your Order",
        leaveReview: "Leave a Review",
        reviewPrompt: "Share your experience in 3 simple steps:",
        step1: "⭐ Rate your satisfaction (1-5 stars)",
        step2: "✍️ Share your thoughts (optional)",
        step3: "📷 Add a photo wearing your StoreName (optional)",
        thankYouNote: "As our appreciation, receive an exclusive 10% discount on your next purchase!",
        buttonText: "Share My Experience",
        questionsTitle: "Need Assistance?",
        questionsText: "Our team is here for you:",
        or: "or",
        footer: "Premium Quality Products",
        copyright: (year) => `© ${year} StoreName. All rights reserved.`,
        unsubscribe: "You received this email following your recent purchase. To opt out of review requests, simply disregard this message."
    },
    fr: {
        subject: (orderNumber) => `⭐ Votre Avis Compte — Partagez Votre Expérience StoreName #${orderNumber}`,
        preheader: "Votre avis est précieux ! Partagez votre expérience et bénéficiez de 10% de réduction",
        greeting: (name) => `Cher(e) ${name},`,
        title: "Comment Était Votre Expérience ?",
        intro: "Votre commande est arrivée ! Nous espérons que votre nouveau StoreName vous apporte autant de fierté que de style. Vos retours sincères nous permettent de maintenir notre engagement envers l'excellence.",
        yourOrder: "Votre Commande",
        leaveReview: "Donner Mon Avis",
        reviewPrompt: "Partagez votre expérience en 3 étapes simples :",
        step1: "⭐ Évaluez votre satisfaction (1-5 étoiles)",
        step2: "✍️ Partagez vos impressions (facultatif)",
        step3: "📷 Ajoutez une photo avec votre StoreName (facultatif)",
        thankYouNote: "En remerciement, recevez une réduction exclusive de 10% sur votre prochaine commande !",
        buttonText: "Partager Mon Expérience",
        questionsTitle: "Besoin d'Aide ?",
        questionsText: "Notre équipe est à votre disposition :",
        or: "ou",
        footer: "Qualité Premium",
        copyright: (year) => `© ${year} StoreName. Tous droits réservés.`,
        unsubscribe: "Vous recevez cet email suite à votre récent achat. Pour ne plus recevoir de demandes d'avis, ignorez simplement ce message."
    },
    ar: {
        subject: (orderNumber) => `⭐ رأيك يهمنا — شاركنا تجربتك مع طربوشي #${orderNumber}`,
        preheader: "رأيك ثمين! شاركنا تجربتك واحصل على خصم 10% على طلبك القادم",
        greeting: (name) => `عزيزي ${name}،`,
        title: "كيف كانت تجربتك؟",
        intro: "وصل طلبك! نأمل أن يمنحك طربوشي الجديد الفخر والأناقة. ملاحظاتك الصادقة تساعدنا في الحفاظ على التزامنا بالتميز وتوجه العملاء الآخرين في رحلتهم.",
        yourOrder: "طلبك",
        leaveReview: "أضف تقييمك",
        reviewPrompt: "شارك تجربتك في 3 خطوات بسيطة:",
        step1: "⭐ قيّم رضاك (1-5 نجوم)",
        step2: "✍️ شارك انطباعاتك (اختياري)",
        step3: "📷 أضف صورة لك بالطربوش (اختياري)",
        thankYouNote: "تقديراً لوقتك، احصل على خصم حصري 10% على طلبك القادم!",
        buttonText: "شارك تجربتي",
        questionsTitle: "تحتاج مساعدة؟",
        questionsText: "فريقنا في خدمتك:",
        or: "أو",
        footer: "جودة ممتازة",
        copyright: (year) => `© ${year} طربوشي. جميع الحقوق محفوظة.`,
        unsubscribe: "تلقيت هذا البريد بعد عملية الشراء الأخيرة. لعدم استلام طلبات التقييم، تجاهل هذه الرسالة."
    }
};

// Get review email translation helper
function getReviewT(lang, key, ...args) {
    const translations = reviewEmailTranslations[lang] || reviewEmailTranslations.en;
    const translation = translations[key];

    if (typeof translation === 'function') {
        return translation(...args);
    }
    return translation || reviewEmailTranslations.en[key] || key;
}



// ============================================
// Send Order Email Endpoint (Full Version)
// ============================================
// Email endpoint (Strict Rate Limit)
app.post('/send-order-email', strictLimiter, async (req, res) => {
    // Add timeout handling
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            res.status(504).json({ error: 'Request timeout' });
        }
    }, 30000); // 30 second timeout

    try {
        const { orderData, emailType } = req.body;

        if (!orderData) {
            clearTimeout(timeout);
            return res.status(400).json({ error: 'Order data is required' });
        }

        // Get email configuration from environment variables
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@your-domain.com';
        const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@your-domain.com';
        const FROM_NAME = process.env.FROM_NAME || 'StoreName';

        // Get user's language preference (default to 'en')
        const userLanguage = orderData.language || 'en';
        const lang = ['en', 'fr', 'ar'].includes(userLanguage) ? userLanguage : 'en';

        let emailHtml;
        let emailText;
        let subject;
        let toEmail;

        if (emailType === 'customer') {
            // 1. Send Customer Confirmation Email
            emailHtml = generateCustomerEmail(orderData, lang);
            emailText = generateCustomerEmailText(orderData, lang);
            subject = getEmailT(lang, 'customer', 'subject', orderData.orderNumber);
            toEmail = orderData.customer.email;

            // 2. Trigger Admin Notification (Side-effect, don't await blocking)
            // We construct and send the admin email immediately after the customer email
            (async () => {
                try {
                    const adminHtml = generateAdminEmail(orderData, 'en');
                    const adminText = generateAdminEmailText(orderData, 'en');
                    const adminSubject = getEmailT('en', 'admin', 'subject', orderData.orderNumber);

                    const adminMailOptions = {
                        from: `${FROM_NAME} <${FROM_EMAIL}>`,
                        to: ADMIN_EMAIL,
                        replyTo: FROM_EMAIL,
                        subject: adminSubject,
                        html: adminHtml,
                        text: adminText,
                        headers: {
                            'X-Entity-Ref-ID': orderData.orderNumber,
                            'X-Order-Number': orderData.orderNumber,
                            'Auto-Submitted': 'auto-generated'
                        }
                    };

                    const adminResult = await smtpTransporter.sendMail(adminMailOptions);
                    console.log(`✅ Admin notification sent for ${orderData.orderNumber}:`, adminResult.messageId);
                } catch (adminErr) {
                    console.error('❌ Failed to send admin notification:', adminErr.message);
                }
            })();

        } else if (emailType === 'admin') {
            // Admin notification email (Explicit call - likely legacy or testing)
            emailHtml = generateAdminEmail(orderData, 'en');
            emailText = generateAdminEmailText(orderData, 'en');
            subject = getEmailT('en', 'admin', 'subject', orderData.orderNumber);
            toEmail = ADMIN_EMAIL;
        } else {
            clearTimeout(timeout);
            return res.status(400).json({ error: 'Invalid email type' });
        }

        // Validate email address format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(toEmail)) {
            console.error('Invalid email address:', toEmail);
            clearTimeout(timeout);
            return res.status(400).json({ error: 'Invalid email address', email: toEmail });
        }

        console.log(`📤 Sending ${emailType} email to:`, toEmail);

        // Send email using Nodemailer (local Postfix SMTP)
        const mailOptions = {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: toEmail,
            replyTo: FROM_EMAIL, // Changed from ADMIN_EMAIL per user request (User wants noreply)
            subject: subject,
            html: emailHtml,
            text: emailText,
            headers: {
                'X-Entity-Ref-ID': orderData.orderNumber,
                'X-Order-Number': orderData.orderNumber,
                'List-Unsubscribe': `<mailto:${FROM_EMAIL}?subject=unsubscribe>`,
                'Precedence': 'bulk',
                'X-Auto-Response-Suppress': 'All',
                'Auto-Submitted': 'auto-generated'
            },
            bcc: FROM_EMAIL // Send copy to sender (SMTP relay doesn't save to Sent folder)
        };

        const result = await smtpTransporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully (${emailType}):`, { messageId: result.messageId, to: toEmail });

        // Store order info for future review requests (only for customer emails)
        if (emailType === 'customer' && orderData.orderNumber) {
            const existingOrder = ordersStore.find(o => o.orderNumber === orderData.orderNumber);
            if (!existingOrder) {
                const orderInfo = {
                    orderNumber: orderData.orderNumber,
                    trackingCode: orderData.sendit?.trackingCode || orderData.trackingCode || null,
                    customerEmail: orderData.customer?.email,
                    customerName: `${orderData.customer?.firstName || ''} ${orderData.customer?.lastName || ''}`.trim() || 'Valued Customer',
                    customerPhone: orderData.customer?.phone,
                    productName: orderData.items?.[0]?.name || 'StoreName',
                    productImage: orderData.items?.[0]?.image || '',
                    totalAmount: orderData.totals?.grandTotal,
                    createdAt: new Date().toISOString()
                };
                ordersStore.push(orderInfo);
                await saveOrders(ordersStore);
                console.log(`📦 Order ${orderData.orderNumber} stored for review tracking`);
            }
        }

        clearTimeout(timeout);
        return res.status(200).json({ success: true, messageId: result.messageId, to: toEmail });

    } catch (error) {
        clearTimeout(timeout);
        console.error('Email sending error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error.message
        });
    }
});

// ============================================
// Email HTML Generators (Full Version from Vercel)
// ============================================

function generateCustomerEmail(orderData, lang = 'en') {
    const t = (key, ...args) => getEmailT(lang, 'customer', key, ...args);
    const isRTL = lang === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const borderSide = isRTL ? 'border-right' : 'border-left';
    const paddingSide = isRTL ? 'padding-right' : 'padding-left';

    // Check if order contains Atlas Star cap for express delivery
    const hasAtlasStar = orderData.items && orderData.items.some(item => {
        const itemId = item.originalId || item.id || '';
        const itemName = (item.name || '').toLowerCase();
        return itemId.includes('atlas-star') || itemName.includes('atlas star') || itemName.includes('atlas-star');
    });

    // Determine payment method
    const paymentMethod = orderData.payment?.method?.toLowerCase() || 'cod';
    const fundingSource = orderData.payment?.details?.fundingSource?.toLowerCase() || '';
    // Check for all COD variations: 'cod', 'cash_on_delivery', 'cash on delivery'
    const isCOD = paymentMethod === 'cod' || paymentMethod === 'cash_on_delivery' || paymentMethod === 'cash on delivery';
    // Check for PayPal/Credit Card - only if NOT COD and has payment details
    const isPayPal = !isCOD && (paymentMethod === 'paypal' || paymentMethod === 'credit_card');
    // Determine specific payment type (credit card vs PayPal account)
    const isCreditCard = fundingSource === 'card' || fundingSource === 'credit_card';
    const isPayPalAccount = fundingSource === 'paypal' || fundingSource === 'paypal_account';
    // Get appropriate payment label
    const getPaymentLabel = () => {
        if (isCreditCard) return t('creditCardPayment');
        if (isPayPalAccount) return t('paypalAccountPayment');
        return t('paypalPayment'); // default for PayPal
    };

    const itemsHtml = orderData.items.map(item => {
        const itemPrice = typeof item.price === 'string' ? parseFloat(item.price.replace(' MAD', '').replace(/,/g, '')) : item.price;
        const itemTotal = itemPrice * item.quantity;
        const imageUrl = item.image ? (item.image.startsWith('http') ? item.image : `https://www.your-domain.com${item.image.startsWith('/') ? item.image : '/' + item.image}`) : null;

        return `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                ${imageUrl ? `
                <div style="display: flex; align-items: center; gap: 12px; flex-direction: ${isRTL ? 'row-reverse' : 'row'};">
                    <img src="${imageUrl}" alt="${escapeHtml(item.name)}" class="email-image" style="width: 80px; height: 80px; object-fit: cover; border-radius: 6px; border: 1px solid #e0e0e0; max-width: 80px;" />
                    <div style="text-align: ${textAlign};">
                        <strong>${escapeHtml(item.name)}</strong>
                        ${item.size ? `<br><span style="color: #666; font-size: 0.9em;">${t('size')}: ${escapeHtml(item.size)}</span>` : ''}
                        ${item.variation ? `<br><span style="color: #666; font-size: 0.9em;">${t('variation')}: ${escapeHtml(item.variation)}</span>` : ''}
                    </div>
                </div>
                ` : `
                <div style="text-align: ${textAlign};">
                    <strong>${escapeHtml(item.name)}</strong>
                    ${item.size ? `<br><span style="color: #666; font-size: 0.9em;">${t('size')}: ${escapeHtml(item.size)}</span>` : ''}
                    ${item.variation ? `<br><span style="color: #666; font-size: 0.9em;">${t('variation')}: ${escapeHtml(item.variation)}</span>` : ''}
                </div>
                `}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center; vertical-align: middle;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: ${isRTL ? 'left' : 'right'}; vertical-align: middle;">${formatPrice(itemPrice)} MAD</td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: ${isRTL ? 'left' : 'right'}; font-weight: 600; vertical-align: middle;">${formatPrice(itemTotal)} MAD</td>
        </tr>
    `;
    }).join('');

    const trackingSection = orderData.sendit && orderData.sendit.trackingCode ? `
        <div style="background: linear-gradient(135deg, rgba(0, 98, 51, 0.05), rgba(200, 16, 46, 0.05)); padding: 20px; border-radius: 8px; margin: 20px 0; ${borderSide}: 4px solid #006233;">
            <h3 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 1.1rem; text-align: ${textAlign}; direction: ${dir};">${t('trackingInformation')}</h3>
            <p style="margin: 0; color: #666; text-align: ${textAlign}; direction: ${dir};">
                <strong>${t('trackingCode')}:</strong> <span style="color: #C8102E; font-family: 'Playfair Display', serif; font-size: 1.1rem; letter-spacing: 1px;">${escapeHtml(orderData.sendit.trackingCode)}</span>
            </p>
            <p style="margin: 10px 0 0 0; text-align: ${textAlign};">
                <a href="https://www.your-domain.com/track-order.html?code=${encodeURIComponent(orderData.sendit.trackingCode)}" 
                   style="display: inline-block; padding: 10px 20px; background: #C8102E; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 10px;">
                    ${t('trackYourOrder')}
                </a>
            </p>
        </div>
    ` : '';

    const preheaderText = t('preheader', orderData.orderNumber);

    return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="format-detection" content="telephone=no">
    <title>${t('orderConfirmation')} - StoreName</title>
    <style>
        /* Preheader - hidden text for email preview */
        .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; max-height: 0; max-width: 0; overflow: hidden; mso-hide: all; }
        
        /* Base responsive styles */
        * { box-sizing: border-box; }
        
        /* Tablet - 600px and below */
        @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; max-width: 100% !important; margin: 0 !important; }
            .email-content { padding: 24px 16px !important; }
            .email-header { padding: 24px 16px !important; }
            .email-header h1 { font-size: 1.5rem !important; line-height: 1.3 !important; }
            .email-table { font-size: 14px !important; }
            .email-table th, .email-table td { padding: 10px 8px !important; }
            .email-image { width: 60px !important; height: 60px !important; max-width: 60px !important; }
            .email-button { padding: 14px 20px !important; font-size: 14px !important; display: block !important; text-align: center !important; }
            .email-section { padding: 16px !important; margin: 16px 0 !important; }
            .email-amount { font-size: 1.5rem !important; }
            h2 { font-size: 1.1rem !important; }
            h3 { font-size: 1rem !important; }
        }
        
        /* Large mobile - 480px and below */
        @media only screen and (max-width: 480px) {
            .email-content { padding: 20px 12px !important; }
            .email-header { padding: 20px 12px !important; }
            .email-header h1 { font-size: 1.35rem !important; }
            .email-table { font-size: 13px !important; }
            .email-table th, .email-table td { padding: 8px 6px !important; }
            .email-image { width: 50px !important; height: 50px !important; max-width: 50px !important; }
            .email-section { padding: 14px !important; }
            .email-amount { font-size: 1.35rem !important; }
            .email-list li { margin: 10px 0 !important; font-size: 14px !important; }
        }
        
        /* Small mobile - 375px and below */
        @media only screen and (max-width: 375px) {
            .email-content { padding: 16px 10px !important; }
            .email-header { padding: 16px 10px !important; }
            .email-header h1 { font-size: 1.2rem !important; }
            .email-table { font-size: 12px !important; }
            .email-table th, .email-table td { padding: 6px 4px !important; }
            .email-image { width: 45px !important; height: 45px !important; max-width: 45px !important; }
            .email-section { padding: 12px !important; border-radius: 6px !important; }
            .email-amount { font-size: 1.25rem !important; }
            .email-button { padding: 12px 16px !important; font-size: 13px !important; }
            p { font-size: 14px !important; line-height: 1.5 !important; }
        }
        
        /* Extra small - 320px and below */
        @media only screen and (max-width: 320px) {
            .email-content { padding: 12px 8px !important; }
            .email-header { padding: 12px 8px !important; }
            .email-header h1 { font-size: 1.1rem !important; }
            .email-table { font-size: 11px !important; }
            .email-table th, .email-table td { padding: 5px 3px !important; }
            .email-image { width: 40px !important; height: 40px !important; max-width: 40px !important; }
            .email-section { padding: 10px !important; }
            .email-amount { font-size: 1.1rem !important; }
            .email-list li { font-size: 13px !important; }
        }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: ${isRTL ? "'Cairo', 'Arial', sans-serif" : "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"}; background-color: #f8f9fa; line-height: 1.6; direction: ${dir};">
    <div class="preheader">${preheaderText}</div>
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; padding: 20px 0;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table role="presentation" class="email-container" style="max-width: 600px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td class="email-header" style="background: linear-gradient(135deg, #C8102E 0%, #006233 100%); padding: 30px 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700;">
                                ${t('orderConfirmed')}
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td class="email-content" style="padding: 30px 20px;">
                            <p style="color: #1a1a1a; font-size: 1rem; margin: 0 0 20px 0; text-align: ${textAlign}; direction: ${dir};">
                                ${t('greeting', orderData.customer.firstName, orderData.customer.lastName)}
                            </p>
                            
                            <p style="color: #1a1a1a; font-size: 1rem; margin: 0 0 20px 0; text-align: ${textAlign}; direction: ${dir};">
                                ${isCOD ? t('thankYouCOD') : t('thankYou')}
                            </p>
                            
                            <!-- Order Number -->
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0; ${borderSide}: 3px solid #C8102E;">
                                <p style="margin: 0; color: #666; font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.5px; text-align: ${textAlign}; direction: ${dir};">${t('orderNumber')}</p>
                                <p style="margin: 5px 0 0 0; color: #1a1a1a; font-size: 1.5rem; font-weight: 700; font-family: 'Playfair Display', serif; text-align: ${textAlign}; direction: ${dir};">${escapeHtml(orderData.orderNumber)}</p>
                            </div>
                            
                            ${trackingSection}
                            
                            <!-- Order Items -->
                            <h2 style="color: #1a1a1a; font-size: 1.25rem; margin: 30px 0 15px 0; font-family: 'Playfair Display', serif; text-align: ${textAlign}; direction: ${dir};">${t('orderDetails')}</h2>
                            <table role="presentation" class="email-table" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                <thead>
                                    <tr style="background: #f8f9fa;">
                                        <th style="padding: 12px; text-align: ${textAlign}; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600; direction: ${dir};">${t('item')}</th>
                                        <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">${t('quantity')}</th>
                                        <th style="padding: 12px; text-align: ${isRTL ? 'left' : 'right'}; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">${t('price')}</th>
                                        <th style="padding: 12px; text-align: ${isRTL ? 'left' : 'right'}; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">${t('total')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>
                            
                            <!-- Order Summary -->
                            <table role="presentation" style="width: 100%; margin: 20px 0;">
                                <tr>
                                    <td style="padding: 8px 0; color: #666; text-align: ${textAlign}; direction: ${dir};">${t('subtotal')}:</td>
                                    <td style="padding: 8px 0; text-align: ${isRTL ? 'left' : 'right'}; color: #1a1a1a; font-weight: 600;">${formatPrice(orderData.subtotal || orderData.total || 0)} MAD</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666; text-align: ${textAlign}; direction: ${dir};">${t('shipping')}:</td>
                                    <td style="padding: 8px 0; text-align: ${isRTL ? 'left' : 'right'}; color: #006233; font-weight: 600;">${t('free')}</td>
                                </tr>
                                <tr style="border-top: 2px solid #e0e0e0;">
                                    <td style="padding: 12px 0; color: #1a1a1a; font-size: 1.1rem; font-weight: 700; text-align: ${textAlign}; direction: ${dir};">${t('totalLabel')}:</td>
                                    <td style="padding: 12px 0; text-align: ${isRTL ? 'left' : 'right'}; color: #C8102E; font-size: 1.25rem; font-weight: 700; font-family: 'Playfair Display', serif;">${formatPrice(orderData.total || orderData.subtotal || 0)} MAD</td>
                                </tr>
                            </table>
                            
                            <!-- Shipping Information -->
                            <h2 style="color: #1a1a1a; font-size: 1.25rem; margin: 30px 0 15px 0; font-family: 'Playfair Display', serif; text-align: ${textAlign}; direction: ${dir};">${t('shippingAddress')}</h2>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
                                <p style="margin: 5px 0; color: #1a1a1a; text-align: ${textAlign}; direction: ${dir};">
                                    <strong>${escapeHtml(orderData.customer.firstName)} ${escapeHtml(orderData.customer.lastName)}</strong><br>
                                    ${escapeHtml(orderData.shipping.address)}<br>
                                    ${orderData.shipping.landmark ? escapeHtml(orderData.shipping.landmark) + '<br>' : ''}
                                    ${orderData.shipping.postalCode ? escapeHtml(orderData.shipping.postalCode) + '<br>' : ''}
                                    ${escapeHtml(orderData.shipping.country || 'Morocco')}
                                </p>
                                <p style="margin: 10px 0 5px 0; color: #1a1a1a; text-align: ${textAlign}; direction: ${dir};">
                                    <strong>${t('phone')}:</strong> ${escapeHtml(orderData.customer.phone)}
                                </p>
                            </div>
                            
                            <!-- Payment Information Section -->
                            ${isCOD ? `
                            <div class="email-section" style="background: linear-gradient(135deg, rgba(255, 193, 7, 0.1), rgba(255, 152, 0, 0.1)); padding: 20px; border-radius: 8px; margin: 24px 0; ${borderSide}: 4px solid #ff9800;">
                                <h3 style="color: #e65100; margin: 0 0 12px 0; font-size: 1.1rem; text-align: ${textAlign}; direction: ${dir};">💰 ${t('codInstructions')}</h3>
                                <p style="margin: 0 0 16px 0; color: #555; text-align: ${textAlign}; direction: ${dir}; line-height: 1.6;">
                                    ${t('codMessage')}
                                </p>
                                <div style="background: #fff3e0; padding: 16px; border-radius: 6px; text-align: center;">
                                    <p style="margin: 0; color: #666; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px;">${t('codAmountDue')}</p>
                                    <p class="email-amount" style="margin: 8px 0 0 0; color: #e65100; font-size: 1.75rem; font-weight: 700; font-family: 'Playfair Display', Georgia, serif;">${formatPrice(orderData.total || orderData.subtotal || 0)} MAD</p>
                                </div>
                            </div>
                            ` : `
                            <div class="email-section" style="background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(46, 125, 50, 0.1)); padding: 20px; border-radius: 8px; margin: 24px 0; ${borderSide}: 4px solid #4caf50;">
                                <h3 style="color: #2e7d32; margin: 0 0 12px 0; font-size: 1.1rem; text-align: ${textAlign}; direction: ${dir};">${isCreditCard ? '💳' : '✅'} ${t('paymentMethod')}: ${getPaymentLabel()}</h3>
                                <p style="margin: 0 0 10px 0; color: #555; text-align: ${textAlign}; direction: ${dir}; line-height: 1.6;">
                                    ${t('paypalThankYou')}
                                </p>
                                ${orderData.payment?.details?.transactionId ? `
                                <p style="margin: 8px 0; color: #666; font-size: 0.85rem; text-align: ${textAlign}; direction: ${dir}; word-break: break-all;">
                                    <strong>${t('paypalTransactionId')}:</strong> ${escapeHtml(orderData.payment.details.transactionId)}
                                </p>
                                ` : ''}
                                ${orderData.payment?.details?.paypalOrderId ? `
                                <p style="margin: 8px 0; color: #666; font-size: 0.85rem; text-align: ${textAlign}; direction: ${dir}; word-break: break-all;">
                                    <strong>${t('paypalOrderId')}:</strong> ${escapeHtml(orderData.payment.details.paypalOrderId)}
                                </p>
                                ` : ''}
                            </div>
                            `}
                            
                            <!-- Next Steps -->
                            <div class="email-section" style="background: linear-gradient(135deg, rgba(0, 98, 51, 0.05), rgba(200, 16, 46, 0.05)); padding: 20px; border-radius: 8px; margin: 24px 0;">
                                <h3 style="color: #1a1a1a; margin: 0 0 16px 0; font-size: 1.1rem; text-align: ${textAlign}; direction: ${dir};">${t('whatHappensNext')}</h3>
                                ${isCOD ? `
                                <ul class="email-list" style="margin: 0; ${paddingSide}: 20px; color: #555; text-align: ${textAlign}; direction: ${dir}; line-height: 1.7;">
                                    <li style="margin: 10px 0;">📦 ${t('codStep1')}</li>
                                    <li style="margin: 10px 0;">📞 ${t('codStep2')}</li>
                                    <li style="margin: 10px 0;">🚚 ${t('codStep3')}</li>
                                    <li style="margin: 10px 0;">💵 ${t('codStep4')}</li>
                                </ul>
                                ` : `
                                <ul class="email-list" style="margin: 0; ${paddingSide}: 20px; color: #555; text-align: ${textAlign}; direction: ${dir}; line-height: 1.7;">
                                    <li style="margin: 10px 0;">✅ ${t('paymentConfirmed')}</li>
                                    <li style="margin: 10px 0;">📦 ${t('preparing')}</li>
                                    <li style="margin: 10px 0;">🚚 ${t('shippingWithTracking')}</li>
                                    <li style="margin: 10px 0; ${hasAtlasStar ? 'color: #006233; font-weight: 600;' : ''}">${hasAtlasStar ? t('deliveryTimeExpress') : '📬 ' + t('deliveryTime')}</li>
                                </ul>
                                `}
                            </div>
                            
                            <!-- Contact Info -->
                            <div style="text-align: center; margin: 30px 0 0 0; padding: 16px; background: #f8f9fa; border-radius: 6px;">
                                <p style="color: #555; font-size: 0.9rem; margin: 0 0 8px 0; direction: ${dir};">
                                    ${t('questions')}
                                </p>
                                <p style="margin: 0; direction: ${dir};">
                                    <a href="mailto:info@your-domain.com" style="color: #C8102E; text-decoration: none; font-weight: 500;">info@your-domain.com</a>
                                    <span style="color: #999; margin: 0 8px;">${t('or')}</span>
                                    <a href="tel:+212602432539" style="color: #C8102E; text-decoration: none; font-weight: 500;">+212 667-951100</a>
                                </p>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 20px; text-align: center;">
                            <p style="color: #ffffff; margin: 0; font-size: 0.875rem; direction: ${dir};">
                                <strong>StoreName</strong> - ${t('footer')}
                            </p>
                            <p style="color: #999; margin: 10px 0 0 0; font-size: 0.75rem; direction: ${dir};">
                                ${t('copyright', new Date().getFullYear())}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

function generateAdminEmail(orderData) {
    const itemsHtml = orderData.items.map(item => `
        <tr>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0;">
                <strong>${escapeHtml(item.name)}</strong>
                ${item.size ? `<br><span style="color: #666; font-size: 0.9em;">Size: ${escapeHtml(item.size)}</span>` : ''}
                ${item.variation ? `<br><span style="color: #666; font-size: 0.9em;">Variation: ${escapeHtml(item.variation)}</span>` : ''}
            </td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: center;">${item.quantity}</td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right;">${formatPrice(item.price)} MAD</td>
            <td style="padding: 12px; border-bottom: 1px solid #e0e0e0; text-align: right; font-weight: 600;">${formatPrice(item.price * item.quantity)} MAD</td>
        </tr>
    `).join('');

    const trackingSection = orderData.sendit && orderData.sendit.trackingCode ? `
        <div style="background: #f0f8ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #006233;">
            <p style="margin: 0; color: #1a1a1a;">
                <strong>Sendit Tracking Code:</strong> ${escapeHtml(orderData.sendit.trackingCode)}<br>
                <strong>Sendit Delivery Code:</strong> ${escapeHtml(orderData.sendit.deliveryCode || 'N/A')}
            </p>
        </div>
    ` : `
        <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #ffc107;">
            <p style="margin: 0; color: #856404;">
                <strong>No Sendit tracking available</strong> - Delivery may need to be created manually
            </p>
        </div>
    `;

    const paymentDetails = orderData.payment && orderData.payment.details ? `
        <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
            <h3 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 1rem;">Payment Details</h3>
            <p style="margin: 5px 0; color: #666; font-size: 0.9rem;">
                <strong>Method:</strong> ${escapeHtml(orderData.payment.method.toUpperCase())}<br>
                ${orderData.payment.details.paypalOrderId ? `<strong>PayPal Order ID:</strong> ${escapeHtml(orderData.payment.details.paypalOrderId)}<br>` : ''}
                ${orderData.payment.details.transactionId ? `<strong>Transaction ID:</strong> ${escapeHtml(orderData.payment.details.transactionId)}<br>` : ''}
                ${orderData.payment.details.paypalEmail ? `<strong>PayPal Email:</strong> ${escapeHtml(orderData.payment.details.paypalEmail)}` : ''}
            </p>
        </div>
    ` : '';

    const preheaderText = `New order ${orderData.orderNumber} received - Action required.`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="format-detection" content="telephone=no">
    <title>New Order - StoreName</title>
    <style>
        .preheader { display: none !important; visibility: hidden; opacity: 0; color: transparent; height: 0; width: 0; }
    </style>
</head>
<body style="margin: 0; padding: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background-color: #f8f9fa; line-height: 1.6;">
    <div class="preheader">${preheaderText}</div>
    <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8f9fa; padding: 20px 0;">
        <tr>
            <td align="center" style="padding: 20px 0;">
                <table role="presentation" style="max-width: 700px; width: 100%; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #C8102E 0%, #006233 100%); padding: 30px 20px; text-align: center;">
                            <h1 style="color: #ffffff; margin: 0; font-family: 'Playfair Display', serif; font-size: 2rem; font-weight: 700;">
                                New Order Received
                            </h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 30px 20px;">
                            <div style="background: #fff3cd; padding: 15px; border-radius: 6px; margin: 0 0 20px 0; border-left: 4px solid #ffc107;">
                                <p style="margin: 0; color: #856404; font-weight: 600; font-size: 1.1rem;">
                                    Order Number: <span style="color: #C8102E; font-family: 'Playfair Display', serif;">${escapeHtml(orderData.orderNumber)}</span>
                                </p>
                                <p style="margin: 5px 0 0 0; color: #856404; font-size: 0.9rem;">
                                    Date: ${new Date(orderData.timestamp || Date.now()).toLocaleString()}
                                </p>
                            </div>
                            
                            ${trackingSection}
                            
                            <!-- Customer Information -->
                            <h2 style="color: #1a1a1a; font-size: 1.25rem; margin: 25px 0 15px 0; font-family: 'Playfair Display', serif;">Customer Information</h2>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
                                <p style="margin: 5px 0; color: #1a1a1a;">
                                    <strong>Name:</strong> ${escapeHtml(orderData.customer.firstName)} ${escapeHtml(orderData.customer.lastName)}<br>
                                    <strong>Email:</strong> <a href="mailto:${escapeHtml(orderData.customer.email)}" style="color: #C8102E; text-decoration: none;">${escapeHtml(orderData.customer.email)}</a><br>
                                    <strong>Phone:</strong> <a href="tel:${escapeHtml(orderData.customer.phone)}" style="color: #C8102E; text-decoration: none;">${escapeHtml(orderData.customer.phone)}</a>
                                </p>
                            </div>
                            
                            ${paymentDetails}
                            
                            <!-- Order Items -->
                            <h2 style="color: #1a1a1a; font-size: 1.25rem; margin: 25px 0 15px 0; font-family: 'Playfair Display', serif;">Order Items</h2>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                                <thead>
                                    <tr style="background: #f8f9fa;">
                                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">Item</th>
                                        <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">Qty</th>
                                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">Price</th>
                                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #e0e0e0; color: #1a1a1a; font-weight: 600;">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${itemsHtml}
                                </tbody>
                            </table>
                            
                            <!-- Order Summary -->
                            <table role="presentation" style="width: 100%; margin: 20px 0;">
                                <tr>
                                    <td style="padding: 8px 0; color: #666;">Subtotal:</td>
                                    <td style="padding: 8px 0; text-align: right; color: #1a1a1a; font-weight: 600;">${formatPrice(orderData.subtotal || orderData.total || 0)} MAD</td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #666;">Shipping:</td>
                                    <td style="padding: 8px 0; text-align: right; color: #006233; font-weight: 600;">Free</td>
                                </tr>
                                <tr style="border-top: 2px solid #e0e0e0;">
                                    <td style="padding: 12px 0; color: #1a1a1a; font-size: 1.1rem; font-weight: 700;">Total:</td>
                                    <td style="padding: 12px 0; text-align: right; color: #C8102E; font-size: 1.25rem; font-weight: 700; font-family: 'Playfair Display', serif;">${formatPrice(orderData.total || orderData.subtotal || 0)} MAD</td>
                                </tr>
                            </table>
                            
                            <!-- Shipping Information -->
                            <h2 style="color: #1a1a1a; font-size: 1.25rem; margin: 25px 0 15px 0; font-family: 'Playfair Display', serif;">Shipping Address</h2>
                            <div style="background: #f8f9fa; padding: 15px; border-radius: 6px; margin: 15px 0;">
                                <p style="margin: 5px 0; color: #1a1a1a;">
                                    ${escapeHtml(orderData.customer.firstName)} ${escapeHtml(orderData.customer.lastName)}<br>
                                    ${escapeHtml(orderData.shipping.address)}<br>
                                    ${orderData.shipping.landmark ? escapeHtml(orderData.shipping.landmark) + '<br>' : ''}
                                    ${orderData.shipping.postalCode ? escapeHtml(orderData.shipping.postalCode) + '<br>' : ''}
                                    ${escapeHtml(orderData.shipping.country || 'Morocco')}
                                    ${orderData.shipping.districtId ? `<br><strong>District ID:</strong> ${escapeHtml(orderData.shipping.districtId)}` : ''}
                                </p>
                            </div>
                            
                            ${orderData.shipping.notes ? `
                            <div style="background: #e7f3ff; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #2D9CDB;">
                                <h3 style="color: #1a1a1a; margin: 0 0 10px 0; font-size: 1rem;">Customer Notes</h3>
                                <p style="margin: 0; color: #666; font-style: italic;">${escapeHtml(orderData.shipping.notes)}</p>
                            </div>
                            ` : ''}
                            
                            <!-- Action Required -->
                            <div style="background: linear-gradient(135deg, rgba(200, 16, 46, 0.1), rgba(0, 98, 51, 0.1)); padding: 20px; border-radius: 8px; margin: 30px 0; border: 2px solid #C8102E;">
                                <h3 style="color: #C8102E; margin: 0 0 10px 0; font-size: 1.1rem;">Action Required</h3>
                                <ul style="margin: 0; padding-left: 20px; color: #1a1a1a;">
                                    <li style="margin: 8px 0;">Prepare and package the order items</li>
                                    <li style="margin: 8px 0;">${orderData.sendit && orderData.sendit.trackingCode ? 'Sendit delivery already created - use tracking code for shipping' : 'Create Sendit delivery if not already done'}</li>
                                    <li style="margin: 8px 0;">Ship within 1-2 business days</li>
                                </ul>
                            </div>
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background: #1a1a1a; padding: 20px; text-align: center;">
                            <p style="color: #ffffff; margin: 0; font-size: 0.875rem;">
                                <strong>StoreName</strong> - Order Management System
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
    `;
}

// Helper functions
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatPrice(price) {
    if (!price && price !== 0) {
        return '0.00';
    }
    if (typeof price === 'string') {
        price = price.replace(' MAD', '').replace(/,/g, '').trim();
        price = parseFloat(price);
    }
    if (isNaN(price)) {
        console.error('Invalid price value:', price);
        return '0.00';
    }
    return new Intl.NumberFormat('fr-MA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(price);
}

// Generate plain text version of customer email
function generateCustomerEmailText(orderData, lang = 'en') {
    const t = (key, ...args) => getEmailT(lang, 'customer', key, ...args);

    // Check if order contains Atlas Star cap for express delivery
    const hasAtlasStar = orderData.items && orderData.items.some(item => {
        const itemId = item.originalId || item.id || '';
        const itemName = (item.name || '').toLowerCase();
        return itemId.includes('atlas-star') || itemName.includes('atlas star') || itemName.includes('atlas-star');
    });

    // Determine payment method
    const paymentMethod = orderData.payment?.method?.toLowerCase() || 'cod';
    const fundingSource = orderData.payment?.details?.fundingSource?.toLowerCase() || '';
    // Check for all COD variations: 'cod', 'cash_on_delivery', 'cash on delivery'
    const isCOD = paymentMethod === 'cod' || paymentMethod === 'cash_on_delivery' || paymentMethod === 'cash on delivery';
    // Determine specific payment type (credit card vs PayPal account)
    const isCreditCard = fundingSource === 'card' || fundingSource === 'credit_card';
    const isPayPalAccount = fundingSource === 'paypal' || fundingSource === 'paypal_account';
    // Get appropriate payment label
    const getPaymentLabel = () => {
        if (isCreditCard) return t('creditCardPayment');
        if (isPayPalAccount) return t('paypalAccountPayment');
        return t('paypalPayment'); // default for PayPal
    };

    const itemsText = orderData.items.map(item => {
        const sizeText = item.size ? ` (${t('size')}: ${item.size})` : '';
        const variationText = item.variation ? ` (${t('variation')}: ${item.variation})` : '';
        return `- ${item.name}${sizeText}${variationText} - ${t('quantity')}: ${item.quantity} - ${formatPrice(item.price)} MAD ${t('each')} - ${t('total')}: ${formatPrice(item.price * item.quantity)} MAD`;
    }).join('\n');

    const trackingText = orderData.sendit && orderData.sendit.trackingCode
        ? `\n\n${t('trackingInformation').toUpperCase()}\n${t('trackingCode')}: ${orderData.sendit.trackingCode}\n${t('trackYourOrder')}: https://www.your-domain.com/track-order.html?code=${encodeURIComponent(orderData.sendit.trackingCode)}\n`
        : '';

    // Payment information section
    const paymentInfoText = isCOD
        ? `\n${t('codInstructions').toUpperCase()}\n${t('codMessage')}\n${t('codAmountDue')}: ${formatPrice(orderData.total || orderData.subtotal || 0)} MAD\n`
        : `\n${t('paymentMethod').toUpperCase()}: ${getPaymentLabel()}\n${t('paypalThankYou')}\n${orderData.payment?.details?.transactionId ? `${t('paypalTransactionId')}: ${orderData.payment.details.transactionId}\n` : ''}${orderData.payment?.details?.paypalOrderId ? `${t('paypalOrderId')}: ${orderData.payment.details.paypalOrderId}\n` : ''}`;

    // Next steps based on payment method
    const deliveryTimeText = hasAtlasStar ? t('deliveryTimeExpress') : t('deliveryTime');
    const nextStepsText = isCOD
        ? `- ${t('codStep1')}\n- ${t('codStep2')}\n- ${t('codStep3')}\n- ${t('codStep4')}`
        : `- ${t('paymentConfirmed')}\n- ${t('preparing')}\n- ${t('shippingWithTracking')}\n- ${deliveryTimeText}`;

    return `${t('orderConfirmation')} - ${orderData.orderNumber}

${t('greeting', orderData.customer.firstName, orderData.customer.lastName)}

${isCOD ? t('thankYouCOD') : t('thankYou')}

${t('orderNumber').toUpperCase()}: ${orderData.orderNumber}
${trackingText}
${t('orderDetails').toUpperCase()}:
${itemsText}

${t('orderSummary').toUpperCase()}:
${t('subtotal')}: ${formatPrice(orderData.subtotal || orderData.total || 0)} MAD
${t('shipping')}: ${t('free')}
${t('totalLabel')}: ${formatPrice(orderData.total || orderData.subtotal || 0)} MAD
${paymentInfoText}
${t('shippingAddress').toUpperCase()}:
${orderData.customer.firstName} ${orderData.customer.lastName}
${orderData.shipping.address}
${orderData.shipping.landmark ? orderData.shipping.landmark + '\n' : ''}${orderData.shipping.postalCode ? orderData.shipping.postalCode + '\n' : ''}${orderData.shipping.country || 'Morocco'}

${t('phone')}: ${orderData.customer.phone}

${t('whatHappensNext').toUpperCase()}?
${nextStepsText}

${t('questions')} info@your-domain.com ${t('or')} +212 667-951100

---
${t('footer')}
${t('copyright', new Date().getFullYear())}`;
}

// Generate plain text version of admin email
function generateAdminEmailText(orderData) {
    const itemsText = orderData.items.map(item => {
        const itemPrice = typeof item.price === 'string' ? parseFloat(item.price.replace(' MAD', '').replace(/,/g, '')) : item.price;
        const itemTotal = itemPrice * item.quantity;
        return `- ${item.name}${item.size ? ` (Size: ${item.size})` : ''}${item.variation ? ` (${item.variation})` : ''} - Qty: ${item.quantity} - ${formatPrice(itemPrice)} MAD each - Total: ${formatPrice(itemTotal)} MAD`;
    }).join('\n');

    const trackingText = orderData.sendit && orderData.sendit.trackingCode
        ? `Sendit Tracking Code: ${orderData.sendit.trackingCode}\nSendit Delivery Code: ${orderData.sendit.deliveryCode || 'N/A'}\n`
        : '⚠️ No Sendit tracking available - Delivery may need to be created manually\n';

    const paymentText = orderData.payment && orderData.payment.details
        ? `Payment Method: ${orderData.payment.method.toUpperCase()}\n${orderData.payment.details.paypalOrderId ? `PayPal Order ID: ${orderData.payment.details.paypalOrderId}\n` : ''}${orderData.payment.details.transactionId ? `Transaction ID: ${orderData.payment.details.transactionId}\n` : ''}${orderData.payment.details.paypalEmail ? `PayPal Email: ${orderData.payment.details.paypalEmail}\n` : ''}`
        : '';

    return `New Order Received - ${orderData.orderNumber}

Order Number: ${orderData.orderNumber}
Date: ${new Date(orderData.timestamp || Date.now()).toLocaleString()}

${trackingText}
CUSTOMER INFORMATION:
Name: ${orderData.customer.firstName} ${orderData.customer.lastName}
Email: ${orderData.customer.email}
Phone: ${orderData.customer.phone}

${paymentText}
ORDER ITEMS:
${itemsText}

ORDER SUMMARY:
Subtotal: ${formatPrice(orderData.subtotal || orderData.total || 0)} MAD
Shipping: Free
Total: ${formatPrice(orderData.total || orderData.subtotal || 0)} MAD

SHIPPING ADDRESS:
${orderData.customer.firstName} ${orderData.customer.lastName}
${orderData.shipping.address}
${orderData.shipping.landmark ? orderData.shipping.landmark + '\n' : ''}${orderData.shipping.postalCode ? orderData.shipping.postalCode + '\n' : ''}${orderData.shipping.country || 'Morocco'}
${orderData.shipping.districtId ? `District ID: ${orderData.shipping.districtId}` : ''}

${orderData.shipping.notes ? `CUSTOMER NOTES:\n${orderData.shipping.notes}\n` : ''}
ACTION REQUIRED:
- Prepare and package the order items
- ${orderData.sendit && orderData.sendit.trackingCode ? 'Sendit delivery already created - use tracking code for shipping' : 'Create Sendit delivery if not already done'}
- Ship within 1-2 business days

---
StoreName - Order Management System`;
}

// ============================================
// Custom Analytics System
// ============================================
import analytics from './analytics-collector.js';

// Analytics middleware - track all requests
app.use(analytics.analyticsMiddleware);

// Dashboard access password (set in .env or use default)
const ANALYTICS_PASSWORD = process.env.ANALYTICS_PASSWORD || 'storename-admin-2026';

// Verify analytics access
function verifyAnalyticsAccess(req, res, next) {
    const auth = req.headers.authorization;
    const queryPassword = req.query.password;

    if (auth === `Bearer ${ANALYTICS_PASSWORD}` || queryPassword === ANALYTICS_PASSWORD) {
        return next();
    }

    res.status(401).json({ error: 'Unauthorized', message: 'Valid password required' });
}

// ============================================
// Reviews System
// ============================================

// NOTE: fs, path, and url imports are at top of file
// Using __dirname_module for consistency

// Persistent storage paths
const REVIEWS_FILE = join(__dirname_module, 'data', 'reviews.json');
const REVIEW_REQUESTS_FILE = join(__dirname_module, 'data', 'review-requests.json');
const ORDERS_FILE = join(__dirname_module, 'data', 'orders.json');

// Ensure data directory exists
// Ensure data directory exists
const dataDir = join(__dirname_module, 'data');
if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
}

// Database Connection
let db;
async function initDb() {
    db = await open({
        filename: join(dataDir, 'storename.db'),
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS orders (
            orderNumber TEXT PRIMARY KEY,
            trackingCode TEXT,
            customerEmail TEXT,
            reviewRequestSent INTEGER DEFAULT 0,
            data JSON
        );
        CREATE INDEX IF NOT EXISTS idx_tracking ON orders(trackingCode);

        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            orderNumber TEXT,
            rating INTEGER,
            status TEXT,
            data JSON
        );

        CREATE TABLE IF NOT EXISTS review_requests (
            orderNumber TEXT PRIMARY KEY,
            sentAt DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    console.log('✅ SQLite Database initialized');
}

// Migration Logic (JSON -> SQLite)
async function migrateData() {
    try {
        // Check if migration is needed (empty orders table)
        const orderCount = await db.get('SELECT COUNT(*) as count FROM orders');
        if (orderCount.count > 0) return; // Already migrated/populated

        console.log('🔄 Starting migration from JSON to SQLite...');

        if (existsSync(ORDERS_FILE)) {
            const orders = JSON.parse(readFileSync(ORDERS_FILE, 'utf8'));
            const stmt = await db.prepare('INSERT OR IGNORE INTO orders (orderNumber, trackingCode, customerEmail, reviewRequestSent, data) VALUES (?, ?, ?, ?, ?)');
            for (const o of orders) {
                await stmt.run(
                    o.orderNumber || o.trackingCode, // Ensure PK
                    o.trackingCode,
                    o.customerEmail,
                    o.reviewRequestSent ? 1 : 0,
                    JSON.stringify(o)
                );
            }
            await stmt.finalize();
            console.log(`✅ Migrated ${orders.length} orders`);
        }

        if (existsSync(REVIEWS_FILE)) {
            const reviews = JSON.parse(readFileSync(REVIEWS_FILE, 'utf8'));
            const stmt = await db.prepare('INSERT OR IGNORE INTO reviews (id, orderNumber, rating, status, data) VALUES (?, ?, ?, ?, ?)');
            for (const r of reviews) {
                await stmt.run(r.id, r.orderNumber, r.rating, r.status, JSON.stringify(r));
            }
            await stmt.finalize();
            console.log(`✅ Migrated ${reviews.length} reviews`);
        }

        if (existsSync(REVIEW_REQUESTS_FILE)) {
            const requests = JSON.parse(readFileSync(REVIEW_REQUESTS_FILE, 'utf8'));
            const stmt = await db.prepare('INSERT OR IGNORE INTO review_requests (orderNumber) VALUES (?)');
            for (const req of requests) {
                await stmt.run(req);
            }
            await stmt.finalize();
            console.log(`✅ Migrated ${requests.length} review requests`);
        }

    } catch (error) {
        console.error('❌ Migration failed:', error);
    }
}

// Load data from DB to memory (Hybrid Approach for fast reads)
async function loadDataToMemory() {
    await initDb();
    await migrateData();

    try {
        console.log('🔍 DEBUG: loadDataToMemory started');
        const count = await db.get('SELECT count(*) as c FROM orders');
        console.log(`🔍 DEBUG: Orders table count: ${count?.c}`);

        // Load Orders
        // Removed 'status' from SELECT as it doesn't exist in the schema anymore (it's in JSON)
        const orders = await db.all('SELECT data FROM orders');
        console.log(`🔍 DEBUG: SELECT data returned ${orders.length} rows`);

        ordersStore.length = 0; // Clear existing
        orders.forEach(row => {
            if (row.data) {
                try {
                    const parsed = JSON.parse(row.data);
                    // Merge status from column if not present in JSON
                    if (row.status) parsed.status = row.status;
                    ordersStore.push(parsed);
                } catch (e) {
                    console.error('❌ JSON parse error for order row:', e.message);
                }
            } else {
                console.error('❌ Order row missing data column');
            }
        });
        console.log(`📦 Loaded ${ordersStore.length} orders from DB`);

        // Load Reviews
        const reviews = await db.all('SELECT data FROM reviews');
        reviewsStore.length = 0;
        reviews.forEach(row => reviewsStore.push(JSON.parse(row.data)));
        console.log(`⭐ Loaded ${reviewsStore.length} reviews from DB`);

        // Load Review Requests
        const requests = await db.all('SELECT orderNumber FROM review_requests');
        reviewRequestsSent.clear();
        requests.forEach(row => reviewRequestsSent.add(row.orderNumber));
        reviewRequestsSent.clear();
        requests.forEach(row => reviewRequestsSent.add(row.orderNumber));
        console.log(`📬 Loaded ${reviewRequestsSent.size} sent requests from DB`);

        // Helper to update memory cache (for Automation)
        const updateOrderCache = (order) => {
            if (!order || !order.orderNumber) return;
            const idx = ordersStore.findIndex(o => o.orderNumber === order.orderNumber);
            if (idx >= 0) {
                ordersStore[idx] = { ...ordersStore[idx], ...order };
            } else {
                ordersStore.push(order);
                // Maintain sort? The dashboard sorts anyway.
            }
            // Also update delivery map
            if (order.trackingCode) deliveryStatusCache.set(order.trackingCode, order.status);
        };

        // Start Automation Service
        initAutomation(db, sendReviewEmailInternal, updateOrderCache);

    } catch (e) {
        console.error('❌ loadDataToMemory CRASH:', e);
    }
}

// Legacy Load Functions (Replaced by loadDataToMemory)
function loadReviews() { return []; }
function loadReviewRequests() { return new Set(); }
function loadOrders() { return []; }

// Save reviews to file
// Save reviews to DB (and file as backup)
async function saveReviews(reviews) {
    try {
        const tempFile = `${REVIEWS_FILE}.tmp`;
        await writeFile(tempFile, JSON.stringify(reviews, null, 2), 'utf8');
        await rename(tempFile, REVIEWS_FILE);

        // SQLite Persist (Iterate and update - simple approach for now)
        // Ideally we pass specific review to save, but for backward compatibility:
        const stmt = await db.prepare('INSERT OR REPLACE INTO reviews (id, orderNumber, rating, status, data) VALUES (?, ?, ?, ?, ?)');
        for (const review of reviews) {
            await stmt.run(review.id, review.orderNumber, review.rating, review.status, JSON.stringify(review));
        }
        await stmt.finalize();
        console.log(`💾 Reviews synced to DB & Disk (${reviews.length} total)`);
    } catch (error) {
        console.error('Error saving reviews:', error);
    }
}



// Save review requests tracking to file
// Save review requests tracking to DB
async function saveReviewRequests(requests) {
    try {
        const tempFile = `${REVIEW_REQUESTS_FILE}.tmp`;
        await writeFile(tempFile, JSON.stringify([...requests]), 'utf8');
        await rename(tempFile, REVIEW_REQUESTS_FILE);

        const stmt = await db.prepare('INSERT OR IGNORE INTO review_requests (orderNumber) VALUES (?)');
        for (const req of requests) {
            await stmt.run(req);
        }
        await stmt.finalize();
    } catch (error) {
        console.error('Error saving review requests:', error);
    }
}



// Save orders to file
// Save orders to DB
async function saveOrders(orders) {
    try {
        const tempFile = `${ORDERS_FILE}.tmp`;
        await writeFile(tempFile, JSON.stringify(orders, null, 2), 'utf8');
        await rename(tempFile, ORDERS_FILE);

        const stmt = await db.prepare('INSERT OR REPLACE INTO orders (orderNumber, trackingCode, customerEmail, reviewRequestSent, data) VALUES (?, ?, ?, ?, ?)');
        for (const order of orders) {
            await stmt.run(
                order.orderNumber || order.trackingCode,
                order.trackingCode,
                order.customerEmail,
                order.reviewRequestSent ? 1 : 0,
                JSON.stringify(order)
            );
        }
        await stmt.finalize();
        console.log(`💾 Orders synced to DB & Disk (${orders.length} total)`);
    } catch (error) {
        console.error('Error saving orders:', error);
    }
}

// Get order by order number or tracking code
function getOrderByRef(ref) {
    return ordersStore.find(o => o.orderNumber === ref || o.trackingCode === ref);
}

// Persistent storage for reviews and orders
const reviewsStore = [];
const reviewRequestsSent = new Set();
const ordersStore = [];
const deliveryStatusCache = new Map(); // Track last known status for each order (memory only is fine)

// Initialize Data
// Initialize Data then start monitor
loadDataToMemory()
    .then(() => {
        console.log('✅ Data loaded, starting services...');
        startDeliveryMonitor();
    })
    .catch(console.error);

// ============================================
// SENDIT API CACHING (Performance Optimization)
// ============================================
const senditCache = {
    authToken: null,
    tokenExpiry: 0,
    deliveries: new Map(), // code -> { data, timestamp }
    allDeliveries: null,
    allDeliveriesTimestamp: 0
};
const SENDIT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache for delivery data
const SENDIT_LIST_CACHE_TTL = 2 * 60 * 1000; // 2 minutes for list data
const SENDIT_TOKEN_TTL = 55 * 60 * 1000; // Token refresh at 55 minutes

// Get cached Sendit auth token
async function getSenditToken() {
    const now = Date.now();
    if (senditCache.authToken && now < senditCache.tokenExpiry) {
        return senditCache.authToken;
    }

    const SENDIT_API_BASE = 'https://app.sendit.ma/api/v1';
    const SENDIT_PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || '9a8a46843e3b20b922f67690ff1f27e0';
    const SENDIT_SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';

    const loginResponse = await fetch(`${SENDIT_API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: SENDIT_PUBLIC_KEY, secret_key: SENDIT_SECRET_KEY })
    });
    const loginData = await loginResponse.json();

    if (loginData.success && loginData.data?.token) {
        senditCache.authToken = loginData.data.token;
        senditCache.tokenExpiry = now + SENDIT_TOKEN_TTL;
        return senditCache.authToken;
    }
    throw new Error('Failed to authenticate with Sendit');
}

// Get cached delivery details
async function getCachedDelivery(code) {
    const now = Date.now();
    const cached = senditCache.deliveries.get(code);

    if (cached && now - cached.timestamp < SENDIT_CACHE_TTL) {
        return cached.data;
    }

    // MOCK FOR TESTING: Force DELIVERED status for test tracking code
    if (code === 'TRACK-TEST-007') {
        return { status: 'DELIVERED', code: 'TRACK-TEST-007', mock: true };
    }

    const token = await getSenditToken();
    const response = await fetch(`https://app.sendit.ma/api/v1/deliveries/${code}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
    });
    const data = await response.json();

    if (data.success && data.data) {
        senditCache.deliveries.set(code, { data: data.data, timestamp: now });
        return data.data;
    }
    return null;
}


// Background job to check for delivered orders every 15 minutes
let reviewCheckInterval = null;

async function startDeliveryMonitor() {
    console.log('📦 Starting delivery status monitor...');

    // Send to already delivered orders immediately on startup
    console.log('📬 Checking for already delivered orders to send review requests...');
    setTimeout(() => {
        sendReviewsToDeliveredOrders();
        backfillStoredOrders();
    }, 5000);

    // Then check for new deliveries every 15 minutes
    reviewCheckInterval = setInterval(() => checkAndSendReviewRequests(), 15 * 60 * 1000);
}

// Backfill: Iterate through stored orders to check if they are delivered and need reviews
// Backfill: Iterate through stored orders to check if they are delivered and need reviews
async function backfillStoredOrders() {
    console.log('🔄 Backfilling reviews from local storage...');
    let sentCount = 0;
    let syncedCount = 0;

    for (const order of ordersStore) {
        if (!order.customerEmail) continue;

        const ref = order.orderNumber || order.trackingCode;
        if (!ref) continue;

        // SYNC FIX: If we know we sent it (from separate persistence), ensure order has the flag
        if (reviewRequestsSent.has(ref) && !order.reviewRequestSent) {
            const orderIndex = ordersStore.findIndex(o => o.orderNumber === ref || o.trackingCode === ref);
            if (orderIndex !== -1) {
                ordersStore[orderIndex].reviewRequestSent = true;
                ordersStore[orderIndex].reviewRequestSentAt = ordersStore[orderIndex].reviewRequestSentAt || new Date().toISOString();
                syncedCount++;
            }
        }

        // Skip if already sent (now checks both)
        if (reviewRequestsSent.has(ref) || order.reviewRequestSent) continue;

        // Get status
        let status = null;
        if (order.trackingCode) {
            try {
                const data = await getCachedDelivery(order.trackingCode);
                if (data) status = data.status;
            } catch (e) {
                console.error(`Status check failed for ${ref}`);
            }
        }

        // Case-insensitive check (supports both English 'DELIVERED' and French 'LIVRÉ')
        const statusUpper = status ? status.toUpperCase() : '';
        if (statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ') {
            const trackingCode = order.trackingCode;
            const customerName = order.customerName;
            const customerEmail = order.customerEmail;
            const productName = order.productName;
            const productImage = order.productImage;

            console.log(`📧 Backfill: Sending review request to ${customerEmail} for order ${ref}...`);

            try {
                // Use internal logic instead of fetch to avoid network race conditions
                const emailSent = await sendReviewEmailInternal({
                    customerName,
                    customerEmail,
                    orderNumber: ref,
                    trackingCode,
                    productName,
                    productImage,
                    language: 'fr'
                });

                if (emailSent) {
                    sentCount++;
                    console.log(`✅ Backfill: Sent for ${ref}`);

                    // Update order in store
                    const orderIndex = ordersStore.findIndex(o => o.orderNumber === ref || o.trackingCode === ref);
                    if (orderIndex !== -1) {
                        ordersStore[orderIndex].reviewRequestSent = true;
                        ordersStore[orderIndex].reviewRequestSentAt = new Date().toISOString();

                        // Update memory set too
                        reviewRequestsSent.add(ref);
                    }
                }

                // Rate limit protection
                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                console.error(`❌ Backfill error for ${ref}:`, err.message);
            }
        }
    }

    // Save once at the end if we made changes
    if (sentCount > 0 || syncedCount > 0) {
        await saveOrders(ordersStore);
        console.log(`💾 Saved orders store: ${sentCount} sent, ${syncedCount} synced`);
    }

    console.log(`🏁 Backfill complete: ${sentCount} requests sent`);
}

// Send review requests to ALL delivered orders (including already delivered ones)
async function sendReviewsToDeliveredOrders() {
    try {
        console.log('📬 Checking local orders for delivered status via Sendit API...');

        const SENDIT_API_BASE = 'https://app.sendit.ma/api/v1';
        const SENDIT_PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || '9a8a46843e3b20b922f67690ff1f27e0';
        const SENDIT_SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';

        // Login to Sendit
        const loginResponse = await fetch(`${SENDIT_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public_key: SENDIT_PUBLIC_KEY,
                secret_key: SENDIT_SECRET_KEY
            })
        });
        const loginData = await loginResponse.json();

        if (!loginData.success || !loginData.data?.token) {
            console.error('❌ Failed to login to Sendit');
            return { success: false, error: 'Login failed' };
        }

        const token = loginData.data.token;

        // Filter local orders that have email, tracking code, and haven't been sent
        const ordersToCheck = ordersStore.filter(order =>
            order.customerEmail &&
            order.trackingCode &&
            !order.reviewRequestSent &&
            !reviewRequestsSent.has(order.orderNumber)
        );

        console.log(`📦 Found ${ordersToCheck.length} local orders to check for DELIVERED status`);

        let sentCount = 0;
        let skippedCount = 0;
        let errorCount = 0;
        let notDeliveredCount = 0;

        for (const order of ordersToCheck) {
            const trackingCode = order.trackingCode;
            const orderRef = order.orderNumber;

            try {
                // Check status via Sendit API
                const statusResponse = await fetch(`${SENDIT_API_BASE}/deliveries/${trackingCode}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });
                const statusData = await statusResponse.json();

                if (!statusData.success || !statusData.data) {
                    console.log(`⚠️ Could not fetch status for ${trackingCode}`);
                    continue;
                }

                const status = statusData.data.status;
                const statusUpper = status ? status.toUpperCase() : '';

                // Check for both English (DELIVERED) and French (LIVRÉ) status
                const isDelivered = statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ';

                if (!isDelivered) {
                    notDeliveredCount++;
                    continue; // Skip non-delivered orders
                }

                // Order is DELIVERED - send review email
                console.log(`📧 Order ${orderRef} is DELIVERED - sending review request to ${order.customerEmail}...`);

                const response = await fetch(`http://localhost:${PORT}/send-review-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: order.customerName || 'Valued Customer',
                        customerEmail: order.customerEmail,
                        orderNumber: orderRef,
                        trackingCode,
                        productName: order.productName || 'StoreName',
                        productImage: order.productImage || '',
                        language: 'fr'
                    })
                });

                const result = await response.json();
                if (response.ok && result.success && !result.skipped) {
                    sentCount++;
                    console.log(`✅ Review request sent for ${orderRef}`);

                    // Mark order as sent in local store
                    order.reviewRequestSent = true;
                    saveOrders();
                } else if (result.skipped) {
                    skippedCount++;
                }

                // Small delay between API calls to avoid rate limiting
                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                errorCount++;
                console.error(`❌ Error processing order ${orderRef}:`, err.message);
            }
        }

        console.log(`📊 Review requests summary: ${sentCount} sent, ${skippedCount} skipped (already sent), ${notDeliveredCount} not delivered, ${errorCount} errors`);
        return { success: true, sent: sentCount, skipped: skippedCount, notDelivered: notDeliveredCount, errors: errorCount };

    } catch (error) {
        console.error('❌ Error in sendReviewsToDeliveredOrders:', error);
        return { success: false, error: error.message };
    }
}

async function checkAndSendReviewRequests() {
    try {
        console.log('🔄 Auto-checking for delivered orders...');

        const SENDIT_API_BASE = 'https://app.sendit.ma/api/v1';
        const SENDIT_PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || '9a8a46843e3b20b922f67690ff1f27e0';
        const SENDIT_SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';

        // Login to Sendit
        const loginResponse = await fetch(`${SENDIT_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public_key: SENDIT_PUBLIC_KEY,
                secret_key: SENDIT_SECRET_KEY
            })
        });
        const loginData = await loginResponse.json();

        if (!loginData.success || !loginData.data?.token) {
            console.error('❌ Failed to login to Sendit for delivery monitor');
            return;
        }

        const token = loginData.data.token;

        // Filter local orders that need checking: have email, tracking, and haven't received review email
        const ordersToCheck = ordersStore.filter(order =>
            order.customerEmail &&
            order.trackingCode &&
            !order.reviewRequestSent &&
            !reviewRequestsSent.has(order.orderNumber)
        );

        if (ordersToCheck.length === 0) {
            console.log('✓ No pending orders to check');
            return;
        }

        console.log(`📦 Checking ${ordersToCheck.length} pending orders using BULK FETCH optimized strategy...`);

        // OPTIMIZATION: Bulk Fetch recent deliveries instead of N calls
        const deliveryMap = new Map();
        const PAGES_TO_FETCH = 5; // Fetch last 500 deliveries (enough for recent active orders)

        for (let page = 1; page <= PAGES_TO_FETCH; page++) {
            try {
                const url = `${SENDIT_API_BASE}/deliveries?limit=100&page=${page}`;
                const res = await fetch(url, {
                    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' }
                });
                const json = await res.json();

                if (json.success && json.data) {
                    const items = Array.isArray(json.data) ? json.data : Object.values(json.data);
                    items.forEach(d => {
                        if (!d) return; // Skip null entries
                        // Map both Reference (OrderNum) and Code (Tracking)
                        const status = (d.status || '').toUpperCase();
                        if (d.code) deliveryMap.set(d.code, status);
                        if (d.reference) deliveryMap.set(d.reference, status);
                    });
                }
            } catch (e) {
                console.error(`⚠️ Failed to fetch delivery page ${page}:`, e.message);
            }
        }

        console.log(`🗺️ Built status map with ${deliveryMap.size} recent deliveries.`);

        let sentCount = 0;

        for (const order of ordersToCheck) {
            const trackingCode = order.trackingCode;

            // O(1) Lookup
            let statusUpper = deliveryMap.get(trackingCode);

            // Mock Fallback for testing
            if (order.orderNumber.startsWith('TEST-DELIVERED')) statusUpper = 'DELIVERED';

            if (!statusUpper) continue; // Not found in recent history (or not delivered yet)

            // Update cache
            deliveryStatusCache.set(trackingCode, statusUpper);

            // Check for both English (DELIVERED) and French (LIVRÉ) status
            const isDelivered = statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ';

            if (isDelivered) {
                console.log(`📧 Order ${order.orderNumber} is DELIVERED - sending review request...`);

                try {
                    const emailSent = await sendReviewEmailInternal({
                        customerName: order.customerName,
                        customerEmail: order.customerEmail,
                        orderNumber: order.orderNumber,
                        trackingCode,
                        productName: order.productName,
                        productImage: order.productImage,
                        language: 'fr'
                    });

                    if (emailSent) {
                        sentCount++;
                        // Update Store
                        const orderIndex = ordersStore.findIndex(o => o.orderNumber === order.orderNumber);
                        if (orderIndex !== -1) {
                            ordersStore[orderIndex].reviewRequestSent = true;
                            ordersStore[orderIndex].reviewRequestSentAt = new Date().toISOString();
                            reviewRequestsSent.add(order.orderNumber);
                        }

                        // Safety delay between sends
                        await new Promise(r => setTimeout(r, 2000));
                    }
                } catch (err) {
                    console.error(`❌ Failed to send review email for ${order.orderNumber}:`, err.message);
                }
            }
        }



        if (sentCount > 0) {
            console.log(`📧 Auto-sent ${sentCount} review request(s)`);
        } else {
            console.log('✓ No new delivered orders needing review requests');
        }

    } catch (error) {
        console.error('❌ Delivery monitor error:', error.message);
    }
}

// Start the monitor when server starts
// Start the monitor logic moved to loadDataToMemory.then()
// startDeliveryMonitor();

// Admin: Trigger sending review requests to all delivered orders
app.post('/admin/send-review-requests', async (req, res) => {
    console.log('📬 Admin triggered: Send review requests to all delivered orders');
    try {
        const result = await sendReviewsToDeliveredOrders();
        res.json(result);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Admin: Get review request tracking status
app.get('/admin/review-requests-status', (req, res) => {
    res.json({
        totalSent: reviewRequestsSent.size,
        sentOrders: [...reviewRequestsSent]
    });
});

// Admin: Clear a specific order from sent list (to resend)
app.delete('/admin/review-requests/:orderNumber', async (req, res) => {
    const { orderNumber } = req.params;
    if (reviewRequestsSent.has(orderNumber)) {
        reviewRequestsSent.delete(orderNumber);
        await saveReviewRequests(reviewRequestsSent);
        res.json({ success: true, message: `Cleared ${orderNumber} from sent list` });
    } else {
        res.status(404).json({ error: 'Order not found in sent list' });
    }
});

// Admin: Force Resend Reviews to ALL delivered orders (Check local orders against Sendit)
app.post('/admin/force-resend-reviews', async (req, res) => {
    console.log('🚀 Admin Force Resend triggered...');

    // Respond immediately to prevent timeout
    res.json({ success: true, message: 'Started checking local orders against Sendit and sending...' });

    try {
        const SENDIT_API_BASE = 'https://app.sendit.ma/api/v1';
        const SENDIT_PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || '9a8a46843e3b20b922f67690ff1f27e0';
        const SENDIT_SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';

        // 1. Login
        const loginResponse = await fetch(`${SENDIT_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public_key: SENDIT_PUBLIC_KEY,
                secret_key: SENDIT_SECRET_KEY
            })
        });
        const loginData = await loginResponse.json();
        if (!loginData.success || !loginData.data?.token) {
            console.error('❌ Force Resend: Failed to login to Sendit');
            return;
        }
        const token = loginData.data.token;

        // 2. Get all local orders with email and tracking code
        const ordersToCheck = ordersStore.filter(order =>
            order.customerEmail && order.trackingCode
        );

        console.log(`📦 Checking ${ordersToCheck.length} local orders for DELIVERED status...`);

        let sentCount = 0;
        let notDeliveredCount = 0;
        let errorCount = 0;

        for (const order of ordersToCheck) {
            const trackingCode = order.trackingCode;
            const orderRef = order.orderNumber;

            try {
                // Check status via Sendit API
                const statusResponse = await fetch(`${SENDIT_API_BASE}/deliveries/${trackingCode}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json'
                    }
                });
                const statusData = await statusResponse.json();

                if (!statusData.success || !statusData.data) {
                    continue; // Skip if can't fetch status
                }

                const status = statusData.data.status;
                const statusUpper = status ? status.toUpperCase() : '';

                // Check for both English (DELIVERED) and French (LIVRÉ) status
                const isDelivered = statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ';

                if (!isDelivered) {
                    notDeliveredCount++;
                    continue;
                }

                // Order is DELIVERED - send review email (even if already sent - this is FORCE resend)
                console.log(`🔄 Resending to ${order.customerEmail} (${orderRef})...`);

                await sendReviewEmailInternal({
                    customerName: order.customerName || 'Valued Customer',
                    customerEmail: order.customerEmail,
                    orderNumber: orderRef,
                    trackingCode,
                    productName: order.productName || 'StoreName',
                    productImage: order.productImage || '',
                    language: 'fr'
                });
                sentCount++;

                // Mark as sent in local store
                order.reviewRequestSent = true;
                saveOrders();

                // Delay to be safe
                await new Promise(r => setTimeout(r, 1000));

            } catch (err) {
                errorCount++;
                console.error(`❌ Failed to process ${orderRef}:`, err.message);
            }
        }
        console.log(`✅ Force Resend Complete. Sent ${sentCount} emails, ${notDeliveredCount} not delivered, ${errorCount} errors.`);

    } catch (error) {
        console.error('❌ Force Resend Critical Error:', error);
    }
});

// Admin: Get all stored orders
app.get('/admin/orders', (req, res) => {
    res.json({
        total: ordersStore.length,
        orders: ordersStore
    });
});

// Admin: Add/update order info (for existing delivered orders)
app.post('/admin/orders', async (req, res) => {
    const { orderNumber, trackingCode, customerEmail, customerName, customerPhone, productName, productImage } = req.body;

    if (!orderNumber && !trackingCode) {
        return res.status(400).json({ error: 'orderNumber or trackingCode is required' });
    }

    if (!customerEmail) {
        return res.status(400).json({ error: 'customerEmail is required' });
    }

    // Check if order already exists
    const existingIndex = ordersStore.findIndex(o =>
        (orderNumber && o.orderNumber === orderNumber) ||
        (trackingCode && o.trackingCode === trackingCode)
    );

    const orderInfo = {
        orderNumber: orderNumber || trackingCode,
        trackingCode: trackingCode || null,
        customerEmail,
        customerName: customerName || 'Valued Customer',
        customerPhone: customerPhone || null,
        productName: productName || 'StoreName',
        productImage: productImage || '',
        createdAt: new Date().toISOString(),
        addedManually: true
    };

    if (existingIndex >= 0) {
        ordersStore[existingIndex] = { ...ordersStore[existingIndex], ...orderInfo };
        console.log(`📦 Updated order ${orderNumber || trackingCode}`);
    } else {
        ordersStore.push(orderInfo);
        console.log(`📦 Added new order ${orderNumber || trackingCode}`);
    }

    await saveOrders(ordersStore);
    res.json({ success: true, order: orderInfo });
});

// Admin: Bulk add orders
app.post('/admin/orders/bulk', async (req, res) => {
    const { orders } = req.body;

    if (!Array.isArray(orders) || orders.length === 0) {
        return res.status(400).json({ error: 'orders array is required' });
    }

    let added = 0;
    let updated = 0;

    for (const order of orders) {
        if (!order.customerEmail || (!order.orderNumber && !order.trackingCode)) continue;

        const existingIndex = ordersStore.findIndex(o =>
            (order.orderNumber && o.orderNumber === order.orderNumber) ||
            (order.trackingCode && o.trackingCode === order.trackingCode)
        );

        const orderInfo = {
            orderNumber: order.orderNumber || order.trackingCode,
            trackingCode: order.trackingCode || null,
            customerEmail: order.customerEmail,
            customerName: order.customerName || 'Valued Customer',
            customerPhone: order.customerPhone || null,
            productName: order.productName || 'StoreName',
            productImage: order.productImage || '',
            createdAt: new Date().toISOString(),
            addedManually: true
        };

        if (existingIndex >= 0) {
            ordersStore[existingIndex] = { ...ordersStore[existingIndex], ...orderInfo };
            updated++;
        } else {
            ordersStore.push(orderInfo);
            added++;
        }
    }

    await saveOrders(ordersStore);
    console.log(`📦 Bulk orders: ${added} added, ${updated} updated`);
    res.json({ success: true, added, updated, total: ordersStore.length });
});

// Submit Review Endpoint
// Submit Review Endpoint (Strict Rate Limit)
app.post('/submit-review', strictLimiter, async (req, res) => {
    try {
        const {
            orderNumber,
            trackingCode,
            customerEmail,
            rating,
            reviewerName,
            reviewText,
            photo,
            language
        } = req.body;

        if (!rating || !reviewerName) {
            return res.status(400).json({ error: 'Rating and name are required' });
        }

        // Generate discount code
        const discountCode = `REVIEW${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

        const review = {
            id: `REV-${Date.now()}`,
            orderNumber,
            trackingCode,
            customerEmail,
            rating: parseInt(rating),
            reviewerName,
            reviewText: reviewText || '',
            photo: photo || null,
            language: language || 'en',
            discountCode,
            verified: !!orderNumber,
            submittedAt: new Date().toISOString(),
            status: 'pending' // pending, approved, rejected
        };

        reviewsStore.push(review);
        await saveReviews(reviewsStore); // Persist to file
        console.log(`⭐ New review received: ${rating} stars from ${reviewerName} (Order: ${orderNumber})`);

        return res.status(200).json({
            success: true,
            reviewId: review.id,
            discountCode: discountCode,
            message: 'Review submitted successfully'
        });

    } catch (error) {
        console.error('Review submission error:', error);
        return res.status(500).json({ error: 'Failed to submit review' });
    }
});

// Get Reviews Endpoint (for display on product pages)
app.get('/reviews', (req, res) => {
    const approved = reviewsStore.filter(r => r.status === 'approved');
    const summary = {
        total: approved.length,
        average: approved.length > 0
            ? (approved.reduce((sum, r) => sum + r.rating, 0) / approved.length).toFixed(1)
            : 0,
        reviews: approved.map(r => ({
            id: r.id,
            rating: r.rating,
            reviewerName: r.reviewerName,
            reviewText: r.reviewText,
            verified: r.verified,
            photo: r.photo, // Include photo in response
            submittedAt: r.submittedAt
        }))
    };
    res.json(summary);
});

// Admin: Get ALL reviews (including pending and photos)
app.get('/admin/reviews', (req, res) => {
    // Add Emails Sent Stat
    const sentRequests = ordersStore
        .filter(o => o.reviewRequestSent)
        .map(o => ({
            orderNumber: o.orderNumber || o.trackingCode,
            email: o.customerEmail,
            sentAt: o.reviewRequestSentAt,
            status: o.status || 'DELIVERED'
        }))
        .sort((a, b) => new Date(b.sentAt || 0) - new Date(a.sentAt || 0)); // Newest first

    // Calculate stats
    const stats = {
        total: reviewsStore.length,
        pending: reviewsStore.filter(r => r.status === 'pending').length,
        approved: reviewsStore.filter(r => r.status === 'approved').length,
        rejected: reviewsStore.filter(r => r.status === 'rejected').length,
        averageRating: reviewsStore.length > 0
            ? (reviewsStore.reduce((sum, r) => sum + r.rating, 0) / reviewsStore.length).toFixed(1)
            : 0,
        ratingBreakdown: {
            5: reviewsStore.filter(r => r.rating === 5).length,
            4: reviewsStore.filter(r => r.rating === 4).length,
            3: reviewsStore.filter(r => r.rating === 3).length,
            2: reviewsStore.filter(r => r.rating === 2).length,
            1: reviewsStore.filter(r => r.rating === 1).length
        },
        emailsSent: sentRequests.length, // Keep the count
        sentRequests: sentRequests      // Add the details
    };

    res.json({
        stats,
        reviews: reviewsStore.map(r => ({
            ...r,
            photo: r.photo ? 'Has photo' : null // Don't send full base64 in list
        }))
    });
});

// Admin: Update review status (approve/reject)
app.patch('/admin/reviews/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Use: pending, approved, or rejected' });
    }

    const reviewIndex = reviewsStore.findIndex(r => r.id === id);
    if (reviewIndex === -1) {
        return res.status(404).json({ error: 'Review not found' });
    }

    reviewsStore[reviewIndex].status = status;
    reviewsStore[reviewIndex].updatedAt = new Date().toISOString();
    await saveReviews(reviewsStore);

    console.log(`📝 Review ${id} status updated to: ${status}`);
    res.json({ success: true, review: reviewsStore[reviewIndex] });
});

// Admin: Get single review with full photo
app.get('/admin/reviews/:id', (req, res) => {
    const { id } = req.params;
    const review = reviewsStore.find(r => r.id === id);

    if (!review) {
        return res.status(404).json({ error: 'Review not found' });
    }

    res.json(review);
});

// Internal function to send review email (reusable)
async function sendReviewEmailInternal({ customerName, customerEmail, orderNumber, trackingCode, productName, productImage, language = 'fr' }) {
    try {
        const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@your-domain.com';
        const FROM_NAME = process.env.FROM_NAME || 'StoreName';
        const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'info@your-domain.com';

        const lang = ['en', 'fr', 'ar'].includes(language) ? language : 'fr';

        const emailHtml = generateReviewRequestEmail({
            customerName,
            orderNumber,
            trackingCode,
            productName,
            productImage,
            customerEmail
        }, lang);

        const emailText = generateReviewRequestEmailText({
            customerName,
            orderNumber,
            trackingCode,
            productName,
            customerEmail
        }, lang);

        const subject = getReviewT(lang, 'subject', orderNumber);

        console.log(`DEBUG EMAIL VARS: FROM_EMAIL=${FROM_EMAIL}, ADMIN_EMAIL=${ADMIN_EMAIL}`);
        console.log(`📤 Sending review request email to:`, customerEmail);

        // Send email using Nodemailer (local Postfix SMTP)
        const mailOptions = {
            from: `${FROM_NAME} <${FROM_EMAIL}>`,
            to: customerEmail,
            replyTo: FROM_EMAIL, // Changed from ADMIN_EMAIL per user request
            subject: subject,
            html: emailHtml,
            text: emailText,
            bcc: FROM_EMAIL, // Send copy to sender (SMTP relay doesn't save to Sent folder)
            headers: {
                'X-Entity-Ref-ID': orderNumber,
                'List-Unsubscribe': `<mailto:${FROM_EMAIL}?subject=unsubscribe>`,

            }
        };

        const result = await smtpTransporter.sendMail(mailOptions);
        console.log(`✅ Review request email sent to:`, customerEmail, result.messageId);
        return true;
    } catch (error) {
        console.error('Review request email error:', error);
        return false;
    }
}

// Send Review Request Email Endpoint
// Send Review Request Email Endpoint
app.post('/send-review-request', async (req, res) => {
    try {
        const {
            customerName,
            customerEmail,
            orderNumber,
            trackingCode,
            productName,
            productImage,
            language = 'fr',
            bulk, // New flag
            force // New flag to bypass "already sent" check
        } = req.body;

        // BATCH RESEND LOGIC
        if (bulk === true) {
            console.log('🔄 Bulk Resend Triggered via /send-review-request');
            let sentCount = 0;
            let errors = [];

            for (const order of ordersStore) {
                const ref = order.orderNumber || order.trackingCode;
                if (!ref || !order.customerEmail) continue;

                // Check delivery status
                let status = null;
                if (order.trackingCode) {
                    try {
                        const data = await getCachedDelivery(order.trackingCode);
                        if (data) status = data.status;
                    } catch (e) { }
                }

                const statusUpper = status ? status.toUpperCase() : '';
                if (statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ') {
                    console.log(`📧 Resending to ${order.customerEmail} (${ref})...`);
                    try {
                        const success = await sendReviewEmailInternal({
                            customerName: order.customerName,
                            customerEmail: order.customerEmail,
                            orderNumber: ref,
                            trackingCode: order.trackingCode,
                            productName: order.productName,
                            productImage: order.productImage,
                            language: 'fr'
                        });
                        if (success) sentCount++;
                    } catch (err) {
                        errors.push({ ref, error: err.message });
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
            }
            return res.json({ success: true, message: `Bulk sent ${sentCount} emails`, sentCount, errors });
        }

        if (!customerEmail || !customerName || !orderNumber) {
            return res.status(400).json({ error: 'customerEmail, customerName, and orderNumber are required' });
        }

        // Check if we already sent a review request for this order
        if (reviewRequestsSent.has(orderNumber) && !force) {
            // Check if ordersStore needs syncing even if Set has it
            const orderIndex = ordersStore.findIndex(o => o.orderNumber === orderNumber || o.trackingCode === trackingCode);
            if (orderIndex !== -1 && !ordersStore[orderIndex].reviewRequestSent) {
                ordersStore[orderIndex].reviewRequestSent = true;
                ordersStore[orderIndex].reviewRequestSentAt = ordersStore[orderIndex].reviewRequestSentAt || new Date().toISOString();
                await saveOrders(ordersStore);
            }
            return res.status(200).json({ success: true, message: 'Review request already sent', skipped: true });
        }

        const emailSent = await sendReviewEmailInternal({
            customerName,
            customerEmail,
            orderNumber,
            trackingCode,
            productName,
            productImage,
            language
        });

        if (emailSent) {
            reviewRequestsSent.add(orderNumber);
            await saveReviewRequests(reviewRequestsSent); // Persist to Set file

            // ALSO PERSIST TO ORDERS STORE (Critical for Dashboard)
            const orderIndex = ordersStore.findIndex(o => o.orderNumber === orderNumber || o.trackingCode === trackingCode);
            if (orderIndex !== -1) {
                ordersStore[orderIndex].reviewRequestSent = true;
                ordersStore[orderIndex].reviewRequestSentAt = new Date().toISOString();
                await saveOrders(ordersStore);
            }

            return res.status(200).json({ success: true, message: 'Email sent', to: customerEmail });
        } else {
            return res.status(500).json({ error: 'Failed to send email' });
        }

    } catch (error) {
        console.error('Review request email error:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Admin endpoint to force resend reviews to all delivered orders
app.post('/admin/resend-batch', async (req, res) => {
    try {
        console.log('🔄 Manual Batch Resend Triggered');
        let sentCount = 0;
        let errors = [];

        for (const order of ordersStore) {
            const ref = order.orderNumber || order.trackingCode;
            if (!ref || !order.customerEmail) continue;

            // Check delivery status (Force refresh)
            let status = null;
            if (order.trackingCode) {
                try {
                    const data = await getCachedDelivery(order.trackingCode);
                    if (data) status = data.status;
                } catch (e) {
                    // Ignore error
                }
            }

            const statusUpper = status ? status.toUpperCase() : '';
            // Check if delivered OR if we want to force send to all valid orders? 
            // User asked for "delivered".
            if (statusUpper === 'DELIVERED' || statusUpper === 'LIVRÉ') {
                console.log(`📧 Resending to ${order.customerEmail} (${ref})...`);

                try {
                    const success = await sendReviewEmailInternal({
                        customerName: order.customerName,
                        customerEmail: order.customerEmail,
                        orderNumber: ref,
                        trackingCode: order.trackingCode,
                        productName: order.productName,
                        productImage: order.productImage,
                        language: 'fr'
                    });

                    if (success) sentCount++;
                } catch (err) {
                    errors.push({ ref, error: err.message });
                }

                // Rate limit 
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        res.json({
            success: true,
            message: `Batch complete. Sent ${sentCount} emails.`,
            sentCount,
            errors
        });

    } catch (error) {
        console.error('Batch resend error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Generate Review Request Email HTML - Premium StoreName Design
function generateReviewRequestEmail(data, lang = 'fr') {
    const t = (key, ...args) => getReviewT(lang, key, ...args);
    const isRTL = lang === 'ar';
    const dir = isRTL ? 'rtl' : 'ltr';
    const textAlign = isRTL ? 'right' : 'left';
    const alignReverse = isRTL ? 'left' : 'right';

    const reviewUrl = `https://your-domain.com/review.html?order=${data.orderNumber}&tracking=${data.trackingCode || ''}&email=${encodeURIComponent(data.customerEmail)}&product=${encodeURIComponent(data.productName || 'StoreName')}&img=${encodeURIComponent(data.productImage || '')}`;
    const year = new Date().getFullYear();
    const logoUrl = 'https://your-domain.com/assets/logo/logo.png';

    return `
<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${t('subject', data.orderNumber)}</title>
    <style type="text/css">
        /* Reset & Base */
        body, table, td, p, a, li { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
        img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
        
        /* Responsive Styles */
        @media only screen and (max-width: 600px) {
            .email-container { width: 100% !important; max-width: 100% !important; }
            .email-padding { padding: 25px 15px !important; }
            .header-padding { padding: 30px 20px 25px !important; }
            .hero-padding { padding: 35px 20px !important; }
            .content-padding { padding: 30px 20px !important; }
            .footer-padding { padding: 30px 20px !important; }
            .logo-img { width: 160px !important; max-width: 160px !important; }
            .hero-title { font-size: 26px !important; }
            .hero-greeting { font-size: 15px !important; }
            .stars-container { padding: 12px 20px !important; }
            .stars { font-size: 26px !important; letter-spacing: 8px !important; }
            .intro-text { font-size: 15px !important; }
            .order-card { padding: 20px !important; }
            .order-number { font-size: 18px !important; }
            .step-circle { width: 28px !important; height: 28px !important; line-height: 28px !important; font-size: 12px !important; }
            .step-text { font-size: 14px !important; }
            .reward-banner { padding: 20px !important; }
            .reward-icon { font-size: 32px !important; }
            .reward-text { font-size: 16px !important; }
            .cta-button { padding: 16px 40px !important; font-size: 16px !important; }
            .help-button { padding: 10px 20px !important; font-size: 13px !important; }
        }
        
        @media only screen and (max-width: 480px) {
            .email-padding { padding: 20px 12px !important; }
            .header-padding { padding: 25px 15px 20px !important; }
            .hero-padding { padding: 30px 15px !important; }
            .content-padding { padding: 25px 15px !important; }
            .footer-padding { padding: 25px 15px !important; }
            .logo-img { width: 140px !important; }
            .tagline { font-size: 10px !important; letter-spacing: 2px !important; }
            .hero-title { font-size: 22px !important; line-height: 1.3 !important; }
            .hero-greeting { font-size: 14px !important; }
            .stars { font-size: 22px !important; letter-spacing: 6px !important; }
            .intro-text { font-size: 14px !important; line-height: 1.7 !important; }
            .section-title { font-size: 15px !important; }
            .order-number { font-size: 16px !important; }
            .cta-button { padding: 14px 35px !important; font-size: 15px !important; }
            .contact-buttons td { display: block !important; padding: 5px 0 !important; }
        }
        
        @media only screen and (max-width: 375px) {
            .email-padding { padding: 15px 10px !important; }
            .header-padding { padding: 20px 12px 15px !important; }
            .hero-padding { padding: 25px 12px !important; }
            .content-padding { padding: 20px 12px !important; }
            .logo-img { width: 120px !important; }
            .hero-title { font-size: 20px !important; }
            .stars { font-size: 20px !important; letter-spacing: 5px !important; }
            .intro-text { font-size: 13px !important; }
            .order-card { padding: 15px !important; }
            .step-cell { padding-left: 10px !important; padding-right: 10px !important; }
            .cta-button { padding: 12px 30px !important; font-size: 14px !important; }
        }
    </style>
    <!--[if mso]>
    <style type="text/css">
        table { border-collapse: collapse; }
        .button { padding: 18px 50px !important; }
    </style>
    <![endif]-->
</head>
<body style="margin: 0; padding: 0; background: linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; -webkit-font-smoothing: antialiased;">
    
    <!-- Preheader -->
    <div style="display: none; max-height: 0; overflow: hidden; mso-hide: all;">
        ${t('preheader')} &nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
    </div>
    
    <!-- Email Container -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: linear-gradient(180deg, #0d0d0d 0%, #1a1a1a 100%); min-height: 100vh;">
        <tr>
            <td align="center" class="email-padding" style="padding: 40px 20px;">
                
                <!-- Main Card -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="600" class="email-container" style="max-width: 600px; width: 100%;">
                    
                    <!-- Top Decorative Bar -->
                    <tr>
                        <td style="height: 6px; background: linear-gradient(90deg, #C8102E 0%, #FFD700 50%, #006233 100%); border-radius: 20px 20px 0 0;"></td>
                    </tr>
                    
                    <!-- Header with Logo -->
                    <tr>
                        <td class="header-padding" style="background: #ffffff; padding: 40px 40px 30px 40px; text-align: center;">
                            <img src="${logoUrl}" alt="StoreName" width="200" class="logo-img" style="max-width: 200px; height: auto; display: inline-block;">
                            <p class="tagline" style="margin: 15px 0 0 0; font-size: 12px; color: #C8102E; text-transform: uppercase; letter-spacing: 4px; font-weight: 600;">Premium Moroccan Heritage</p>
                        </td>
                    </tr>
                    
                    <!-- Hero Section -->
                    <tr>
                        <td class="hero-padding" style="background: linear-gradient(135deg, #C8102E 0%, #8B0000 100%); padding: 50px 40px; text-align: center; position: relative;">
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="text-align: center;">
                                        <!-- Star Rating -->
                                        <table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto 25px auto;">
                                            <tr>
                                                <td class="stars-container" style="padding: 15px 30px; background: rgba(255,255,255,0.15); border-radius: 50px;">
                                                    <span class="stars" style="font-size: 32px; letter-spacing: 12px; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));">⭐⭐⭐⭐⭐</span>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <h1 class="hero-title" style="margin: 0 0 15px 0; font-size: 32px; color: #ffffff; font-weight: 700; text-shadow: 0 2px 10px rgba(0,0,0,0.3); font-family: Georgia, 'Times New Roman', serif; line-height: 1.3;">
                                            ${t('title')}
                                        </h1>
                                        <p class="hero-greeting" style="margin: 0; font-size: 16px; color: rgba(255,255,255,0.9); line-height: 1.6;">
                                            ${t('greeting', data.customerName)}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Main Content -->
                    <tr>
                        <td class="content-padding" style="background: #ffffff; padding: 45px 40px;">
                            
                            <!-- Introduction -->
                            <p class="intro-text" style="margin: 0 0 30px 0; font-size: 16px; color: #444444; line-height: 1.8; text-align: ${textAlign};">
                                ${t('intro')}
                            </p>
                            
                            <!-- Order Card -->
                            ${data.orderNumber ? `
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px;">
                                <tr>
                                    <td class="order-card" style="background: linear-gradient(135deg, #faf8f5 0%, #ffffff 100%); border-radius: 16px; padding: 25px; border: 2px solid #f0ebe3; box-shadow: 0 4px 15px rgba(0,0,0,0.04);">
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td style="width: 50px; vertical-align: top;">
                                                    <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #C8102E 0%, #8B0000 100%); border-radius: 12px; text-align: center; line-height: 50px;">
                                                        <span style="font-size: 24px;">📦</span>
                                                    </div>
                                                </td>
                                                <td style="padding-${isRTL ? 'right' : 'left'}: 20px; vertical-align: top;">
                                                    <p style="margin: 0 0 5px 0; font-size: 12px; color: #888888; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">
                                                        ${t('yourOrder')}
                                                    </p>
                                                    <p class="order-number" style="margin: 0; font-size: 22px; color: #1a1a1a; font-weight: 700; font-family: 'Courier New', monospace;">
                                                        #${data.orderNumber}
                                                    </p>
                                                    ${data.productName ? `<p style="margin: 8px 0 0 0; font-size: 14px; color: #666666;">${data.productName}</p>` : ''}
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            ` : ''}
                            
                            <!-- Steps Section -->
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px;">
                                <tr>
                                    <td style="background: #f8f9fa; border-radius: 16px; padding: 30px; border-${isRTL ? 'right' : 'left'}: 4px solid #FFD700;">
                                        <p style="margin: 0 0 20px 0; font-size: 18px; color: #1a1a1a; font-weight: 700; text-align: ${textAlign};">
                                            ${t('reviewPrompt')}
                                        </p>
                                        
                                        <!-- Step 1 -->
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px;">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border-radius: 50%; text-align: center; line-height: 32px; font-size: 14px; font-weight: 700; color: #1a1a1a; box-shadow: 0 3px 10px rgba(255,215,0,0.4);">1</div>
                                                </td>
                                                <td style="padding-${isRTL ? 'right' : 'left'}: 15px; vertical-align: middle;">
                                                    <p style="margin: 0; font-size: 15px; color: #444444; line-height: 1.5;">${t('step1')}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Step 2 -->
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 12px;">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border-radius: 50%; text-align: center; line-height: 32px; font-size: 14px; font-weight: 700; color: #1a1a1a; box-shadow: 0 3px 10px rgba(255,215,0,0.4);">2</div>
                                                </td>
                                                <td style="padding-${isRTL ? 'right' : 'left'}: 15px; vertical-align: middle;">
                                                    <p style="margin: 0; font-size: 15px; color: #444444; line-height: 1.5;">${t('step2')}</p>
                                                </td>
                                            </tr>
                                        </table>
                                        
                                        <!-- Step 3 -->
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td style="width: 36px; vertical-align: top;">
                                                    <div style="width: 32px; height: 32px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); border-radius: 50%; text-align: center; line-height: 32px; font-size: 14px; font-weight: 700; color: #1a1a1a; box-shadow: 0 3px 10px rgba(255,215,0,0.4);">3</div>
                                                </td>
                                                <td style="padding-${isRTL ? 'right' : 'left'}: 15px; vertical-align: middle;">
                                                    <p style="margin: 0; font-size: 15px; color: #444444; line-height: 1.5;">${t('step3')}</p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Reward Banner -->
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 35px;">
                                <tr>
                                    <td style="background: linear-gradient(135deg, #006233 0%, #004d26 100%); border-radius: 16px; padding: 25px 30px; text-align: center; box-shadow: 0 8px 25px rgba(0,98,51,0.25);">
                                        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                            <tr>
                                                <td style="text-align: center;">
                                                    <span style="font-size: 40px; display: inline-block; margin-bottom: 10px;">🎁</span>
                                                    <p style="margin: 0 0 8px 0; font-size: 14px; color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 2px;">Exclusive Reward</p>
                                                    <p style="margin: 0; font-size: 18px; color: #ffffff; font-weight: 600; line-height: 1.5;">
                                                        ${t('thankYouNote')}
                                                    </p>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- CTA Button -->
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 40px;">
                                <tr>
                                    <td align="center">
                                        <table role="presentation" cellpadding="0" cellspacing="0">
                                            <tr>
                                                <td style="background: linear-gradient(135deg, #C8102E 0%, #8B0000 100%); border-radius: 14px; box-shadow: 0 8px 30px rgba(200,16,46,0.35);">
                                                    <a href="${reviewUrl}" target="_blank" class="cta-button" style="display: inline-block; padding: 20px 55px; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 18px; letter-spacing: 0.5px;">
                                                        ⭐&nbsp;&nbsp;${t('buttonText')}
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                        <p style="margin: 15px 0 0 0; font-size: 13px; color: #999999;">
                                            ${isRTL ? '← اضغط للبدء' : 'Click to get started →'}
                                        </p>
                                    </td>
                                </tr>
                            </table>
                            
                            <!-- Divider -->
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td style="height: 1px; background: linear-gradient(90deg, transparent 0%, #e0e0e0 50%, transparent 100%);"></td>
                                </tr>
                            </table>
                            
                            <!-- Help Section -->
                            <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td style="text-align: center;">
                                        <p class="section-title" style="margin: 0 0 15px 0; font-size: 16px; color: #1a1a1a; font-weight: 600;">
                                            ${t('questionsTitle')}
                                        </p>
                                        <p style="margin: 0 0 20px 0; font-size: 14px; color: #666666;">
                                            ${t('questionsText')}
                                        </p>
                                        <table role="presentation" cellpadding="0" cellspacing="0" class="contact-buttons" style="margin: 0 auto;">
                                            <tr>
                                                <td style="padding: 0 10px;">
                                                    <a href="mailto:info@your-domain.com" class="help-button" style="display: inline-block; padding: 12px 24px; background: #f5f5f5; color: #C8102E; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">
                                                        ✉️&nbsp;&nbsp;Email
                                                    </a>
                                                </td>
                                                <td style="padding: 0 10px;">
                                                    <a href="https://wa.me/212667951100" class="help-button" style="display: inline-block; padding: 12px 24px; background: #25D366; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; border-radius: 8px;">
                                                        💬&nbsp;&nbsp;WhatsApp
                                                    </a>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- Footer - Same as Order Confirmation Email -->
                    <tr>
                        <td class="footer-padding" style="background: #1a1a1a; padding: 25px 30px; text-align: center;">
                            <p style="color: #ffffff; margin: 0; font-size: 0.95rem; direction: ${dir};">
                                <strong style="color: #D4AF37;">StoreName</strong> - ${t('footer')}
                            </p>
                            <p style="color: #888888; margin: 12px 0 0 0; font-size: 0.8rem; direction: ${dir};">
                                ${t('copyright', year)}
                            </p>
                        </td>
                    </tr>
                    
                    <!-- Bottom Decorative Bar -->
                    <tr>
                        <td style="height: 6px; background: linear-gradient(90deg, #006233 0%, #FFD700 50%, #C8102E 100%); border-radius: 0 0 20px 20px;"></td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

// Generate Review Request Email Text
function generateReviewRequestEmailText(data, lang = 'fr') {
    const t = (key, ...args) => getReviewT(lang, key, ...args);
    const reviewUrl = `https://your-domain.com/review.html?order=${data.orderNumber}&tracking=${data.trackingCode || ''}&email=${encodeURIComponent(data.customerEmail)}`;
    const year = new Date().getFullYear();

    return `StoreName
⭐⭐⭐⭐⭐

${t('greeting', data.customerName)}

${t('title')}

${t('intro')}

${data.orderNumber ? `${t('yourOrder')}: #${data.orderNumber}` : ''}
${data.productName ? `Product: ${data.productName}` : ''}

${t('reviewPrompt')}
${t('step1')}
${t('step2')}
${t('step3')}

🎁 ${t('thankYouNote')}

${t('buttonText')}: ${reviewUrl}

${t('questionsTitle')}
${t('questionsText')}
Email: info@your-domain.com
WhatsApp: +212 606 620 668

================================
${t('footer')}
${t('unsubscribe')}
${t('copyright', year)}
`;
}

// Check Delivered Orders and Send Review Requests (called by cron)
app.post('/check-delivered-and-send-reviews', async (req, res) => {
    // Simple auth check
    const authKey = req.headers['x-cron-key'] || req.query.key;
    const expectedKey = process.env.CRON_SECRET_KEY || 'storename-cron-2026';

    if (authKey !== expectedKey) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('🔄 Checking for delivered orders to send review requests...');

        // Sendit API credentials
        const SENDIT_API_BASE = 'https://app.sendit.ma/api/v1';
        const SENDIT_PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || '9a8a46843e3b20b922f67690ff1f27e0';
        const SENDIT_SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';

        // Login to Sendit
        const loginResponse = await fetch(`${SENDIT_API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                public_key: SENDIT_PUBLIC_KEY,
                secret_key: SENDIT_SECRET_KEY
            })
        });
        const loginData = await loginResponse.json();

        if (!loginData.success || !loginData.data?.token) {
            console.error('Failed to login to Sendit');
            return res.status(500).json({ error: 'Failed to connect to delivery service' });
        }

        const token = loginData.data.token;

        // Get delivered orders from Sendit
        const deliveriesResponse = await fetch(`${SENDIT_API_BASE}/deliveries?status=DELIVERED`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });
        const deliveriesData = await deliveriesResponse.json();

        if (!deliveriesData.success || !deliveriesData.data) {
            return res.status(200).json({ success: true, message: 'No delivered orders found', sent: 0 });
        }

        // Handle the data structure from Sendit (can be array or object)
        let deliveredOrders = [];
        try {
            if (Array.isArray(deliveriesData.data)) {
                deliveredOrders = deliveriesData.data.filter(o => o != null && typeof o === 'object');
            } else if (deliveriesData.data && typeof deliveriesData.data === 'object') {
                deliveredOrders = Object.values(deliveriesData.data).filter(o => o != null && typeof o === 'object');
            }
        } catch (parseErr) {
            console.error('Error parsing Sendit data:', parseErr);
            return res.status(200).json({ success: true, message: 'Error parsing delivery data', sent: 0 });
        }

        console.log(`Found ${deliveredOrders.length} delivered orders from Sendit`);

        // Filter orders delivered in the last 3 days and not yet sent review requests
        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        const eligibleOrders = deliveredOrders.filter(order => {
            try {
                const orderRef = order.sender_ref || order.code;
                if (!orderRef || reviewRequestsSent.has(orderRef)) return false;

                // Check if delivered within last 3 days
                const deliveredDate = new Date(order.last_action_at || order.updated_at || order.created_at);
                return deliveredDate >= threeDaysAgo;
            } catch (e) {
                return false;
            }
        });

        console.log(`Found ${eligibleOrders.length} eligible orders for review requests`);

        let sentCount = 0;
        const errors = [];

        for (const order of eligibleOrders) {
            if (!order) continue;

            try {
                // Extract customer info safely
                const customerName = order.customer?.name || order.name || 'Valued Customer';
                const customerEmail = order.customer?.email || order.email;
                const orderRef = order.sender_ref || order.code || `unknown-${Date.now()}`;
                const trackingCode = order.code || '';
                const productName = order.products?.[0]?.name || 'StoreName';

                if (!customerEmail) {
                    console.log(`Skipping ${orderRef}: No email address`);
                    continue;
                }

                console.log(`Sending review request to ${customerEmail} for order ${orderRef}`);

                // Send review request
                const sendResponse = await fetch(`http://localhost:${PORT}/send-review-request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName,
                        customerEmail,
                        orderNumber: orderRef,
                        trackingCode,
                        productName,
                        language: 'fr' // Default to French for Morocco
                    })
                });

                const sendResult = await sendResponse.json();

                if (sendResponse.ok && sendResult.success) {
                    sentCount++;
                    // Small delay to avoid rate limiting
                    await new Promise(r => setTimeout(r, 1000));
                } else if (!sendResult.skipped) {
                    errors.push({ order: orderRef, error: sendResult.error });
                }
            } catch (err) {
                const orderRef = order?.sender_ref || order?.code || 'unknown';
                errors.push({ order: orderRef, error: err.message });
            }
        }

        console.log(`✅ Review request check complete: ${sentCount} emails sent`);

        return res.status(200).json({
            success: true,
            checked: eligibleOrders.length,
            sent: sentCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (error) {
        console.error('Error checking delivered orders:', error);
        return res.status(500).json({ error: 'Internal server error', message: error.message });
    }
});

// Client-side pageview tracking
app.post('/analytics/track', (req, res) => {
    analytics.handleTrackingEvent(req, res);
});

// Get analytics summary (protected)
app.get('/analytics/summary', verifyAnalyticsAccess, (req, res) => {
    const period = req.query.period || 'today';
    const summary = analytics.getAnalyticsSummary(period);
    res.json(summary);
});

// Get real-time online visitors (protected)
app.get('/analytics/realtime', verifyAnalyticsAccess, (req, res) => {
    const online = analytics.getOnlineVisitors();
    res.json(online);
});

// Get access logs (protected)
app.get('/analytics/logs', verifyAnalyticsAccess, async (req, res) => {
    try {
        const options = {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            method: req.query.method,
            statusCode: req.query.statusCode,
            path: req.query.path,
            sortBy: req.query.sortBy || 'timestamp',
            sortOrder: req.query.sortOrder || 'desc'
        };
        const logs = await analytics.getLogs(options);
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

// Get sessions (protected)
app.get('/analytics/sessions', verifyAnalyticsAccess, (req, res) => {
    const options = {
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0,
        period: req.query.period || 'today'
    };
    const sessions = analytics.getSessions(options);
    res.json(sessions);
});

// Get single session details (protected)
app.get('/analytics/sessions/:id', verifyAnalyticsAccess, (req, res) => {
    const session = analytics.getSessionDetails(req.params.id);
    if (session) {
        res.json(session);
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// Debug endpoint - check raw data files (protected)
app.get('/analytics/debug', verifyAnalyticsAccess, async (req, res) => {
    const fs = await import('fs');
    const analyticsDataDir = join(__dirname_module, 'analytics-data');

    const result = { dataDir: analyticsDataDir, files: {} };

    try {
        if (fs.existsSync(analyticsDataDir)) {
            const files = fs.readdirSync(analyticsDataDir);
            for (const file of files) {
                const filePath = join(analyticsDataDir, file);
                const stats = fs.statSync(filePath);
                const content = fs.readFileSync(filePath, 'utf8');
                let parsed;
                try { parsed = JSON.parse(content); } catch (e) { parsed = 'Invalid JSON'; }
                result.files[file] = {
                    size: stats.size,
                    modified: stats.mtime,
                    recordCount: Array.isArray(parsed) ? parsed.length : (typeof parsed === 'object' ? Object.keys(parsed).length : 0),
                    sample: Array.isArray(parsed) ? parsed.slice(-3) : parsed
                };
            }
        } else {
            result.error = 'Data directory does not exist';
        }
    } catch (error) {
        result.error = error.message;
    }

    res.json(result);
});

// Serve static files from parent directory
app.use(express.static(join(__dirname_module, '../')));

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Generic API Server running on port ${PORT}`);
    console.log(`📍 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Analytics dashboard: /analytics-dashboard.html`);
});
