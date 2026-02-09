
export default function handler(req, res) {
    const config = {
        CLIENT_ID_LIVE: process.env.PAYPAL_CLIENT_ID_LIVE || null,
        CLIENT_ID_SANDBOX: process.env.PAYPAL_CLIENT_ID_SANDBOX || null,
        USE_SANDBOX: process.env.PAYPAL_USE_SANDBOX === 'true' || false,
        MAD_TO_USD_RATE: parseFloat(process.env.PAYPAL_MAD_TO_USD_RATE || '0.1')
    };

    // Set CORS headers
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    res.status(200).json(config);
}
