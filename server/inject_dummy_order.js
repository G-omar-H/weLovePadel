
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, 'data', 'storename.db');

(async () => {
    try {
        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        const orderNumber = 'TEST-DUMP-MARC'; // Static ID so we don't spam if run multiple times
        const email = 'marcburn007@gmail.com';
        const now = new Date().toISOString();

        const json = {
            orderNumber: orderNumber,
            customerName: 'Marc Burn',
            customerEmail: email,
            productName: 'StoreName Patriot Edition (Test)',
            productImage: '/products/Atlas_star/patriot_Edition/5.png',
            status: 'DELIVERED', // Crucial for outreach list
            trackingCode: 'TRACK-MARC-007',
            deliveredAt: now, // Crucial for sorting (newest first)
            createdAt: now,
            addedManually: true,
            products: [{ name: 'StoreName Patriot Edition (Test)' }] // Add products array to prevent crash
        };

        // Check if exists first to avoid duplicate errors or just delete and recreate
        await db.run('DELETE FROM orders WHERE orderNumber = ?', [orderNumber]);

        await db.run(
            'INSERT INTO orders (orderNumber, trackingCode, customerEmail, data, reviewRequestSent) VALUES (?, ?, ?, ?, 0)',
            [orderNumber, json.trackingCode, email, JSON.stringify(json)]
        );

        console.log(`✅ Inserted dummy order: ${orderNumber} for ${email}`);
    } catch (e) {
        console.error('❌ Error injecting order:', e);
    }
})();
