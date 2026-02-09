
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

    // Fallback if env vars are missing
    if (!clientId || !clientSecret) {
        console.error('PayPal secrets missing in environment variables');
        return res.status(500).json({ error: 'Server configuration error' });
    }

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

        res.status(200).json({ success: true, data: trackingData });

    } catch (error) {
        console.error('PayPal tracking error:', error);
        res.status(500).json({ error: error.message });
    }
}
