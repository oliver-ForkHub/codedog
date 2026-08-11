const path = require('path');
const crypto = require('crypto');

const root = path.resolve(__dirname, '../../..');
require('dotenv').config({ path: path.join(root, '.env') });

function resolvePath(value, fallback) {
  const target = value || fallback;
  return path.isAbsolute(target) ? target : path.resolve(root, target);
}

const production = process.env.NODE_ENV === 'production';
const configuredSessionSecret = process.env.IM_SESSION_SECRET || '';
if (production && configuredSessionSecret.length < 32) {
  throw new Error('IM_SESSION_SECRET must contain at least 32 characters in production');
}
if (production && !process.env.IM_REDIS_URL) throw new Error('IM_REDIS_URL is required in production');
if (production && !process.env.IM_PUBLIC_ORIGIN) throw new Error('IM_PUBLIC_ORIGIN is required in production');

module.exports = {
  root,
  production,
  port: Number(process.env.IM_PORT || 3100),
  publicOrigins: [process.env.IM_PUBLIC_ORIGIN, process.env.IM_ADMIN_ORIGIN].filter(Boolean),
  sessionSecret: configuredSessionSecret || crypto.createHash('sha256').update(`codedog-im-local:${root}`).digest('hex'),
  publicKeyFile: resolvePath(process.env.IM_SSO_PUBLIC_KEY_FILE, 'secrets/im_sso_public.pem'),
  // 默认连接同机编程狗服务；高级部署仍可显式覆盖，但安装时无需询问。
  communityInternalUrl: String(process.env.IM_COMMUNITY_INTERNAL_URL || 'http://host.docker.internal:3001').replace(/\/$/, ''),
  databaseUrl: process.env.IM_DATABASE_URL || 'memory:',
  redisUrl: process.env.IM_REDIS_URL || '',
  groupDefaultLimit: Number(process.env.IM_GROUP_DEFAULT_LIMIT || 100),
  groupHardLimit: Number(process.env.IM_GROUP_HARD_LIMIT || 5000)
  , maxSocketsPerUser: Math.max(1, Number(process.env.IM_MAX_SOCKETS_PER_USER || 5))
  , wsFramesPerMinute: Math.max(10, Number(process.env.IM_WS_FRAMES_PER_MINUTE || 120))
  , messagesPerMinute: Math.max(5, Number(process.env.IM_MESSAGES_PER_MINUTE || 30))
  , uploadsPerTenMinutes: Math.max(1, Number(process.env.IM_UPLOADS_PER_TEN_MINUTES || 10))
};
