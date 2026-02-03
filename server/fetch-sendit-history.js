
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'data', 'storename.db');

// CREDENTIALS FROM .ENV
const PUBLIC_KEY = '9a8a46843e3b20b922f67690ff1f27e0';
const SECRET_KEY = 'k1S94ZRQ4AFpMDoL2UQktsXymcAfFVyG';
const BASE_URL = 'https://app.sendit.ma/api/v1/';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function getToken() {
    console.log('🔑 Authenticating with Sendit...');
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

async function fetchAllDeliveries(token) {
    let allItems = [];
    let page = 1;
    let lastPage = 1;

    console.log('📦 Fetching full delivery history...');

    do {
        // Try to request more items per page if supported
        const response = await fetch(`${BASE_URL}deliveries?page=${page}&per_page=100`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            console.error(`❌ API Error on page ${page}:`, response.status);
            break;
        }

        const json = await response.json();

        // Handle quirks: 'data' wrapper for items
        const wrapper = json.data || {};

        // Items are in json.data (Object with numeric keys)
        let pageItems = [];
        Object.keys(wrapper).forEach(key => {
            if (!isNaN(parseInt(key))) {
                pageItems.push(wrapper[key]);
            }
        });

        if (pageItems.length > 0) {
            allItems = [...allItems, ...pageItems];
            console.log(`   Fetched page ${page}: ${pageItems.length} orders. (Total: ${json.total || '?'})`);
        }

        // Pagination Logic - Keys are at ROOT level based on probe
        lastPage = json.last_page || 1;

        console.log(`   Page ${page} / ${lastPage}`);

        if (page >= lastPage) break;

        page++;
        await sleep(200);

    } while (true);

    return allItems;
}

async function updateDatabase(deliveries) {
    console.log(`💎 Analyzing ${deliveries.length} deliveries for recovery...`);
    const db = new sqlite3.Database(DB_FILE);

    const updateMap = new Map();

    deliveries.forEach(d => {
        // MATCHING KEY
        // d.reference should match our orderNumber (TAR-...)
        if (!d.reference) return;

        // Parse Products
        let productName = 'StoreName Product';
        if (d.products && Array.isArray(d.products) && d.products.length > 0) {
            // Usually d.products[0].name
            productName = d.products.map(p => p.name).join(' + ');
        } else if (d.comment && d.comment.includes('PRODUITS:')) {
            // Extract from comment if structured
            // "Appelle | PRODUITS: La Casquette ... | Landmark"
            const parts = d.comment.split('PRODUITS:');
            if (parts.length > 1) {
                productName = parts[1].split('|')[0].trim();
            }
        }

        const richData = {
            trackingCode: d.code,
            customerName: d.name,
            customerPhone: d.phone,
            productName: productName,
            // Address construction
            customerAddress: `${d.city ? d.city.name : ''} - ${d.district ? d.district.name : ''}`
        };

        updateMap.set(d.reference.trim(), richData);
    });

    console.log(`🔍 Found ${updateMap.size} recoverable orders.`);

    db.serialize(() => {
        db.all("SELECT * FROM orders", [], (err, rows) => {
            if (err) return console.error(err);

            const stmt = db.prepare("UPDATE orders SET trackingCode = ?, data = ? WHERE orderNumber = ?");
            let updated = 0;

            rows.forEach(row => {
                let currentData;
                try { currentData = JSON.parse(row.data); } catch { return; }

                // Only target broken records OR verify all? user said "restore all"
                // Let's prioritize updating broken ones, but maybe we should update ALL matching ones to ensure sync?
                // User said "get all the data restored". 
                // Let's update IF we have match, prioritizing truth from Sendit.

                let match = updateMap.get(row.orderNumber);

                if (match) {
                    const merged = {
                        ...currentData,
                        ...match,
                        // Keep image empty if we don't have it, or maybe regex mapped from name?
                        // For now, names are better than "Restored"
                    };

                    // Simple Image Mapping Heuristic (Bonus)
                    if (match.productName.includes('Patriot')) {
                        merged.productImage = '/products/Atlas_star/patriot_Edition/5.png';
                    } else if (match.productName.includes('Signature Rouge')) {
                        merged.productImage = '/products/Atlas_star/signature_Rouge/atlas-star-tarbouch-front-view.png';
                    }

                    stmt.run(
                        match.trackingCode || row.trackingCode,
                        JSON.stringify(merged),
                        row.orderNumber
                    );
                    updated++;
                }
            });

            stmt.finalize(() => {
                console.log(`✅ RECOVERY COMPLETE: Updated ${updated} orders in Database.`);
                db.close();
            });
        });
    });
}

async function run() {
    const token = await getToken();
    const deliveries = await fetchAllDeliveries(token);
    await updateDatabase(deliveries);
}

run();
