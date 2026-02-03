/**
 * StoreName Analytics Collector
 * Real-time visitor tracking and analytics system
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// IP Geolocation Cache & Lookup
// ============================================
const geoCache = new Map();
const GEO_CACHE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'analytics-data', 'geo-cache.json');

// Load geo cache from file on startup
function loadGeoCache() {
    try {
        if (fs.existsSync(GEO_CACHE_FILE)) {
            const data = JSON.parse(fs.readFileSync(GEO_CACHE_FILE, 'utf8'));
            Object.entries(data).forEach(([ip, geo]) => geoCache.set(ip, geo));
            console.log(`📍 Loaded ${geoCache.size} cached IP locations`);
        }
    } catch (e) {
        console.error('Error loading geo cache:', e.message);
    }
}

// Save geo cache periodically
function saveGeoCache() {
    try {
        const cacheObj = {};
        geoCache.forEach((v, k) => cacheObj[k] = v);
        fs.writeFileSync(GEO_CACHE_FILE, JSON.stringify(cacheObj, null, 2));
    } catch (e) {
        console.error('Error saving geo cache:', e.message);
    }
}

// Save cache every 5 minutes
setInterval(saveGeoCache, 5 * 60 * 1000);
loadGeoCache();

// Lookup IP location using ip-api.com (free, no key required)
async function getIpLocation(ip) {
    // Skip private/local IPs
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
        return { city: 'Local', region: '', country: 'Local', countryCode: 'LO', isp: 'Local Network' };
    }

    // Check cache first
    if (geoCache.has(ip)) {
        return geoCache.get(ip);
    }

    try {
        // ip-api.com is free for non-commercial use (45 requests/minute)
        const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,countryCode,region,regionName,city,isp,org`);
        const data = await response.json();

        if (data.status === 'success') {
            const location = {
                city: data.city || 'Unknown',
                region: data.regionName || data.region || '',
                country: data.country || 'Unknown',
                countryCode: data.countryCode || '',
                isp: data.isp || data.org || ''
            };
            geoCache.set(ip, location);
            return location;
        }
    } catch (e) {
        console.error(`GeoIP lookup failed for ${ip}:`, e.message);
    }

    // Default fallback
    const fallback = { city: 'Unknown', region: '', country: 'Unknown', countryCode: '', isp: '' };
    geoCache.set(ip, fallback);
    return fallback;
}

// Analytics data file paths
const DATA_DIR = path.join(__dirname, 'analytics-data');
const VISITORS_FILE = path.join(DATA_DIR, 'visitors.json');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const PAGEVIEWS_FILE = path.join(DATA_DIR, 'pageviews.json');
const LOGS_FILE = path.join(DATA_DIR, 'access-logs.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize files if they don't exist
const initFile = (filePath, defaultData = []) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
    }
};

initFile(VISITORS_FILE, { unique: {}, total: 0 });
initFile(SESSIONS_FILE, []);
initFile(PAGEVIEWS_FILE, []);
initFile(LOGS_FILE, []);

// In-memory cache for active sessions (real-time tracking)
const activeSessions = new Map();
const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const ACTIVE_SESSIONS_FILE = path.join(DATA_DIR, 'active-sessions.json');

// Save active sessions to disk
function saveActiveSessions() {
    try {
        const sessions = Array.from(activeSessions.entries());
        fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(sessions, null, 2));
    } catch (e) {
        console.error('Error saving active sessions:', e.message);
    }
}

// Load active sessions from disk
function loadActiveSessions() {
    try {
        if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
            const data = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf8'));
            data.forEach(([id, session]) => activeSessions.set(id, session));
            console.log(`🔄 Restored ${activeSessions.size} active sessions from disk`);
        }
    } catch (e) {
        console.error('Error loading active sessions:', e.message);
    }
}

// Save active sessions every minute
setInterval(saveActiveSessions, 60 * 1000);

// Load on startup
loadActiveSessions();

// ============================================
// IN-MEMORY CACHING FOR PERFORMANCE
// ============================================
let visitorsCache = null;
let pageviewsCache = null;
let sessionsCache = null;
let logsCache = null;
let cacheLastUpdated = 0;
const CACHE_TTL = 30000; // 30 seconds cache

// Write queue for batched file writes (reduces disk I/O)
const writeQueue = new Map();
let writeTimer = null;

// Batched write to disk (runs every 10 seconds)
function flushWriteQueue() {
    writeQueue.forEach((data, filePath) => {
        try {
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error(`Error writing ${filePath}:`, error.message);
        }
    });
    writeQueue.clear();
}

// Schedule batched write
function scheduleWrite(filePath, data) {
    writeQueue.set(filePath, data);
    if (!writeTimer) {
        writeTimer = setTimeout(() => {
            flushWriteQueue();
            writeTimer = null;
        }, 10000); // Flush every 10 seconds
    }
}

// Generate visitor fingerprint from request
function generateFingerprint(req) {
    const data = [
        req.headers['user-agent'] || '',
        req.headers['accept-language'] || '',
        req.headers['accept-encoding'] || '',
        req.ip || req.connection?.remoteAddress || ''
    ].join('|');
    return crypto.createHash('md5').update(data).digest('hex').substring(0, 16);
}

// Parse user agent for device/browser info
function parseUserAgent(ua) {
    if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };

    let browser = 'Unknown';
    let os = 'Unknown';
    let device = 'Desktop';

    // Browser detection
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Edge';
    else if (ua.includes('Chrome')) browser = 'Chrome';
    else if (ua.includes('Safari')) browser = 'Safari';
    else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

    // OS detection
    if (ua.includes('Windows')) os = 'Windows';
    else if (ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    // Device detection
    if (ua.includes('Mobile') || ua.includes('Android') || ua.includes('iPhone')) device = 'Mobile';
    else if (ua.includes('Tablet') || ua.includes('iPad')) device = 'Tablet';

    return { browser, os, device };
}

// Get country from IP (simplified - uses timezone as fallback)
function getLocation(req) {
    // In production, you'd use a GeoIP service
    const timezone = req.headers['x-timezone'] || 'Unknown';
    const language = req.headers['accept-language']?.split(',')[0] || 'Unknown';
    return { timezone, language, country: 'Morocco' }; // Default for local traffic
}

// Read JSON file with caching
function readJsonFile(filePath, forceRefresh = false) {
    const now = Date.now();

    // Check write queue first (for pending writes)
    if (writeQueue.has(filePath)) {
        return writeQueue.get(filePath);
    }

    // Use cache if available and fresh
    if (!forceRefresh && now - cacheLastUpdated < CACHE_TTL) {
        if (filePath === VISITORS_FILE && visitorsCache) return visitorsCache;
        if (filePath === PAGEVIEWS_FILE && pageviewsCache) return pageviewsCache;
        if (filePath === SESSIONS_FILE && sessionsCache) return sessionsCache;
        if (filePath === LOGS_FILE && logsCache) return logsCache;
    }

    try {
        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);

        // Update cache
        if (filePath === VISITORS_FILE) visitorsCache = parsed;
        else if (filePath === PAGEVIEWS_FILE) pageviewsCache = parsed;
        else if (filePath === SESSIONS_FILE) sessionsCache = parsed;
        else if (filePath === LOGS_FILE) logsCache = parsed;

        cacheLastUpdated = now;
        return parsed;
    } catch (error) {
        console.error(`Error reading ${filePath}:`, error.message);
        return filePath.includes('visitors') ? { unique: {}, total: 0 } : [];
    }
}

// Write JSON file with batching (non-blocking)
function writeJsonFile(filePath, data) {
    // Update in-memory cache immediately
    if (filePath === VISITORS_FILE) visitorsCache = data;
    else if (filePath === PAGEVIEWS_FILE) pageviewsCache = data;
    else if (filePath === SESSIONS_FILE) sessionsCache = data;
    else if (filePath === LOGS_FILE) logsCache = data;

    // Schedule batched write to disk
    scheduleWrite(filePath, data);
}

// Clean old data (keep last 30 days)
function cleanOldData() {
    const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

    // Clean sessions
    let sessions = readJsonFile(SESSIONS_FILE);
    sessions = sessions.filter(s => new Date(s.startTime).getTime() > thirtyDaysAgo);
    writeJsonFile(SESSIONS_FILE, sessions);

    // Clean pageviews
    let pageviews = readJsonFile(PAGEVIEWS_FILE);
    pageviews = pageviews.filter(p => new Date(p.timestamp).getTime() > thirtyDaysAgo);
    writeJsonFile(PAGEVIEWS_FILE, pageviews);

    // Clean logs (keep last 7 days for logs)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    let logs = readJsonFile(LOGS_FILE);
    logs = logs.filter(l => new Date(l.timestamp).getTime() > sevenDaysAgo);
    writeJsonFile(LOGS_FILE, logs);
}

// Run cleanup daily
setInterval(cleanOldData, 24 * 60 * 60 * 1000);

// Track a page view
export function trackPageView(req, pagePath, pageTitle) {
    try {
        const now = new Date();
        const fingerprint = generateFingerprint(req);
        const userAgent = parseUserAgent(req.headers['user-agent']);
        const location = getLocation(req);
        const sessionId = req.headers['x-session-id'] || req.body?.sessionId || fingerprint + '-' + now.getTime();

        console.log(`📊 Tracking pageview: ${pagePath} | visitor: ${fingerprint} | session: ${sessionId.substring(0, 8)}...`);

        // Update visitors
        const visitors = readJsonFile(VISITORS_FILE);

        if (!visitors.unique[fingerprint]) {
            visitors.unique[fingerprint] = {
                firstSeen: now.toISOString(),
                lastSeen: now.toISOString(),
                visits: 1,
                ...userAgent,
                ...location
            };
        } else {
            visitors.unique[fingerprint].lastSeen = now.toISOString();
            visitors.unique[fingerprint].visits++;
        }
        visitors.total++;
        writeJsonFile(VISITORS_FILE, visitors);

        // Update active sessions
        let session = activeSessions.get(sessionId);
        if (!session) {
            session = {
                id: sessionId,
                visitorId: fingerprint,
                startTime: now.toISOString(),
                lastActivity: now.toISOString(),
                pageViews: [],
                ...userAgent,
                ...location,
                referrer: req.headers['referer'] || 'Direct',
                ip: req.ip || req.connection?.remoteAddress || 'Unknown'
            };
            activeSessions.set(sessionId, session);
        }

        session.lastActivity = now.toISOString();
        session.pageViews.push({
            path: pagePath,
            title: pageTitle,
            timestamp: now.toISOString()
        });

        // Save pageview
        const pageviews = readJsonFile(PAGEVIEWS_FILE);
        pageviews.push({
            id: crypto.randomUUID(),
            sessionId,
            visitorId: fingerprint,
            path: pagePath,
            title: pageTitle,
            timestamp: now.toISOString(),
            ...userAgent,
            ...location,
            referrer: req.headers['referer'] || 'Direct'
        });

        // Keep only last 10000 pageviews
        if (pageviews.length > 10000) {
            pageviews.splice(0, pageviews.length - 10000);
        }
        writeJsonFile(PAGEVIEWS_FILE, pageviews);

        console.log(`✅ Pageview stored successfully. Total pageviews: ${pageviews.length}`);
        return { sessionId, fingerprint };
    } catch (error) {
        console.error('❌ Error tracking pageview:', error.message);
        return { error: error.message };
    }
}

// Log access request with full technical details
export async function logAccess(req, res, responseTime, requestBody = null) {
    const now = new Date();
    const fingerprint = generateFingerprint(req);
    const userAgent = parseUserAgent(req.headers['user-agent']);

    // Get IP address
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.connection?.remoteAddress || 'Unknown';

    // Get location from IP (cached for efficiency)
    let location = { city: 'Unknown', region: '', country: 'Unknown', countryCode: '', isp: '' };
    try {
        location = await getIpLocation(ip);
    } catch (e) {
        console.error('Location lookup error:', e.message);
    }

    // Capture important headers (sanitized)
    const importantHeaders = {};
    const headersToCapture = [
        'host', 'origin', 'content-type', 'content-length',
        'accept', 'accept-language', 'accept-encoding',
        'cache-control', 'connection', 'cookie', 'authorization',
        'x-forwarded-for', 'x-real-ip', 'x-requested-with',
        'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site'
    ];

    headersToCapture.forEach(header => {
        if (req.headers[header]) {
            // Sanitize sensitive headers
            if (header === 'authorization' || header === 'cookie') {
                importantHeaders[header] = '[REDACTED]';
            } else {
                importantHeaders[header] = req.headers[header];
            }
        }
    });

    // Sanitize request body (remove sensitive data)
    let sanitizedBody = null;
    if (requestBody && typeof requestBody === 'object') {
        sanitizedBody = { ...requestBody };
        // Remove sensitive fields
        const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard', 'cvv', 'cardNumber'];
        sensitiveFields.forEach(field => {
            if (sanitizedBody[field]) sanitizedBody[field] = '[REDACTED]';
        });
        // Truncate large bodies
        const bodyStr = JSON.stringify(sanitizedBody);
        if (bodyStr.length > 2000) {
            sanitizedBody = { _truncated: true, _size: bodyStr.length, _preview: bodyStr.substring(0, 500) + '...' };
        }
    }

    const logEntry = {
        id: crypto.randomUUID(),
        timestamp: now.toISOString(),
        method: req.method,
        path: req.path || req.url,
        fullUrl: req.originalUrl || req.url,
        query: req.query || {},
        statusCode: res.statusCode,
        responseTime: responseTime,
        contentLength: res.get ? res.get('Content-Length') : null,
        ip,
        // Location data
        city: location.city,
        region: location.region,
        country: location.country,
        countryCode: location.countryCode,
        isp: location.isp,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ...userAgent,
        referer: req.headers['referer'] || 'Direct',
        origin: req.headers['origin'] || null,
        host: req.headers['host'] || null,
        visitorId: fingerprint,
        requestHeaders: importantHeaders,
        requestBody: sanitizedBody,
        protocol: req.protocol || 'http',
        secure: req.secure || false
    };

    const logs = readJsonFile(LOGS_FILE);
    logs.push(logEntry);

    // Keep only last 10000 logs (increased for more history)
    if (logs.length > 10000) {
        logs.splice(0, logs.length - 10000);
    }
    writeJsonFile(LOGS_FILE, logs);

    return logEntry;
}

// Get real-time online visitors
export function getOnlineVisitors() {
    const now = Date.now();
    const onlineThreshold = 5 * 60 * 1000; // 5 minutes

    let online = 0;
    const onlineSessions = [];

    activeSessions.forEach((session, id) => {
        const lastActivity = new Date(session.lastActivity).getTime();
        if (now - lastActivity < onlineThreshold) {
            online++;
            onlineSessions.push({
                id: session.id,
                visitorId: session.visitorId,
                currentPage: session.pageViews[session.pageViews.length - 1]?.path || 'Unknown',
                pageCount: session.pageViews.length,
                duration: Math.round((now - new Date(session.startTime).getTime()) / 1000),
                browser: session.browser,
                device: session.device,
                country: session.country
            });
        } else if (now - lastActivity > SESSION_TIMEOUT) {
            // Save expired session and remove from active
            const sessions = readJsonFile(SESSIONS_FILE);
            session.endTime = session.lastActivity;
            session.duration = Math.round((new Date(session.lastActivity).getTime() - new Date(session.startTime).getTime()) / 1000);
            sessions.push(session);
            writeJsonFile(SESSIONS_FILE, sessions);
            activeSessions.delete(id);
        }
    });

    return { count: online, sessions: onlineSessions };
}

// Get analytics summary
export function getAnalyticsSummary(period = 'today') {
    const now = new Date();
    const visitors = readJsonFile(VISITORS_FILE);
    const sessions = readJsonFile(SESSIONS_FILE);
    const pageviews = readJsonFile(PAGEVIEWS_FILE);

    // Calculate period start
    let periodStart;
    switch (period) {
        case '30min':
            periodStart = new Date(now.getTime() - 30 * 60 * 1000);
            break;
        case '1hour':
            periodStart = new Date(now.getTime() - 60 * 60 * 1000);
            break;
        case '3hours':
            periodStart = new Date(now.getTime() - 3 * 60 * 60 * 1000);
            break;
        case '6hours':
            periodStart = new Date(now.getTime() - 6 * 60 * 60 * 1000);
            break;
        case 'today':
            periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'yesterday':
            periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
            break;
        case 'week':
            periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    // Filter data by period
    const periodPageviews = pageviews.filter(p => new Date(p.timestamp) >= periodStart);
    const periodSessions = sessions.filter(s => new Date(s.startTime) >= periodStart);

    // Add active sessions
    const activeSessionsList = [];
    activeSessions.forEach(session => {
        if (new Date(session.startTime) >= periodStart) {
            activeSessionsList.push(session);
        }
    });

    const allPeriodSessions = [...periodSessions, ...activeSessionsList];

    // Calculate unique visitors in period
    const uniqueVisitorsInPeriod = new Set(periodPageviews.map(p => p.visitorId)).size;

    // All pages (sorted by views, no limit)
    const pageCounts = {};
    periodPageviews.forEach(p => {
        const key = p.path;
        pageCounts[key] = (pageCounts[key] || 0) + 1;
    });
    const topPages = Object.entries(pageCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([path, views]) => ({ path, views }));

    // Browser distribution
    const browserCounts = {};
    periodPageviews.forEach(p => {
        browserCounts[p.browser] = (browserCounts[p.browser] || 0) + 1;
    });
    const browsers = Object.entries(browserCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count, percentage: Math.round(count / periodPageviews.length * 100) }));

    // Device distribution
    const deviceCounts = {};
    periodPageviews.forEach(p => {
        deviceCounts[p.device] = (deviceCounts[p.device] || 0) + 1;
    });
    const devices = Object.entries(deviceCounts)
        .sort((a, b) => b[1] - a[1])
        .map(([name, count]) => ({ name, count, percentage: Math.round(count / periodPageviews.length * 100) }));

    // Average session duration
    const avgSessionDuration = allPeriodSessions.length > 0
        ? Math.round(allPeriodSessions.reduce((sum, s) => sum + (s.duration || 0), 0) / allPeriodSessions.length)
        : 0;

    // Pages per session
    const pagesPerSession = allPeriodSessions.length > 0
        ? Math.round((periodPageviews.length / allPeriodSessions.length) * 10) / 10
        : 0;

    // Hourly distribution
    const hourlyViews = Array(24).fill(0);
    periodPageviews.forEach(p => {
        const hour = new Date(p.timestamp).getHours();
        hourlyViews[hour]++;
    });

    // Referrers
    const referrerCounts = {};
    periodPageviews.forEach(p => {
        let ref = p.referrer || 'Direct';
        try {
            if (ref !== 'Direct' && ref.startsWith('http')) {
                ref = new URL(ref).hostname;
            }
        } catch { }
        referrerCounts[ref] = (referrerCounts[ref] || 0) + 1;
    });
    const referrers = Object.entries(referrerCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([source, count]) => ({ source, count }));

    const online = getOnlineVisitors();

    return {
        period,
        timestamp: now.toISOString(),
        realtime: {
            online: online.count,
            activeSessions: online.sessions
        },
        summary: {
            totalPageviews: periodPageviews.length,
            uniqueVisitors: uniqueVisitorsInPeriod,
            totalSessions: allPeriodSessions.length,
            avgSessionDuration,
            pagesPerSession,
            bounceRate: allPeriodSessions.filter(s => (s.pageViews?.length || 0) === 1).length / Math.max(allPeriodSessions.length, 1) * 100
        },
        allTime: {
            totalVisitors: Object.keys(visitors.unique).length,
            totalPageviews: visitors.total
        },
        topPages,
        browsers,
        devices,
        hourlyViews,
        referrers
    };
}

// Parse Nginx log line (combined log format)
function parseNginxLogLine(line) {
    // Nginx combined log format:
    // $remote_addr - $remote_user [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"
    const regex = /^(\S+) - (\S+) \[([^\]]+)\] "(\S+) (\S+) (\S+)" (\d+) (\d+) "([^"]*)" "([^"]*)"/;
    const match = line.match(regex);

    if (!match) return null;

    const [, ip, , timeStr, method, path, protocol, statusCode, bytes, referer, userAgent] = match;

    // Parse timestamp (format: 06/Jan/2026:18:30:45 +0000)
    const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
    const timeParts = timeStr.match(/(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+)/);
    let timestamp = new Date().toISOString();
    if (timeParts) {
        const [, day, month, year, hour, min, sec] = timeParts;
        timestamp = new Date(year, months[month], day, hour, min, sec).toISOString();
    }

    const uaParsed = parseUserAgent(userAgent);

    return {
        id: `nginx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp,
        method,
        path,
        fullUrl: path,
        query: {},
        statusCode: parseInt(statusCode),
        responseTime: 0, // Not available in nginx logs by default
        contentLength: parseInt(bytes) || 0,
        ip,
        userAgent,
        ...uaParsed,
        referer: referer === '-' ? 'Direct' : referer,
        origin: null,
        host: 'your-domain.com',
        visitorId: crypto.createHash('md5').update(ip + userAgent).digest('hex').substring(0, 16),
        source: 'nginx',
        protocol: protocol || 'HTTP/1.1'
    };
}

// Get cached location for IP (sync, for nginx logs)
function getCachedLocation(ip) {
    if (geoCache.has(ip)) {
        return geoCache.get(ip);
    }
    // Queue for async lookup if not cached (fire and forget)
    getIpLocation(ip).catch(() => { });
    return { city: 'Loading...', region: '', country: 'Loading...', countryCode: '', isp: '' };
}

// Read Nginx access logs
function readNginxLogs(maxLines = 5000) {
    const nginxLogPath = '/var/www/your-domain.com/logs/access.log';
    const logs = [];

    try {
        if (!fs.existsSync(nginxLogPath)) {
            console.log('Nginx log file not found:', nginxLogPath);
            return logs;
        }

        const content = fs.readFileSync(nginxLogPath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim());

        // Get last N lines (most recent)
        const recentLines = lines.slice(-maxLines);

        for (const line of recentLines) {
            const parsed = parseNginxLogLine(line);
            if (parsed) {
                // Enrich with cached location data
                const location = getCachedLocation(parsed.ip);
                parsed.city = location.city;
                parsed.region = location.region;
                parsed.country = location.country;
                parsed.countryCode = location.countryCode;
                parsed.isp = location.isp;
                logs.push(parsed);
            }
        }

        console.log(`Read ${logs.length} logs from Nginx`);
    } catch (error) {
        console.error('Error reading Nginx logs:', error.message);
    }

    return logs;
}

// Batch lookup locations for multiple IPs (respects rate limit)
async function batchLookupLocations(ips, maxConcurrent = 40) {
    const uncachedIps = ips.filter(ip => !geoCache.has(ip) && ip && ip !== 'Unknown');
    if (uncachedIps.length === 0) return;

    console.log(`📍 Looking up ${uncachedIps.length} uncached IPs...`);

    // Process all uncached IPs with rate limiting (45/min limit)
    // Using 50ms delay = ~20/sec = 1200/min, but we limit to maxConcurrent per request
    const toProcess = uncachedIps.slice(0, maxConcurrent);
    const lookups = toProcess.map((ip, i) =>
        new Promise(resolve => {
            setTimeout(async () => {
                await getIpLocation(ip).catch(() => { });
                resolve();
            }, i * 50); // Stagger requests by 50ms each
        })
    );

    await Promise.all(lookups);
}

// Get detailed logs (combines API logs and Nginx logs)
export async function getLogs(options = {}) {
    const { limit = 100, offset = 0, method, statusCode, path, sortBy = 'timestamp', sortOrder = 'desc' } = options;

    // Get API logs
    let apiLogs = readJsonFile(LOGS_FILE);
    apiLogs.forEach(log => log.source = 'api');

    // Get Nginx logs
    const nginxLogs = readNginxLogs(10000);

    // Combine logs
    let logs = [...apiLogs, ...nginxLogs];

    // Remove duplicates (same timestamp + path within 1 second)
    const seen = new Set();
    logs = logs.filter(log => {
        const key = `${log.method}-${log.path}-${Math.floor(new Date(log.timestamp).getTime() / 1000)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    // Filter
    if (method) logs = logs.filter(l => l.method === method);
    if (statusCode) {
        const code = parseInt(statusCode);
        if (statusCode.endsWith('xx')) {
            const range = parseInt(statusCode[0]) * 100;
            logs = logs.filter(l => l.statusCode >= range && l.statusCode < range + 100);
        } else {
            logs = logs.filter(l => l.statusCode === code);
        }
    }
    if (path) logs = logs.filter(l => l.path && l.path.toLowerCase().includes(path.toLowerCase()));

    // Sort
    logs.sort((a, b) => {
        let aVal = a[sortBy];
        let bVal = b[sortBy];
        if (sortBy === 'timestamp') {
            aVal = new Date(aVal).getTime();
            bVal = new Date(bVal).getTime();
        }
        if (sortOrder === 'desc') return bVal > aVal ? 1 : -1;
        return aVal > bVal ? 1 : -1;
    });

    // Paginate
    const total = logs.length;
    const paginatedLogs = logs.slice(offset, offset + limit);

    // Collect unique IPs from paginated logs that need location lookup
    const uniqueIps = [...new Set(paginatedLogs.map(l => l.ip).filter(ip => ip && ip !== 'Unknown'))];

    // Pre-fetch locations for uncached IPs - await completion for this request
    await batchLookupLocations(uniqueIps, 50);

    // Update logs with freshly cached locations (now all should be cached)
    paginatedLogs.forEach(log => {
        if (log.ip && geoCache.has(log.ip)) {
            const loc = geoCache.get(log.ip);
            log.city = loc.city;
            log.region = loc.region;
            log.country = loc.country;
            log.countryCode = loc.countryCode;
            log.isp = loc.isp;
        } else if (log.ip && log.ip !== 'Unknown') {
            // Still not cached, mark for display
            log.city = log.city || 'Loading...';
            log.country = log.country || 'Loading...';
        }
    });

    return { logs: paginatedLogs, total, limit, offset };
}

// Get session details
export function getSessionDetails(sessionId) {
    // Check active sessions first
    if (activeSessions.has(sessionId)) {
        return activeSessions.get(sessionId);
    }

    // Check stored sessions
    const sessions = readJsonFile(SESSIONS_FILE);
    return sessions.find(s => s.id === sessionId);
}

// Get all sessions
export function getSessions(options = {}) {
    const { limit = 50, offset = 0, period = 'today' } = options;
    const now = new Date();

    let periodStart;
    switch (period) {
        case 'today':
            periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
        case 'week':
            periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
        case 'month':
            periodStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        default:
            periodStart = new Date(0);
    }

    const storedSessions = readJsonFile(SESSIONS_FILE);
    const allSessions = [];

    // Add active sessions
    activeSessions.forEach(session => {
        allSessions.push({
            ...session,
            status: 'active',
            duration: Math.round((Date.now() - new Date(session.startTime).getTime()) / 1000)
        });
    });

    // Add stored sessions
    storedSessions.forEach(session => {
        allSessions.push({
            ...session,
            status: 'ended'
        });
    });

    // Filter by period
    let filtered = allSessions.filter(s => new Date(s.startTime) >= periodStart);

    // Sort by start time (newest first)
    filtered.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

    const total = filtered.length;
    filtered = filtered.slice(offset, offset + limit);

    return { sessions: filtered, total, limit, offset };
}

// Express middleware for tracking ALL requests
export function analyticsMiddleware(req, res, next) {
    const startTime = Date.now();

    // Capture request body before it's potentially cleared
    const capturedBody = req.body && Object.keys(req.body).length > 0 ? { ...req.body } : null;

    res.on('finish', () => {
        const responseTime = Date.now() - startTime;

        // Log all requests with full details
        logAccess(req, res, responseTime, capturedBody || req.body);
    });

    next();
}

// Track Ping (Heartbeat) to update session duration
export function trackPing(sessionId) {
    const now = new Date();
    if (activeSessions.has(sessionId)) {
        const session = activeSessions.get(sessionId);
        session.lastActivity = now.toISOString();

        // Update total duration in real-time
        session.duration = Math.round((now.getTime() - new Date(session.startTime).getTime()) / 1000);

        // Also update duration in duration-tracking logic
        return { success: true, sessionId, duration: session.duration };
    }
    return { success: false, error: 'Session not found' };
}

// Client-side tracking endpoint handler
export function handleTrackingEvent(req, res) {
    try {
        // Handle both JSON and text body (sendBeacon can send as text)
        let body = req.body;
        if (typeof body === 'string') {
            try {
                body = JSON.parse(body);
            } catch (e) {
                console.warn('Could not parse tracking body as JSON:', body);
            }
        }

        const { event, page, title, sessionId } = body || {};

        // console.log(`📡 Tracking event received: ${event} | page: ${page}`);

        if (event === 'pageview') {
            const result = trackPageView(req, page || req.headers['referer'] || '/', title || 'Unknown');
            res.json({ success: true, ...result });
        } else if (event === 'ping') {
            // Heartbeat to keep session alive and update duration
            const result = trackPing(sessionId);
            res.json(result);
        } else {
            res.json({ success: true, event });
        }
    } catch (error) {
        console.error('❌ Error handling tracking event:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
}

export default {
    trackPageView,
    trackPing,
    logAccess,
    getOnlineVisitors,
    getAnalyticsSummary,
    getLogs,
    getSessionDetails,
    getSessions,
    analyticsMiddleware,
    handleTrackingEvent
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
    saveActiveSessions();
    process.exit(0);
});

process.on('SIGINT', () => {
    saveActiveSessions();
    process.exit(0);
});

