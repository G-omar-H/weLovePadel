
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'storename.db');

// CREDENTIALS
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

async function getMissingOrders(db) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT orderNumber FROM orders WHERE json_extract(data, "$.productName") LIKE "%Restored%"`;
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows.map(r => r.orderNumber));
        });
    });
}

function parseSenditOrder(d) {
    // Parse Products from comment or array
    let productName = 'StoreName Product';
    let productImage = '';

    if (d.products && Array.isArray(d.products) && d.products.length > 0) {
        productName = d.products.map(p => p.name).join(' + ');
    } else if (d.comment && d.comment.includes('PRODUITS:')) {
        const parts = d.comment.split('PRODUITS:');
        if (parts.length > 1) {
            productName = parts[1].split('|')[0].trim();
        }
    }

    // Heuristic Image Mapping
    if (productName.includes('Patriot')) {
        productImage = '/products/Atlas_star/patriot_Edition/5.png';
    } else if (productName.includes('Signature Rouge')) {
        productImage = '/products/Atlas_star/signature_Rouge/atlas-star-tarbouch-front-view.png';
    }

    return {
        trackingCode: d.code,
        customerName: d.name,
        customerPhone: d.phone,
        productName: productName,
        productImage: productImage,
        customerAddress: `${d.city ? d.city.name : ''} - ${d.district ? d.district.name : ''}`
    };
}

async function run() {
    console.log('🚀 Starting Targeted Recovery...');

    const db = new sqlite3.Database(DB_FILE);
    const missingIds = await getMissingOrders(db);

    console.log(`📋 Found ${missingIds.length} orders still missing data.`);
    if (missingIds.length === 0) return;

    const token = await getToken();
    let recoveredCount = 0;

    const stmt = db.prepare("UPDATE orders SET trackingCode = ?, data = ? WHERE orderNumber = ?");

    for (const orderId of missingIds) {
        process.stdout.write(`   Searching for ${orderId}... `);

        try {
            // Use ?reference= which we verified works
            const res = await fetch(`${BASE_URL}deliveries?reference=${orderId}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const json = await res.json();

                // Extract first match from data object
                let match = null;
                if (json.data) {
                    // It returns an object with keys "0", "1" etc.
                    const keys = Object.keys(json.data).filter(k => !isNaN(parseInt(k)));
                    if (keys.length > 0) {
                        match = json.data[keys[0]];
                    }
                }

                if (match) {
                    const richData = parseSenditOrder(match);

                    // Fetch current data to merge
                    db.get("SELECT data FROM orders WHERE orderNumber = ?", [orderId], (err, row) => {
                        if (row) {
                            const current = JSON.parse(row.data);
                            const merged = keyMerge(current, richData);

                            stmt.run(richData.trackingCode, JSON.stringify(merged), orderId);
                            recoveredCount++;
                            console.log(`✅ FOUND: ${richData.customerName}`);
                        }
                    });

                } else {
                    console.log('❌ Not found in Sendit.');
                }
            } else {
                console.log(`❌ API Error ${res.status}`);
            }
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }

        await sleep(200); // Rate limit
    }

    // Wait for DB writes
    setTimeout(() => {
        stmt.finalize(() => {
            console.log(`\n🎉 FINAL RESULT: Recovered ${recoveredCount} / ${missingIds.length} orders.`);
            db.close();
        });
    }, 2000);
}

function keyMerge(current, rich) {
    return {
        ...current,
        ...rich
    };
}

run();
