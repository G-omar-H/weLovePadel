/**
 * StoreName Custom Analytics Tracker
 * Client-side script to track pageviews and send to custom analytics backend
 */

(function () {
    'use strict';

    // Configuration
    const ANALYTICS_ENDPOINT = '/api/analytics/track';
    const SESSION_KEY = 'storename_session_id';
    const SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

    // Generate or get session ID
    function getSessionId() {
        let sessionData = null;
        try {
            sessionData = JSON.parse(localStorage.getItem(SESSION_KEY));
        } catch (e) { }

        const now = Date.now();

        if (sessionData && (now - sessionData.lastActivity) < SESSION_DURATION) {
            sessionData.lastActivity = now;
            localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
            return sessionData.id;
        }

        // Create new session
        const newSession = {
            id: generateId(),
            startTime: now,
            lastActivity: now
        };
        localStorage.setItem(SESSION_KEY, JSON.stringify(newSession));
        return newSession.id;
    }

    // Generate unique ID
    function generateId() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // Track pageview
    function trackPageview() {
        const sessionId = getSessionId();
        const data = {
            event: 'pageview',
            page: window.location.pathname + window.location.search,
            title: document.title,
            sessionId: sessionId,
            referrer: document.referrer,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            language: navigator.language
        };

        // Send tracking data
        if (navigator.sendBeacon) {
            navigator.sendBeacon(ANALYTICS_ENDPOINT, JSON.stringify(data));
        } else {
            fetch(ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                keepalive: true
            }).catch(() => { });
        }
    }

    // Track on page load
    if (document.readyState === 'complete') {
        trackPageview();
    } else {
        window.addEventListener('load', trackPageview);
    }

    // Track on history changes (SPA support)
    const originalPushState = history.pushState;
    history.pushState = function () {
        originalPushState.apply(this, arguments);
        trackPageview();
    };

    window.addEventListener('popstate', trackPageview);

    // Heartbeat (Ping) Mechanism - Sends a ping every 30 seconds
    setInterval(() => {
        const sessionId = getSessionId();
        // Only ping if tab is visible/focused to avoid noise? 
        // Actually for duration we want true open time.
        if (document.hidden) return; // Optional: Only track active time? User asked for "accurate session timing".
        // Usually simply being open is counted, but "active" is better. Let's keep it simple for now (all open tabs).

        const data = {
            event: 'ping',
            sessionId: sessionId,
            page: window.location.pathname
        };

        if (navigator.sendBeacon) {
            navigator.sendBeacon(ANALYTICS_ENDPOINT, JSON.stringify(data));
        } else {
            fetch(ANALYTICS_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                keepalive: true
            }).catch(() => { });
        }
    }, 30000); // 30 seconds

    // Expose for manual tracking
    window.StoreNameAnalytics = {
        track: trackPageview,
        getSessionId: getSessionId
    };

    console.log('StoreName Analytics: Initialized');
})();

