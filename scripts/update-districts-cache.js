#!/usr/bin/env node
/**
 * Sendit Districts Cache Updater (Enhanced with Arabic names)
 * 
 * This script fetches all districts from Sendit API and caches them locally.
 * It also fetches detailed info for each district including Arabic names.
 * Run this script weekly (via cron job or manually) to keep the cache fresh.
 * 
 * Usage:
 *   node scripts/update-districts-cache.js
 *   node scripts/update-districts-cache.js --skip-details  # Skip fetching individual district details
 * 
 * Environment variables required:
 *   SENDIT_PUBLIC_KEY - Sendit API public key
 *   SENDIT_SECRET_KEY - Sendit API secret key
 * 
 * Or create a .env file in the project root with these variables.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// Load environment variables from .env if available
try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch (e) {
    // dotenv not installed, continue without it
}

const SENDIT_BASE_URL = 'https://app.sendit.ma/api/v1';
const PUBLIC_KEY = process.env.SENDIT_PUBLIC_KEY || 'YOUR_PUBLIC_KEY';
const SECRET_KEY = process.env.SENDIT_SECRET_KEY || 'YOUR_SECRET_KEY';
const OUTPUT_FILE = path.join(__dirname, '..', 'data', 'sendit-districts.json');
const OUTPUT_FILE_ROOT = path.join(__dirname, '..', 'sendit-districts.json'); // Also copy to root for nginx

// Command line args
const SKIP_DETAILS = process.argv.includes('--skip-details');
const BATCH_SIZE = 10; // Fetch 10 district details at a time
const BATCH_DELAY = 500; // 500ms delay between batches to avoid rate limiting

let authToken = null;

/**
 * Sleep helper
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Make HTTPS request with retry
 */
function httpsRequest(url, options = {}, retries = 3) {
    return new Promise((resolve, reject) => {
        const makeRequest = (attempt) => {
            const req = https.request(url, {
                method: options.method || 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    ...options.headers
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(data));
                    } catch (e) {
                        reject(new Error(`Failed to parse response: ${data}`));
                    }
                });
            });

            req.on('error', (err) => {
                if (attempt < retries) {
                    console.log(`   ⚠️ Request failed, retrying (${attempt + 1}/${retries})...`);
                    setTimeout(() => makeRequest(attempt + 1), 1000);
                } else {
                    reject(err);
                }
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        };

        makeRequest(1);
    });
}

/**
 * Login to Sendit API
 */
async function loginToSendit() {
    console.log('🔐 Logging into Sendit API...');

    const response = await httpsRequest(`${SENDIT_BASE_URL}/login`, {
        method: 'POST',
        body: JSON.stringify({
            public_key: PUBLIC_KEY,
            secret_key: SECRET_KEY
        })
    });

    if (response.success && response.data && response.data.token) {
        authToken = response.data.token;
        console.log('✅ Login successful');
        return true;
    }

    throw new Error(`Login failed: ${JSON.stringify(response)}`);
}

/**
 * Fetch all districts from Sendit API (handles pagination)
 */
async function fetchAllDistricts() {
    console.log('📍 Fetching districts list from Sendit API...');

    const allDistricts = [];
    let currentPage = 1;
    let hasMore = true;

    while (hasMore && currentPage <= 100) { // Safety limit
        console.log(`   Fetching page ${currentPage}...`);

        const response = await httpsRequest(`${SENDIT_BASE_URL}/districts?page=${currentPage}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.success && response.data) {
            let pageDistricts = Array.isArray(response.data)
                ? response.data
                : (response.data.data || []);

            if (pageDistricts.length > 0) {
                allDistricts.push(...pageDistricts);
                const lastPage = response.last_page || 1;
                hasMore = currentPage < lastPage;
                currentPage++;
            } else {
                hasMore = false;
            }
        } else {
            hasMore = false;
        }
    }

    console.log(`✅ Fetched ${allDistricts.length} districts from ${currentPage - 1} pages`);
    return allDistricts;
}

/**
 * Fetch detailed info for a single district
 */
async function fetchDistrictDetails(districtId) {
    try {
        const response = await httpsRequest(`${SENDIT_BASE_URL}/districts/${districtId}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.success && response.data) {
            return response.data;
        }
        return null;
    } catch (error) {
        console.log(`   ⚠️ Failed to fetch details for district ${districtId}: ${error.message}`);
        return null;
    }
}

/**
 * Fetch detailed info for all districts in batches
 */
async function fetchAllDistrictDetails(districts) {
    console.log('');
    console.log('📝 Fetching detailed info for each district (including Arabic names)...');
    console.log(`   This will take approximately ${Math.ceil(districts.length / BATCH_SIZE) * BATCH_DELAY / 1000} seconds...`);

    const detailedDistricts = [];
    let processed = 0;
    let withArabic = 0;
    let pickupDistricts = 0;

    // Process in batches
    for (let i = 0; i < districts.length; i += BATCH_SIZE) {
        const batch = districts.slice(i, i + BATCH_SIZE);

        // Fetch batch in parallel
        const batchPromises = batch.map(async (district) => {
            const details = await fetchDistrictDetails(district.id);

            if (details) {
                // Merge basic district info with detailed info
                const merged = {
                    ...district,
                    arabic_name: details.arabic_name || '',
                    pickup_district: details.pickup_district || 0
                };

                if (merged.arabic_name) withArabic++;
                if (merged.pickup_district === 1) pickupDistricts++;

                return merged;
            }

            // Return original district with empty arabic_name if details fetch failed
            return {
                ...district,
                arabic_name: '',
                pickup_district: 0
            };
        });

        const batchResults = await Promise.all(batchPromises);
        detailedDistricts.push(...batchResults);

        processed += batch.length;
        const progress = Math.round((processed / districts.length) * 100);
        process.stdout.write(`\r   Progress: ${processed}/${districts.length} (${progress}%) - ${withArabic} with Arabic names`);

        // Delay between batches to avoid rate limiting
        if (i + BATCH_SIZE < districts.length) {
            await sleep(BATCH_DELAY);
        }
    }

    console.log(''); // New line after progress
    console.log(`✅ Fetched details for ${detailedDistricts.length} districts`);
    console.log(`   📝 Districts with Arabic names: ${withArabic}`);
    console.log(`   📦 Pickup districts: ${pickupDistricts}`);

    return detailedDistricts;
}

/**
 * Process and organize districts data
 */
function processDistricts(districts) {
    console.log('');
    console.log('🔧 Processing districts data...');

    // Create organized structure
    const processed = {
        meta: {
            lastUpdated: new Date().toISOString(),
            totalDistricts: districts.length,
            version: '2.0', // Updated version for enhanced schema
            schema: {
                id: 'number - District ID',
                name: 'string - District/neighborhood name',
                arabic_name: 'string - Arabic name of district',
                ville: 'string - City name',
                price: 'number - Shipping price in MAD',
                delais: 'string - Delivery time estimate',
                region: 'string - Region name',
                pickup_district: 'number - 1 if pickup available, 0 otherwise'
            }
        },
        districts: [],
        byCity: {},
        byId: {}
    };

    // Process each district
    districts.forEach(district => {
        const entry = {
            id: district.id,
            name: district.name || district.ville || '',
            arabic_name: district.arabic_name || '',
            ville: district.ville || district.name || '',
            price: parseFloat(district.price) || 0,
            delais: district.delais || '3-5 jours',
            region: district.region || '',
            pickup_district: district.pickup_district || 0
        };

        processed.districts.push(entry);
        processed.byId[entry.id] = entry;

        // Group by city
        const city = entry.ville;
        if (!processed.byCity[city]) {
            processed.byCity[city] = [];
        }
        processed.byCity[city].push(entry);
    });

    // Sort districts alphabetically by city then name
    processed.districts.sort((a, b) => {
        const cityCompare = (a.ville || '').localeCompare(b.ville || '');
        if (cityCompare !== 0) return cityCompare;
        return (a.name || '').localeCompare(b.name || '');
    });

    // Get unique cities sorted
    processed.cities = Object.keys(processed.byCity).sort();

    // Count stats
    const withArabic = processed.districts.filter(d => d.arabic_name).length;
    const pickupAvailable = processed.districts.filter(d => d.pickup_district === 1).length;

    console.log(`✅ Processed: ${processed.districts.length} districts in ${processed.cities.length} cities`);
    console.log(`   📝 With Arabic names: ${withArabic}`);
    console.log(`   📦 With pickup: ${pickupAvailable}`);

    return processed;
}

/**
 * Save districts to cache file
 */
function saveCache(data) {
    console.log('');
    console.log(`💾 Saving cache to ${OUTPUT_FILE}...`);

    // Ensure directory exists
    const dir = path.dirname(OUTPUT_FILE);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const jsonContent = JSON.stringify(data, null, 2);

    // Save to data folder
    fs.writeFileSync(OUTPUT_FILE, jsonContent, 'utf8');

    // Also save to root folder for nginx to serve directly
    fs.writeFileSync(OUTPUT_FILE_ROOT, jsonContent, 'utf8');
    console.log(`💾 Also saved to ${OUTPUT_FILE_ROOT}`);

    const stats = fs.statSync(OUTPUT_FILE);
    console.log(`✅ Cache saved (${(stats.size / 1024).toFixed(1)} KB)`);
}

/**
 * Main function
 */
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Sendit Districts Cache Updater v2.0');
    console.log('   (Enhanced with Arabic names & pickup info)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📅 ${new Date().toLocaleString()}`);
    if (SKIP_DETAILS) {
        console.log('⚠️  Running with --skip-details flag (no Arabic names)');
    }
    console.log('');

    try {
        // Step 1: Login
        await loginToSendit();

        // Step 2: Fetch districts list
        const districts = await fetchAllDistricts();

        if (districts.length === 0) {
            throw new Error('No districts returned from API');
        }

        // Step 3: Fetch detailed info for each district (unless skipped)
        let detailedDistricts;
        if (SKIP_DETAILS) {
            console.log('');
            console.log('⏭️  Skipping detailed info fetch (--skip-details flag)');
            detailedDistricts = districts.map(d => ({
                ...d,
                arabic_name: '',
                pickup_district: 0
            }));
        } else {
            detailedDistricts = await fetchAllDistrictDetails(districts);
        }

        // Step 4: Process data
        const processed = processDistricts(detailedDistricts);

        // Step 5: Save cache
        saveCache(processed);

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ Cache update completed successfully!');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    } catch (error) {
        console.error('');
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.error('❌ Cache update failed:', error.message);
        console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        process.exit(1);
    }
}

// Run
main();
