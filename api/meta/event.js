
import crypto from 'crypto';

const META_PIXEL_ID = process.env.META_PIXEL_ID || '';
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN || process.env.META_CONVERSION_TOKEN || '';
const META_API_VERSION = 'v19.0';

async function hashData(data) {
    if (!data) return null;
    const normalized = data.trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

export default async function handler(req, res) {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { eventName, eventId, eventSourceUrl, customData, userData } = req.body;
        const clientIp = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || '0.0.0.0';
        const userAgent = req.headers['user-agent'];

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

            // Handle direct passed
            if (userData.email) userDataPayload.em = [await hashData(userData.email)];
            if (userData.phone) userDataPayload.phone = [await hashData(userData.phone)];
            if (userData.name) {
                const parts = userData.name.trim().split(' ');
                if (parts.length > 0) userDataPayload.fn = [await hashData(parts[0])];
                if (parts.length > 1) userDataPayload.ln = [await hashData(parts[parts.length - 1])];
            }
        }

        const eventPayload = {
            event_name: eventName,
            event_time: Math.floor(Date.now() / 1000),
            event_source_url: eventSourceUrl,
            event_id: eventId,
            action_source: 'website',
            user_data: userDataPayload,
            custom_data: customData
        };

        const fbResponse = await fetch(`https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                access_token: META_ACCESS_TOKEN,
                data: [eventPayload]
            })
        });

        const result = await fbResponse.json();

        if (fbResponse.ok) {
            res.status(200).json({ success: true, fb_trace_id: result.fbtrace_id });
        } else {
            console.error('Meta API Error:', result);
            res.status(400).json({ success: false, error: result });
        }

    } catch (error) {
        console.error('Server Meta CAPI Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
}
