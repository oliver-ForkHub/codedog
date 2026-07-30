const fs = require('fs');
const jwt = require('jsonwebtoken');
const cookie = require('cookie');
const config = require('./config');
const { consumeOnce } = require('./replayStore');
const crypto = require('crypto');
const net = require('net');
const { assertAccountActive } = require('./accountStatus');
const { setAccountState } = require('./replayStore');

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
function requestContext(req) {
  const header = name => String(req.headers?.[name] || '').trim().toLowerCase();
  // Host Nginx, Cloudflare and the inner IM Nginx do not always expose the
  // same header as the first choice. Keep all independently supplied
  // candidates and require at least one to match the signed CodeDog hash.
  const ips = [...new Set([
    header('cf-connecting-ip'),
    header('cf-connecting-ipv6'),
    header('true-client-ip'),
    ...header('x-forwarded-for').split(','),
    ...header('x-original-forwarded-for').split(','),
    header('x-real-ip'),
    req.socket?.remoteAddress
  ].map(normalizeIp).filter(Boolean))];
  // Available on navigation, fetch and WebSocket. Only its salted hash is kept.
  const browser = header('user-agent');
  return { ips, browser };
}

function boundHash(nonce, value) { return crypto.createHash('sha256').update(`${nonce}\n${value}`).digest('base64url'); }
function safeEqual(a, b) {
  const left = Buffer.from(String(a || '')), right = Buffer.from(String(b || ''));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}
function contextMatchResult(req, payload) {
  const signedIpHashes = [...new Set([payload.client_ip_hash, ...(Array.isArray(payload.client_ip_hashes) ? payload.client_ip_hashes : [])].filter(Boolean))];
  const signedNetworkHashes = [...new Set(Array.isArray(payload.client_network_hashes) ? payload.client_network_hashes.filter(Boolean) : [])];
  if (!payload.binding_nonce || (!signedIpHashes.length && !signedNetworkHashes.length) || !payload.browser_hash) return { matches: false, ipMatches: false, browserMatches: false, candidateCount: 0, matchType: 'none' };
  const context = requestContext(req);
  const exactMatch = context.ips.some(ip => signedIpHashes.some(hash => safeEqual(hash, boundHash(payload.binding_nonce, ip))));
  const networkMatch = context.ips.map(networkKey).filter(Boolean).some(network => signedNetworkHashes.some(hash => safeEqual(hash, boundHash(payload.binding_nonce, network))));
  const ipMatches = exactMatch || networkMatch;
  const browserMatches = safeEqual(payload.browser_hash, boundHash(payload.binding_nonce, context.browser));
  return { matches: ipMatches && browserMatches, ipMatches, browserMatches, candidateCount: context.ips.length, matchType: exactMatch ? 'exact' : networkMatch ? 'network' : 'none' };
}
function contextMatches(req, payload) { return contextMatchResult(req, payload).matches; }

function readPublicKey() {
  try { return fs.readFileSync(config.publicKeyFile, 'utf8'); }
  catch { return null; }
}

async function exchangeTicket(ticket, req) {
  const publicKey = readPublicKey();
  if (!publicKey) {
    const error = new Error('IM SSO public key is not configured');
    error.statusCode = 503;
    throw error;
  }
  const payload = jwt.verify(ticket, publicKey, {
    algorithms: ['RS256'], issuer: 'codedog-community', audience: 'codedog-im'
  });
  if (payload.purpose !== 'im_sso' || !payload.jti || !payload.sub) throw new Error('Invalid IM ticket');
  const match = contextMatchResult(req, payload);
  if (!match.matches) {
    const diagnosticId = crypto.randomBytes(4).toString('hex').toUpperCase();
    const mismatch = [!match.ipMatches && '网络地址', !match.browserMatches && '浏览器标识'].filter(Boolean).join('、') || '登录环境';
    const error = new Error(`${mismatch}校验不一致，请从编程狗重新进入`);
    error.statusCode = 403;
    error.publicData = { diagnostic_id: diagnosticId, ip_match: match.ipMatches, browser_match: match.browserMatches, ip_candidates: match.candidateCount, network_match_type: match.matchType };
    console.warn(`[IM SSO ${diagnosticId}] binding mismatch ip=${match.ipMatches} browser=${match.browserMatches} candidates=${match.candidateCount} match=${match.matchType}`);
    throw error;
  }
  if (!await consumeOnce(payload.jti, payload.exp * 1000)) {
    const error = new Error('IM ticket has already been used');
    error.statusCode = 409;
    throw error;
  }
  const user = {
    id: Number(payload.sub), username: payload.username, nickname: payload.nickname,
    avatar: payload.avatar, codemao_user_id: payload.codemao_user_id || null,
    role: payload.role, token_version: payload.token_version || 0,
    community_url: payload.community_url || '', community_status_url: payload.community_status_url || '',
    status_token: payload.status_token || '', binding_nonce: payload.binding_nonce,
    client_ip_hash: payload.client_ip_hash, client_ip_hashes: payload.client_ip_hashes || [payload.client_ip_hash], client_network_hashes: payload.client_network_hashes || [], browser_hash: payload.browser_hash
  };
  await setAccountState(user.id, { status: payload.status || 'active', role: user.role, token_version: user.token_version, updated_at: Date.now() });
  const session = jwt.sign({ ...user, type: 'im_session' }, config.sessionSecret, {
    algorithm: 'HS256', issuer: 'codedog-im', audience: 'codedog-im-client', expiresIn: '30m'
  });
  return { session, user, peer: payload.peer || null };
}

function parseSession(req) {
  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.im_session;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, config.sessionSecret, {
      algorithms: ['HS256'], issuer: 'codedog-im', audience: 'codedog-im-client'
    });
    return payload.type === 'im_session' && contextMatches(req, payload) ? payload : null;
  } catch { return null; }
}

async function requireSession(req, res, next) {
  const user = parseSession(req);
  if (!user) return res.status(401).json({ code: 401, msg: '会话已过期或登录环境已变化，请重新从编程狗进入', data: null });
  try { req.user = await assertAccountActive(user); next(); }
  catch (error) { return res.status(error.statusCode || 401).json({ code: error.statusCode || 401, msg: error.message, data: null }); }
}

module.exports = { exchangeTicket, parseSession, requireSession, _test: { normalizeIp, networkKey, boundHash, contextMatchResult } };
