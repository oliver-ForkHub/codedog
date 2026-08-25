/**
 * hCaptcha 配置服务（统一入口）
 *
 * 修复 CAPTCHA-H02 / M01 / M03 / M17 / L03：
 *  - 此前 /config、/status、guard 三处对"是否启用"用了三种不同判断，
 *    导致"开关开但缺 Secret"时 /config、/status 告诉客户端"必须验证"，
 *    而守卫实际放行。本服务提供唯一 getConfig()，三端共用同一结果。
 *  - 增加环境变量回退（HCAPTCHA_SITE_KEY / HCAPTCHA_SECRET_KEY），与极验
 *    GEETEST_ID/KEY 行为一致，使部署文档中描述的 env 配置真正生效。
 *  - 有效期（expireMinutes）统一解析并上限 30，对齐 Express session cookie。
 *  - 模块级缓存 + invalidateHcaptchaCache()，替代 middleware 内的缓存，
 *    供 adminController 在任意 hcaptcha_* 配置变更后统一清理。
 */

const { SystemConfig } = require('../models');
const DbAdapter = require('../utils/dbAdapter');

// hCaptcha siteverify 推荐提交预期 sitekey / remoteip，此处仅用于运行时回退
const HCAPTCHA_CACHE_TTL = 60 * 1000;
let configCache = null;
let configCacheExpiry = 0;

/**
 * 解析有效期分钟数。
 * 语义：正整数=通过后 N 分钟免签；0=通过后立即失效（每次操作都需重新验证）；
 * 未配置或非法值=默认 20。上限 30，对齐 session cookie（app.js 中 maxAge=30min），
 * 超过上限视为 20，避免管理员配置 24h 但实际受 cookie 限制最多 30min 的不一致。
 */
function parseExpireMinutes(raw) {
    if (!raw) return 20;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 30) return n;
    return 20;
}

/**
 * 读取 hCaptcha 运行时配置（唯一来源）。
 * 返回 { enabled, siteKey, secretKey, expireMinutes }。
 * enabled = 开关 true 且 siteKey 且 secretKey 均非空（与 guard 历史判定一致）。
 * 注意：DB 故障时抛异常，由上层 guard 的 catch 返回 503 fail-closed，不在此处吞掉。
 */
async function getConfig() {
    const now = Date.now();
    if (configCache && now < configCacheExpiry) {
        return configCache;
    }

    // 环境变量在 getConfig 内读取（而非模块加载时），便于运行时调整与测试，与极验一致
    const ENV_SITE_KEY = process.env.HCAPTCHA_SITE_KEY || '';
    const ENV_SECRET_KEY = process.env.HCAPTCHA_SECRET_KEY || '';

    const [enabledConfig, siteKeyConfig, secretKeyConfig, expireConfig] = await Promise.all([
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_enabled' } }),
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_site_key' } }),
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_secret_key' } }),
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_expire_minutes' } })
    ]);

    const siteKey = (siteKeyConfig && siteKeyConfig.config_value) || ENV_SITE_KEY || '';
    const secretKey = (secretKeyConfig && secretKeyConfig.config_value) || ENV_SECRET_KEY || '';
    const expireMinutes = parseExpireMinutes(expireConfig && expireConfig.config_value);

    configCache = {
        enabled: (enabledConfig && enabledConfig.config_value) === 'true' && !!siteKey && !!secretKey,
        siteKey,
        secretKey,
        expireMinutes
    };
    configCacheExpiry = now + HCAPTCHA_CACHE_TTL;
    return configCache;
}

function invalidateHcaptchaCache() {
    configCache = null;
    configCacheExpiry = 0;
}

module.exports = { getConfig, invalidateHcaptchaCache, parseExpireMinutes };
