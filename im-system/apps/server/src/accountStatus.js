const fs = require('fs');
const jwt = require('jsonwebtoken');
const config = require('./config');
const { consumeOnce, setAccountStateIfNewer, getAccountState } = require('./replayStore');

function readPublicKey() { return fs.readFileSync(config.publicKeyFile, 'utf8'); }

async function acceptStatusPush(token) {
  const payload = jwt.verify(String(token || ''), readPublicKey(), {
    algorithms: ['RS256'], issuer: 'codedog-community', audience: 'codedog-im-status-push'
  });
  if (payload.purpose !== 'im_status_push' || !payload.sub || !payload.jti) throw Object.assign(new Error('无效的账号状态通知'), { statusCode: 401 });
  if (!await consumeOnce(`status:${payload.jti}`, payload.exp * 1000)) throw Object.assign(new Error('账号状态通知已处理'), { statusCode: 409 });
  const state = { status: payload.status, role: payload.role, token_version: Number(payload.token_version || 0), event_version: Number(payload.event_version || payload.iat * 1000), updated_at: Date.now() };
  const applied = await setAccountStateIfNewer(Number(payload.sub), state);
  return { userId: Number(payload.sub), state, applied };
}

async function assertAccountActive(user) {
  const state = await getAccountState(user.id);
  if (!state) return user;
  if (state.status !== 'active' || Number(state.token_version || 0) !== Number(user.token_version || 0)) {
    throw Object.assign(new Error('编程狗账号已停用或登录状态已失效'), { statusCode: 401 });
  }
  return { ...user, role: state.role || user.role };
}

module.exports = { acceptStatusPush, assertAccountActive };
