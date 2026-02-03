
import fs from 'fs';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, 'analytics-data', 'access-logs.json');
const DB_FILE = path.join(__dirname, 'data', 'storename.db');

async function recoverData() {
    console.log('🔍 Starting Deep Recovery from Analytics Logs (ESM Mode)...');

    // 1. Read Logs
    let logs = [];
    try {
        const raw = fs.readFileSync(LOG_FILE, 'utf8');
        logs = JSON.parse(raw);
    } catch (e) {
        console.warn('⚠️ JSON parse failed, check log file integrity.');
        console.error(e);
        return;
    }

    console.log(`📂 Processing ${logs.length} log entries...`);

    const richOrders = new Map();

    // 2. Extract Data
    logs.forEach(log => {
        const body = log.requestBody;
        if (!body) return;

        // Skip the "Restored" bulk payloads which contain the bad data
        if (body._truncated || body._preview) return;

        // Valid order payload should have specific fields
        if (body.orderNumber && body.productName && body.productName !== 'StoreName (Restored)') {
            // We found a rich entry!
            const entry = {
                orderNumber: body.orderNumber,
                trackingCode: body.trackingCode,
                customerEmail: body.customerEmail,
                customerName: body.customerName,
                productName: body.productName,
                productImage: body.productImage,
                customerPhone: body.customerPhone,
                language: body.language
            };

            // Store/Update in map (later logs might be more recent/accurate)
            richOrders.set(body.orderNumber, entry);
        }
    });

    console.log(`💎 Found ${richOrders.size} RICH order records in logs.`);

    // 3. Update SQLite
    const db = new sqlite3.Database(DB_FILE);

    let updatedCount = 0;

    db.serialize(() => {
        db.all("SELECT * FROM orders", [], (err, rows) => {
            if (err) {
                console.error('❌ DB Error:', err);
                return;
            }

            const stmt = db.prepare("UPDATE orders SET trackingCode = ?, data = ? WHERE orderNumber = ?");

            rows.forEach(row => {
                let currentData;
                try {
                    currentData = JSON.parse(row.data);
                } catch (e) { return; }

                // Only update if current data is 'Restored' or sparse
                if (currentData.productName === 'StoreName (Restored)' || !currentData.productName) {
                    const richData = richOrders.get(row.orderNumber);

                    if (richData) {
                        // MERGE: Keep existing timestamps/flags, overwrite content
                        const mergedData = {
                            ...currentData,
                            ...richData, // Overwrite with rich fields
                            customerName: richData.customerName || currentData.customerName, // Prefer rich name
                        };

                        // Update DB
                        stmt.run(
                            richData.trackingCode || row.trackingCode,
                            JSON.stringify(mergedData),
                            row.orderNumber
                        );
                        updatedCount++;
                        if (updatedCount % 10 === 0) process.stdout.write('.');
                    }
                }
            });

            stmt.finalize(() => {
                console.log(`\n✅ Successfully upgraded ${updatedCount} orders with rich data!`);
                db.close();
            });
        });
    });
}

recoverData();
