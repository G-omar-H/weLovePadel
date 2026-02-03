
import path from 'path';
import { fileURLToPath } from 'url';

const PUBLIC_KEY = '9a8a46843e3b20b922f67690ff1f27e0';
const SECRET_KEY = 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';
const BASE_URL = 'https://app.sendit.ma/api/v1/';

async function getToken() {
    console.log('🔑 Authenticating...');
    const response = await fetch(`${BASE_URL}login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_key: PUBLIC_KEY, secret_key: SECRET_KEY })
    });
    const data = await response.json();
    return data.data.token;
}

const MISSING_IDS = [
    'TAR-1767897173651', 'TAR-1767976681134', 'TAR-1767977501520', 'TAR-1767977734744',
    'TAR-1768151351639', 'TAR-1768217395268', 'TAR-1768219888447', 'TAR-1768221665026'
];

async function search() {
    const token = await getToken();

    console.log('🔍 Testing Search Params...');

    // Try different search keys
    const params = ['search', 'q', 'reference', 'client_ref', 'keyword'];
    const target = MISSING_IDS[0]; // Test with first one

    for (const key of params) {
        console.log(`   Trying ?${key}=${target}`);
        const res = await fetch(`${BASE_URL}deliveries?${key}=${target}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const json = await res.json();
            if (json.total > 0 || (json.data && json.data.length > 0) || (json.data && Object.keys(json.data).length > 0)) {
                console.log(`   ✅ HIT! Found results using parameter: ${key}`);
                console.log(JSON.stringify(json, null, 2).substring(0, 300));
            } else {
                console.log(`   ❌ No results.`);
            }
        }
    }
}

search();
