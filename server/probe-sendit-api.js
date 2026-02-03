
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

async function probe() {
    try {
        const token = await getToken();
        console.log('✅ Token acquired.');

        const endpoints = [
            'parcels',
            'orders',
            'shipments',
            'deliveries',
            'history',
            'dashboard/summary'
        ];

        for (const ep of endpoints) {
            console.log(`\n🔍 Probing /${ep}...`);
            const res = await fetch(`${BASE_URL}${ep}`, {
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
            });
            console.log(`   Status: ${res.status} ${res.statusText}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`   ✅ SUCCESS! Keys:`, Object.keys(data));

                if (data.total !== undefined) {
                    console.log(`   📊 Total Records Matching: ${data.total}`);
                }

                if (data.data) {
                    console.log(`   📦 Data Type: ${typeof data.data}`);
                    if (Array.isArray(data.data)) {
                        console.log(`   📦 Data Length: ${data.data.length}`);
                        if (data.data.length > 0) {
                            console.log('   🔹 Sample Item:', JSON.stringify(data.data[0], null, 2));
                        } else {
                            console.log('   ⚠️ Data array is empty.');
                        }
                    } else {
                        console.log('   ⚠️ Data is not an array:', data.data);
                    }
                }
            }
        }

    } catch (e) {
        console.error(e);
    }
}

probe();
