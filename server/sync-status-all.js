
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'storename.db');

const PUBLIC_KEY = '9a8a46843e3b20b922f67690ff1f27e0';
const SECRET_KEY = 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';
const BASE_URL = 'https://app.sendit.ma/api/v1/';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken() {
    try {
        const response = await fetch(`${BASE_URL}login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: PUBLIC_KEY, secret_key: SECRET_KEY })
        });
        const data = await response.json();
        return data.data.token;
    } catch (e) {
        console.error('❌ Auth Error:', e);
        process.exit(1);
    }
}

async function run() {
    console.log('🔄 Starting Full Status Sync...');
    const db = new sqlite3.Database(DB_FILE);
    const token = await getToken();

    // Get all orders with tracking code
    db.all("SELECT orderNumber, trackingCode FROM orders WHERE trackingCode IS NOT NULL AND trackingCode != ''", [], async (err, rows) => {
        if (err) return console.error(err);

        console.log(`📦 Found ${rows.length} orders to check.`);
        const stmt = db.prepare("UPDATE orders SET status = ? WHERE orderNumber = ?");
        let updated = 0;

        for (const row of rows) {
            try {
                process.stdout.write(`   Checking ${row.trackingCode}... `);

                const res = await fetch(`${BASE_URL}deliveries/${row.trackingCode}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) {
                        const status = json.data.status; // e.g. "DELIVERED", "LIVRÉ"
                        stmt.run(status, row.orderNumber);
                        console.log(status);
                        updated++;
                    } else {
                        console.log('No Data');
                    }
                } else {
                    console.log(`Error ${res.status}`);
                }
            } catch (e) {
                console.log('Fail');
            }
            // Rate limit
            await sleep(100);
        }

        stmt.finalize(() => {
            console.log(`✅ Sync Complete. Updated ${updated} statuses.`);
            db.close();
        });
    });
}

run();
