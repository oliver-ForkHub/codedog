const { createClient } = require('redis');
const config = require('./config');

const local = new Map();
const localAccounts = new Map();
const localRates = new Map();
let client = null;

async function connectReplayStore() {
  if (!config.redisUrl || client) return;
  client = createClient({ url: config.redisUrl });
  client.on('error', error => console.error('IM Redis error:', error.message));
  await client.connect();
}

async function consumeOnce(jti, expiresAtMs) {
  const ttl = Math.max(1000, expiresAtMs - Date.now());
  if (client?.isReady) return (await client.set(`im:sso:jti:${jti}`, '1', { NX: true, PX: ttl })) === 'OK';
  const now = Date.now();
  for (const [key, expiresAt] of local) if (expiresAt <= now) local.delete(key);
  if (local.has(jti)) return false;
  local.set(jti, expiresAtMs);
  return true;
}

async function setAccountState(userId, state) {
  const value = JSON.stringify(state);
  if (client?.isReady) await client.set(`im:account:state:${Number(userId)}`, value);
  localAccounts.set(Number(userId), state);
}

async function setAccountStateIfNewer(userId, state) {
  const key = `im:account:state:${Number(userId)}`;
  if (client?.isReady) {
    const script = `
      local current = redis.call('GET', KEYS[1])
      if current then
        local decoded = cjson.decode(current)
        if tonumber(decoded.event_version or 0) >= tonumber(ARGV[2]) then return 0 end
      end
      redis.call('SET', KEYS[1], ARGV[1])
      return 1`;
    const applied = await client.eval(script, { keys: [key], arguments: [JSON.stringify(state), String(state.event_version || 0)] });
    if (!applied) return false;
  } else {
    const current = localAccounts.get(Number(userId));
    if (current && Number(current.event_version || 0) >= Number(state.event_version || 0)) return false;
  }
  localAccounts.set(Number(userId), state);
  return true;
}

async function consumeRateLimit(key, limit, windowMs) {
  const normalized = `im:rate:${String(key)}`;
  if (client?.isReady) {
    const script = `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
      if count > tonumber(ARGV[2]) then return 0 end
      return 1`;
    return !!(await client.eval(script, { keys: [normalized], arguments: [String(windowMs), String(limit)] }));
  }
  const now = Date.now();
  const current = localRates.get(normalized);
  const entry = !current || current.expiresAt <= now ? { count: 0, expiresAt: now + windowMs } : current;
  entry.count += 1;
  localRates.set(normalized, entry);
  return entry.count <= limit;
}

async function getAccountState(userId) {
  if (client?.isReady) {
    const value = await client.get(`im:account:state:${Number(userId)}`);
    if (value) return JSON.parse(value);
  }
  return localAccounts.get(Number(userId)) || null;
}

module.exports = { connectReplayStore, consumeOnce, setAccountState, setAccountStateIfNewer, getAccountState, consumeRateLimit };
