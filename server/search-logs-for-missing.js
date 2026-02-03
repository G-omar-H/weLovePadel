
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, 'analytics-data', 'access-logs.json');
const EMAILS = [
    'waf.zemmama@gmail.com',
    'nadiachihab23@gmail.com',
    'ouissamessaadi11@gmail.com',
    'simolaachiri@gmail.com',
    'hajar.amarouch@gmail.com'
];

console.log(`🔍 Scanning ${LOG_FILE} for ${EMAILS.length} sample targets...`);

try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');

    EMAILS.forEach(email => {
        const index = content.indexOf(email);
        if (index !== -1) {
            console.log(`\n✅ FOUND: ${email}`);
            // Context: 500 chars before and after
            const start = Math.max(0, index - 500);
            const end = Math.min(content.length, index + 500);
            console.log('--- Context Start ---');
            console.log(content.substring(start, end));
            console.log('--- Context End ---');
        } else {
            console.log(`❌ NOT FOUND: ${email}`);
        }
    });

} catch (e) {
    console.error(e);
}
