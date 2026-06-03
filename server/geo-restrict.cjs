const geoip = require('geoip-lite');

const jwt = require('jsonwebtoken');

const BLOCKED_MESSAGE =
    'الموقع متاح داخل السعوديه ولا يسمح لمستخدم ال vpn بالدخول';

const VPN_CACHE_TTL_MS = 60 * 60 * 1000;
const vpnCache = new Map();

function isGeoRestrictEnabled() {
    return process.env.GEO_RESTRICT_SA === 'true';
}

function isVpnBlockEnabled() {
    return process.env.GEO_BLOCK_VPN !== 'false';
}

function isPrivateIp(ip) {
    if (!ip) return true;
    const normalized = ip.replace(/^::ffff:/, '');
    if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
        return true;
    }
    if (normalized.startsWith('10.') || normalized.startsWith('192.168.')) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(normalized)) return true;
    return false;
}

function getClientIpFromExpress(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0].trim();
    }
    return req.ip || '';
}

function getClientIpFromRequest(request) {
    const forwarded = request.headers.get('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return (
        request.headers.get('x-real-ip') ||
        request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
        ''
    );
}

function resolveCountry(countryHeader, ip) {
    if (countryHeader) return String(countryHeader).toUpperCase();
    if (!ip || isPrivateIp(ip)) return null;
    const geo = geoip.lookup(ip);
    return geo?.country || null;
}

async function checkProxyOrHosting(ip) {
    if (!ip || isPrivateIp(ip)) return false;

    const cached = vpnCache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.blocked;
    }

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2500);
        const response = await fetch(
            `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,proxy,hosting`,
            { signal: controller.signal }
        );
        clearTimeout(timeout);
        const data = await response.json();
        const blocked =
            data.status === 'success' && (data.proxy === true || data.hosting === true);
        vpnCache.set(ip, { blocked, expiresAt: Date.now() + VPN_CACHE_TTL_MS });
        return blocked;
    } catch {
        return false;
    }
}

async function shouldBlockAccess({ countryHeader, ip }) {
    if (!isGeoRestrictEnabled()) return false;
    if (isPrivateIp(ip) && !countryHeader) return false;

    const country = resolveCountry(countryHeader, ip);
    if (country !== 'SA') return true;

    if (isVpnBlockEnabled() && ip && !isPrivateIp(ip)) {
        return checkProxyOrHosting(ip);
    }

    return false;
}

function getBlockedPageHtml() {
    return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>غير متاح</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Segoe UI", Tahoma, Arial, sans-serif;
      background: linear-gradient(135deg, #f0f4f8 0%, #e2e8f0 100%);
      color: #1e293b;
      padding: 24px;
    }
    .card {
      max-width: 480px;
      width: 100%;
      background: #fff;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      box-shadow: 0 10px 40px rgba(15, 23, 42, 0.1);
      border: 1px solid #e2e8f0;
    }
    .icon {
      width: 64px;
      height: 64px;
      margin: 0 auto 20px;
      background: #fef2f2;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 28px;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 700;
      margin-bottom: 12px;
      color: #0f172a;
    }
    p {
      font-size: 1rem;
      line-height: 1.7;
      color: #475569;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon" aria-hidden="true">🚫</div>
    <h1>تعذّر الوصول</h1>
    <p>${BLOCKED_MESSAGE}</p>
  </div>
</body>
</html>`;
}

function hasStaffAuthToken(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return false;
    try {
        const secret = process.env.JWT_SECRET || 'tvtc-college-scheduler-dev-secret-change-in-production';
        const payload = jwt.verify(token, secret);
        return payload.role === 'manager' || payload.role === 'dept_head';
    } catch {
        return false;
    }
}

function createGeoMiddleware() {
    return async (req, res, next) => {
        if (!isGeoRestrictEnabled()) return next();
        if (req.path === '/api/health') return next();
        if (req.method === 'OPTIONS') return next();
        if (hasStaffAuthToken(req)) return next();

        const countryHeader = req.headers['x-vercel-ip-country'] || null;
        const ip = getClientIpFromExpress(req);
        const blocked = await shouldBlockAccess({ countryHeader, ip });

        if (!blocked) return next();

        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: BLOCKED_MESSAGE });
        }

        return res.status(403).type('html').send(getBlockedPageHtml());
    };
}

module.exports = {
    BLOCKED_MESSAGE,
    shouldBlockAccess,
    getBlockedPageHtml,
    getClientIpFromRequest,
    createGeoMiddleware,
};
