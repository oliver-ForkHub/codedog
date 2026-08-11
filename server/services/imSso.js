const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const net = require('net');
const { normalizePublicHttpUrl } = require('../utils/urlSafety');

function normalizeIp(value) {
  let ip = String(value || '').trim().toLowerCase().replace(/^"|"$/g, '').replace(/^::ffff:/, '');
  if (ip.startsWith('[') && ip.includes(']')) ip = ip.slice(1, ip.indexOf(']'));
  if (net.isIP(ip)) return ip;
  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  return ipv4WithPort && net.isIP(ipv4WithPort[1]) ? ipv4WithPort[1] : '';
}

function ipv6Parts(ip) {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  return [...left, ...Array(missing).fill('0'), ...right].map(part => part.padStart(4, '0'));
}

// Exact addresses remain preferred. The network key tolerates normal carrier/
// Cloudflare address rotation while still preventing a ticket from being used
// from an unrelated network: IPv4 /24, IPv6 /64.
function networkKey(value) {
  const ip = normalizeIp(value);
  const family = net.isIP(ip);
  if (family === 4) return `4:${ip.split('.').slice(0, 3).join('.')}`;
  if (family === 6) {
    const parts = ipv6Parts(ip);
    return parts ? `6:${parts.slice(0, 4).join(':')}` : '';
  }
  return '';
}

function privateKeyPath() {
  const configured = process.env.IM_SSO_PRIVATE_KEY_FILE;
  if (configured) return path.resolve(configured);
  return path.resolve(__dirname, '../../im-system/secrets/im_sso_private.pem');
}

function signingKey() {
  const file = privateKeyPath();
  const encodedKey = String(process.env.IM_SSO_PRIVATE_KEY_BASE64 || '').trim();
  if (!encodedKey && !fs.existsSync(file)) {
    const error = new Error('IM SSO 尚未初始化，请运行 im-system 工具箱生成 SSO 密钥');
    error.statusCode = 503;
    throw error;
  }
  return encodedKey ? Buffer.from(encodedKey, 'base64').toString('utf8') : fs.readFileSync(file, 'utf8');
}

function clientContext(req) {
  const header = name => String(req.get(name) || '').trim().toLowerCase();
  // The community and IM use different reverse-proxy chains. Sign every IP
  // candidate independently supplied by Cloudflare/Nginx so the IM can match
  // the real visitor address without requiring both hosts to expose the same
  // header name. Only salted hashes enter the ticket.
  const ips = [...new Set([
    header('cf-connecting-ip'),
    header('cf-connecting-ipv6'),
    header('true-client-ip'),
    ...header('x-forwarded-for').split(','),
    ...header('x-original-forwarded-for').split(','),
    header('x-real-ip'),
    req.ip,
    req.socket?.remoteAddress
  ].map(normalizeIp).filter(Boolean))];
  // User-Agent is also sent by WebSocket handshakes. Avoid optional Client Hint
  // headers because browsers may send them on navigation but omit them on WS.
  const browser = header('user-agent');
  return { ips, browser };
}

function boundHash(nonce, value) {
  return crypto.createHash('sha256').update(`${nonce}\n${value}`).digest('base64url');
}

function communityPublicUrl(req) {
  const browserOrigins = [req?.get?.('origin'), req?.get?.('referer')];
  for (const value of browserOrigins) {
    try {
      const parsed = new URL(String(value || ''));
      if (['http:', 'https:'].includes(parsed.protocol) && !/^(localhost|127\.0\.0\.1)$/i.test(parsed.hostname)) {
        return parsed.origin;
      }
    } catch { /* Missing or malformed browser origin; continue to proxy headers. */ }
  }
  const forwardedHost = String(req?.get?.('x-forwarded-host') || '').split(',')[0].trim();
  const requestHost = forwardedHost || String(req?.get?.('host') || '').trim();
  // Only accept a plain DNS name/IP with an optional port. This value is
  // rendered into links in IM, so never trust arbitrary forwarded text.
  const safeHost = /^[a-z0-9.-]+(?::\d{1,5})?$/i.test(requestHost) ? requestHost : '';
  const forwardedProto = String(req?.get?.('x-forwarded-proto') || '').split(',')[0].trim().toLowerCase();
  const protocol = ['http', 'https'].includes(forwardedProto) ? forwardedProto : (req?.secure ? 'https' : 'http');
  if (safeHost && !/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(safeHost)) return `${protocol}://${safeHost}`;
  return String(process.env.PUBLIC_URL || process.env.CORS_ORIGIN || '').split(',')[0].replace(/\/$/, '');
}

function createStatusToken(user, key) {
  return jwt.sign({ purpose: 'im_status', token_version: user.token_version || 0 }, key, {
    algorithm: 'RS256', issuer: 'codedog-community', audience: 'codedog-im-status',
    subject: String(user.id), jwtid: crypto.randomUUID(), expiresIn: '35m'
  });
}

function createImTicket(user, context = {}) {
  const key = signingKey();
  const nonce = crypto.randomBytes(18).toString('base64url');
  const requestContext = clientContext(context.req);
  // Use the public origin the browser actually used, not the container's
  // localhost address. IM uses this for profile and return-to-community links.
  const communityUrl = communityPublicUrl(context.req);
  return jwt.sign({
    purpose: 'im_sso',
    username: user.username,
    nickname: user.nickname || user.username,
    avatar: user.avatar || '',
    codemao_user_id: user.codemao_user_id || '',
    role: user.role,
    status: user.status || 'active',
    token_version: user.token_version || 0,
    community_url: communityUrl,
    community_status_url: `${communityUrl}/api/users/im-status`,
    status_token: createStatusToken(user, key),
    binding_nonce: nonce,
    client_ip_hash: boundHash(nonce, requestContext.ips[0] || ''),
    client_ip_hashes: requestContext.ips.map(ip => boundHash(nonce, ip)),
    client_network_hashes: [...new Set(requestContext.ips.map(networkKey).filter(Boolean))].map(network => boundHash(nonce, network)),
    browser_hash: boundHash(nonce, requestContext.browser),
    peer: context.peer ? {
      id: Number(context.peer.id), username: context.peer.username,
      nickname: context.peer.nickname || context.peer.username,
      avatar: context.peer.avatar || '', codemao_user_id: context.peer.codemao_user_id || '',
      role: context.peer.role || 'user'
    } : undefined
  }, key, {
    algorithm: 'RS256', issuer: 'codedog-community', audience: 'codedog-im',
    subject: String(user.id), jwtid: crypto.randomUUID(), expiresIn: '60s'
  });
}

function verifyImStatusToken(token) {
  const payload = jwt.verify(token, crypto.createPublicKey(signingKey()), { algorithms: ['RS256'], issuer: 'codedog-community', audience: 'codedog-im-status' });
  if (payload.purpose !== 'im_status' || !payload.sub) throw new Error('Invalid IM status token');
  return payload;
}

let lastStatusEventVersion = 0;
function nextStatusEventVersion() {
    lastStatusEventVersion = Math.max(Date.now(), lastStatusEventVersion + 1);
    return lastStatusEventVersion;
}

function createImStatusEvent(user) {
  const userId = user.id || user.user_id;
  return jwt.sign({
    purpose: 'im_status_push',
      status: user.status,
      role: user.role,
      token_version: user.token_version || 0,
      event_version: nextStatusEventVersion()
  }, signingKey(), {
    algorithm: 'RS256', issuer: 'codedog-community', audience: 'codedog-im-status-push',
    subject: String(userId), jwtid: crypto.randomUUID(), expiresIn: '5m'
  });
}

function getImPublicUrl() {
  const result = normalizePublicHttpUrl(process.env.IM_PUBLIC_URL, { allowEmpty: true, maxLength: 500 });
  return result.ok && result.value ? result.value.replace(/\/$/, '') : null;
}

module.exports = { createImTicket, createImStatusEvent, getImPublicUrl, verifyImStatusToken };
