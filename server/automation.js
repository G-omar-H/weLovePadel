
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // Run every 6 hours
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY;
const SECRET_KEY = process.env.SENDIT_SECRET_KEY;
const BASE_URL = 'https://app.sendit.ma/api/v1/';

// State
let isRunning = false;

// 1. Authenticate with Sendit
async function getSenditToken() {
    try {
        const response = await fetch(`${BASE_URL}login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ public_key: PUBLIC_KEY, secret_key: SECRET_KEY })
        });
        const data = await response.json();
        return data.data?.token;
    } catch (e) {
        console.error('❌ [AutoPilot] Auth Error:', e.message);
        return null;
    }
}

// 2. Fetch Recent Deliveries (First 5 pages ~ 500 orders is enough for incremental updates)
async function fetchRecentDeliveries(token) {
    let recentItems = [];
    const MAX_PAGES = 5;

    try {
        for (let page = 1; page <= MAX_PAGES; page++) {
            const response = await fetch(`${BASE_URL}deliveries?page=${page}&per_page=100`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) break;

            const json = await response.json();
            const wrapper = json.data || {};
            let pageItems = [];

            // Parse Sendit's quirky object-as-array response
            Object.keys(wrapper).forEach(key => {
                if (!isNaN(parseInt(key))) {
                    pageItems.push(wrapper[key]);
                }
            });

            if (pageItems.length === 0) break;
            recentItems = [...recentItems, ...pageItems];

            // If we reached the last page, stop
            if (page >= (json.last_page || 1)) break;

            // Respect rate limits slightly
            await new Promise(r => setTimeout(r, 200));
        }
    } catch (error) {
        console.error('❌ [AutoPilot] Fetch Error:', error.message);
    }

    return recentItems;
}

// 3. Process & Sync Data
async function processDeliveries(deliveries, db, updateCacheCallback) {
    let updatedCount = 0;

    // Prepare statement for updating orders
    // We update status and tracking code. We do NOT overwrite manual name edits if possible, 
    // but for now, we'll assume Sendit is the source of truth for delivery status.

    for (const d of deliveries) {
        if (!d.reference) continue;
        // orderNumber and status are already declared above
        // updating logic to use existing variables or just ensure we don't redeclare
        const orderNumber = d.reference.trim();
        const status = d.status ? d.status.toUpperCase() : 'UNKNOWN';
        const trackingCode = d.code;
        // Capture delivery timestamp (or fallback to update time)
        const deliveredAt = d.last_action_at || d.updated_at || new Date().toISOString();

        try {
            // Check if order exists
            const existing = await db.get('SELECT * FROM orders WHERE orderNumber = ?', [orderNumber]);

            if (existing) {
                // Update existing order status if changed
                // We parse the JSON data to update fields if needed, but primarily we care about the STATUS column

                // Only update if status implies progress (or is definitive)
                // Actually, just syncing status is good.

                // Also update the JSON blob with fresh data if needed, but let's be careful not to wipe user edits.
                // For this MVP, we update the main table columns which control the logic.

                // Parse existing data to merge
                let json = {};
                try { json = JSON.parse(existing.data); } catch (e) { }

                // Update product image mapping if missing
                if (!json.productImage || json.productImage === '') {
                    let pName = (d.products && d.products.length && d.products[0].name) ? d.products[0].name : '';
                    if (pName.includes('Patriot') || pName.includes('quette')) json.productImage = '/products/Atlas_star/patriot_Edition/5.png';
                    else if (pName.includes('Signature') || pName.includes('Rouge')) json.productImage = '/products/Atlas_star/signature_Rouge/atlas-star-tarbouch-front-view.png';
                }

                // Update core fields
                json.status = status;
                json.deliveredAt = deliveredAt;

                await db.run(
                    'UPDATE orders SET trackingCode = ?, data = ? WHERE orderNumber = ?',
                    [trackingCode, JSON.stringify(json), orderNumber]
                );

                // Update Memory Cache
                if (updateCacheCallback) updateCacheCallback(json);

                updatedCount++;
            } else {
                // Should we auto-create orders that don't exist in DB?
                // The user asked to "add delivered orders to list". So YES.

                // Construct new order object
                let pName = 'StoreName Product';
                if (d.products && d.products.length) pName = d.products.map(p => p.name || '').join(' + ') || 'StoreName Product';

                let pImage = 'https://placehold.co/400x400/png?text=Product';
                // Allow custom image mapping logic if needed in future
                if (process.env.DEFAULT_PRODUCT_IMAGE) pImage = process.env.DEFAULT_PRODUCT_IMAGE;

                const newOrder = {
                    orderNumber: orderNumber,
                    trackingCode: trackingCode,
                    customerEmail: d.phone ? `${d.phone}@placeholder.com` : '', // Sendit often missing email, use placeholder or extract from comment?
                    // Wait, if no email, we can't send review request. 
                    // Sendit API v1 might not return email in the list view?
                    // We'll try to extract name/email from comments if encoded there, otherwise skip email.
                    customerName: d.name,
                    productName: pName,
                    productImage: pImage,
                    status: status,
                    createdAt: d.created_at || new Date().toISOString(),
                    deliveredAt: deliveredAt,
                    addedManually: false
                };

                // Store in DB
                await db.run(
                    'INSERT INTO orders (orderNumber, trackingCode, customerEmail, reviewRequestSent, data) VALUES (?, ?, ?, 0, ?)',
                    [orderNumber, trackingCode, newOrder.customerEmail, JSON.stringify(newOrder)]
                );

                // Update Memory Cache
                if (updateCacheCallback) updateCacheCallback(newOrder);

                updatedCount++;
            }
        } catch (err) {
            console.error(`❌ [AutoPilot] Order Sync Error (${orderNumber}):`, err.message);
        }
    }

    if (updatedCount > 0) console.log(`🔄 [AutoPilot] Synced ${updatedCount} orders.`);
}

// 4. Send Emails for Delivered Orders
async function processAutoEmails(db, sendEmailFunc, updateCacheCallback) {
    // Find candidates: Status = DELIVERED/LIVRÉ, Email exists, Request NOT sent
    const candidates = await db.all(`
        SELECT * FROM orders 
        WHERE (status = 'DELIVERED' OR status = 'LIVRÉ' OR status = 'LIVRE')
        AND reviewRequestSent = 0
        AND customerEmail IS NOT NULL 
        AND customerEmail != ''
        AND customerEmail NOT LIKE '%@placeholder.com'
    `);

    if (candidates.length === 0) return;

    console.log(`📧 [AutoPilot] Found ${candidates.length} candidates for review emails.`);

    let sentCount = 0;
    for (const order of candidates) {
        let jsonData = {};
        try { jsonData = JSON.parse(order.data); } catch (e) { }

        const email = order.customerEmail;
        const name = jsonData.customerName || 'Client';
        const pName = jsonData.productName || process.env.BRAND_NAME || 'Store Product';
        const pImg = jsonData.productImage || '';
        const orderRef = order.orderNumber;
        const tracking = order.trackingCode;

        console.log(`   🚀 Sending to ${email} (${orderRef})...`);

        try {
            // Call the email function injected from index.js
            const success = await sendEmailFunc({
                customerName: name,
                customerEmail: email,
                orderNumber: orderRef,
                trackingCode: tracking,
                productName: pName,
                productImage: pImg,
                language: 'fr' // Default to French for automation
            });

            if (success) {
                // Mark as sent in DB
                await db.run(
                    'UPDATE orders SET reviewRequestSent = 1, reviewRequestSentAt = ? WHERE orderNumber = ?',
                    [new Date().toISOString(), orderRef]
                );

                // Update Memory Cache
                jsonData.reviewRequestSent = true;
                jsonData.reviewRequestSentAt = new Date().toISOString();
                if (updateCacheCallback) updateCacheCallback(jsonData);

                sentCount++;
                // Wait a bit between emails to be safe
                await new Promise(r => setTimeout(r, 2000));
            }
        } catch (err) {
            console.error(`   ❌ Failed to send to ${email}:`, err.message);
        }
    }

    if (sentCount > 0) console.log(`✅ [AutoPilot] Successfully sent ${sentCount} review emails.`);
}

// Main Automation Loop
export async function initAutomation(db, sendEmailFunc, updateCacheCallback) {
    if (isRunning) return;
    isRunning = true;

    console.log('🤖 [AutoPilot] Service Started. Checking every 6 hours.');

    const runCycle = async () => {
        console.log('🤖 [AutoPilot] Starting Sync Cycle...');
        try {
            const token = await getSenditToken();
            if (token) {
                const recent = await fetchRecentDeliveries(token);
                if (recent.length > 0) {
                    await processDeliveries(recent, db, updateCacheCallback);
                    await processAutoEmails(db, sendEmailFunc, updateCacheCallback);
                }
            }
        } catch (error) {
            console.error('❌ [AutoPilot] Cycle Error:', error);
        }
        console.log('🤖 [AutoPilot] Cycle Complete.');
    };

    // Run immediately on startup (with a small delay to ensure server reads are ready)
    setTimeout(runCycle, 10000);

    // Schedule periodic runs
    setInterval(runCycle, CHECK_INTERVAL_MS);
}
