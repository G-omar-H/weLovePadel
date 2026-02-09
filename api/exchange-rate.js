
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

        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
        res.status(200).json({
            rate: parseFloat(madToUsd.toFixed(6)),
            usdToMad: parseFloat(usdToMad.toFixed(4)),
            timestamp: new Date().toISOString(),
            source: 'exchangerate-api.com'
        });

    } catch (error) {
        console.error('Error fetching exchange rate:', error);
        const fallbackRate = parseFloat(process.env.PAYPAL_MAD_TO_USD_RATE || '0.1');
        res.status(200).json({
            rate: fallbackRate,
            usdToMad: 1 / fallbackRate,
            timestamp: new Date().toISOString(),
            source: 'fallback',
            error: error.message
        });
    }
}
