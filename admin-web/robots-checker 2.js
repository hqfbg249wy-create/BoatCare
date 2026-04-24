/**
 * BoatCare robots.txt Checker
 * Prüft ob eine Website gecrawlt werden darf.
 * Wird in app.js eingebunden.
 */

const robotsCache = new Map(); // URL-Origin → { allowed, reason, expires }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 Minuten

/**
 * Parst den robots.txt Inhalt und prüft ob eine URL erlaubt ist.
 * Unterstützt: User-agent: *, Disallow, Allow (mit Priorität)
 */
function parseRobotsTxt(content, targetPath) {
    const lines = content.split('\n').map(l => l.split('#')[0].trim()).filter(l => l);
    let inRelevantSection = false;
    let rules = []; // { type: 'allow'|'disallow', path: string }

    for (const line of lines) {
        const lower = line.toLowerCase();
        if (lower.startsWith('user-agent:')) {
            const agent = line.split(':')[1].trim();
            inRelevantSection = (agent === '*');
        } else if (inRelevantSection) {
            if (lower.startsWith('disallow:')) {
                const path = line.split(':').slice(1).join(':').trim();
                rules.push({ type: 'disallow', path });
            } else if (lower.startsWith('allow:')) {
                const path = line.split(':').slice(1).join(':').trim();
                rules.push({ type: 'allow', path });
            }
        }
    }

    // Längster passender Pfad hat Priorität (robots.txt Standard)
    let bestMatch = null;
    for (const rule of rules) {
        if (!rule.path || targetPath.startsWith(rule.path)) {
            if (!bestMatch || rule.path.length > bestMatch.path.length) {
                bestMatch = rule;
            }
        }
    }

    if (!bestMatch || bestMatch.type === 'allow') {
        return { allowed: true };
    }
    if (bestMatch.path === '' || bestMatch.path === '/') {
        return { allowed: false, disallowPath: bestMatch.path };
    }
    return { allowed: bestMatch.type === 'allow', disallowPath: bestMatch.path };
}

/**
 * Prüft ob eine URL laut robots.txt gecrawlt werden darf.
 * @param {string} url - Ziel-URL
 * @returns {Promise<{allowed: boolean, reason: string, robotsUrl: string}>}
 */
async function checkRobotsTxt(url) {
    try {
        const parsed = new URL(url);
        const origin = parsed.origin;
        const targetPath = parsed.pathname || '/';
        const robotsUrl = `${origin}/robots.txt`;

        // Cache prüfen
        const cached = robotsCache.get(origin);
        if (cached && cached.expires > Date.now()) {
            return { ...cached.result, reason: cached.result.reason + ' (gecacht)' };
        }

        let result;
        try {
            const response = await fetch(robotsUrl, {
                signal: AbortSignal.timeout(5000)
            });

            if (response.status === 404) {
                result = {
                    allowed: true,
                    reason: 'Kein robots.txt vorhanden – Crawling erlaubt',
                    robotsUrl
                };
            } else if (!response.ok) {
                result = {
                    allowed: true,
                    reason: `robots.txt nicht abrufbar (HTTP ${response.status}) – Crawling erlaubt`,
                    robotsUrl
                };
            } else {
                const content = await response.text();
                const parsed = parseRobotsTxt(content, targetPath);

                if (parsed.allowed) {
                    result = {
                        allowed: true,
                        reason: 'Crawling laut robots.txt erlaubt',
                        robotsUrl
                    };
                } else {
                    const blockedPath = parsed.disallowPath || '/';
                    result = {
                        allowed: false,
                        reason: `Crawling verboten: Disallow: ${blockedPath} in robots.txt`,
                        robotsUrl
                    };
                }
            }
        } catch (fetchErr) {
            // Timeout oder Netzwerkfehler → erlaubt
            result = {
                allowed: true,
                reason: `robots.txt nicht erreichbar – Crawling erlaubt (${fetchErr.message})`,
                robotsUrl
            };
        }

        // In Cache speichern
        robotsCache.set(origin, { result, expires: Date.now() + CACHE_TTL_MS });
        return result;

    } catch (e) {
        return {
            allowed: false,
            reason: `Ungültige URL: ${e.message}`,
            robotsUrl: ''
        };
    }
}

/**
 * Zeigt robots.txt Status als farbiges Badge an.
 * @param {object} result - Rückgabe von checkRobotsTxt()
 * @returns {string} HTML-String
 */
function robotsStatusBadge(result) {
    if (result.allowed) {
        return `<span style="color:#16a34a; font-weight:600;">✅ Erlaubt</span>
                <span style="font-size:11px; color:#666;"> – ${result.reason}</span>`;
    } else {
        return `<span style="color:#dc2626; font-weight:600;">🚫 Verboten</span>
                <span style="font-size:11px; color:#666;"> – ${result.reason}</span>`;
    }
}

// Global verfügbar machen
window.checkRobotsTxt = checkRobotsTxt;
window.robotsStatusBadge = robotsStatusBadge;
