
export default function handler(req, res) {
    const config = {
        PUBLIC_KEY: process.env.SENDIT_PUBLIC_KEY || '',
        // SECRET_KEY should NOT be exposed to client, but logic in client might expect it? 
        // Checking legacy code: client uses this to init Sendit? No, usually public key.
        // But server/index.js exposed it: SECRET_KEY: process.env.SENDIT_SECRET_KEY || ''
        // If the client needs it (bad practice but required for current code), we must expose it.
        SECRET_KEY: process.env.SENDIT_SECRET_KEY || '',
        PICKUP_DISTRICT_ID: parseInt(process.env.SENDIT_PICKUP_DISTRICT_ID || '1', 10),
        ALLOW_OPEN: parseInt(process.env.SENDIT_ALLOW_OPEN || '1', 10),
        ALLOW_TRY: parseInt(process.env.SENDIT_ALLOW_TRY || '1', 10),
        OPTION_EXCHANGE: parseInt(process.env.SENDIT_OPTION_EXCHANGE || '0', 10),
        PRODUCTS_FROM_STOCK: 1,
        PACKAGING_ID: 8
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
