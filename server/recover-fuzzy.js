
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

async function getMissingOrders(db) {
    return new Promise((resolve, reject) => {
        const sql = `SELECT orderNumber, json_extract(data, "$.customerEmail") as email FROM orders WHERE json_extract(data, "$.productName") LIKE "%Restored%"`;
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function parseSenditOrder(d) {
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

function extractNameFromEmail(email) {
    // e.g. "waf.zemmama@gmail.com" -> "zemmama" (last part is usually surname)
    // "n.boubekri@gmail.com" -> "boubekri"
    if (!email) return null;
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);

    // Return the longest part, usually the surname
    return parts.reduce((a, b) => a.length > b.length ? a : b, '');
}

async function run() {
    console.log('🚀 Starting Fuzzy Name Recovery...');

    const db = new sqlite3.Database(DB_FILE);
    const missing = await getMissingOrders(db);

    console.log(`📋 Processing ${missing.length} Restored orders...`);
    if (missing.length === 0) return;

    const token = await getToken();
    let recoveredCount = 0;

    const stmt = db.prepare("UPDATE orders SET trackingCode = ?, data = ? WHERE orderNumber = ?");

    for (const order of missing) {
        const searchKey = extractNameFromEmail(order.email);
        if (!searchKey || searchKey.length < 3) {
            console.log(`❌ Skipping ${order.email} (Key too short)`);
            continue;
        }

        process.stdout.write(`   Searching for "${searchKey}" (${order.email})... `);

        try {
            // Search by keyword (searches name/phone/etc)
            const res = await fetch(`${BASE_URL}deliveries?search=${searchKey}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (res.ok) {
                const json = await res.json();
                let match = null;

                // Parse weird Sendit response
                if (json.data) {
                    const keys = Object.keys(json.data).filter(k => !isNaN(parseInt(k)));
                    // Only use if we have exact 1 match OR check similarity?
                    // Let's iterate and see if any looks good
                    for (const k of keys) {
                        const candidate = json.data[k];
                        // If we have multiple, maybe match first? 
                        // It sorts by date usually. The newest one is risky if frequent buyer.
                        // But these are old orders. Let's take the first one.
                        match = candidate;
                        break;
                    }
                }

                if (match) {
                    const richData = parseSenditOrder(match);

                    db.get("SELECT data FROM orders WHERE orderNumber = ?", [order.orderNumber], (err, row) => {
                        if (row) {
                            const current = JSON.parse(row.data);
                            const merged = { ...current, ...richData };

                            stmt.run(richData.trackingCode, JSON.stringify(merged), order.orderNumber);
                            recoveredCount++;
                            console.log(`✅ MATCH: ${richData.customerName}`);
                        }
                    });

                } else {
                    console.log('❌ No match.');
                }
            } else {
                console.log(`❌ API Error ${res.status}`);
            }
        } catch (e) {
            console.log(`❌ Error: ${e.message}`);
        }

        await sleep(250);
    }

    setTimeout(() => {
        stmt.finalize(() => {
            console.log(`\n🎉 FUZZY RESULT: Recovered ${recoveredCount} / ${missing.length} orders.`);
            db.close();
        });
    }, 2000);
}

run();
