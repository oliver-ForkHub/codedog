/**
 * hCaptcha验证中间件
 */

const DbAdapter = require('../utils/dbAdapter');
const { SystemConfig } = require('../models');
const { errorResponse } = require('../middleware/response');
const axios = require('axios');

let hcaptchaEnabledCache = null;
let hcaptchaCacheExpiry = 0;
const HCAPTCHA_CACHE_TTL = 60 * 1000;

/**
 * 查询 hCaptcha 是否启用
 * 修复 H1 fail-open: DB 故障时抛出异常(不再吞掉),由 hcaptchaGuard 的 catch 统一返回 503,
 * 避免首次调用 cache 为 null 时被当作 false 直接放行
 */
async function isHcaptchaEnabled() {
    const now = Date.now();
    if (hcaptchaEnabledCache !== null && now < hcaptchaCacheExpiry) {
        return hcaptchaEnabledCache;
    }

    // 故意不吞异常:DB 故障应让上层 catch 返回 503,而不是降级为 false 放行
    // 修复: 同时读取 site_key / secret_key,校验 hCaptcha 是否真正"配置完整可用"。
    // 此前只判断 hcaptcha_enabled,导致"开关开着但 site_key 为空"时仍对 /api/*(含管理端)强制 403:
    //   后端全站拦截 → 前端管理后台所有接口读取失败 → 面板全部退化为初始默认值(开关/场景/site_key 全显示关闭或空),
    //   且前端弹窗因 site key 为空抛"未配置"无法完成验证 → 管理员被永久锁死,只能靠终端关 hcaptcha_enabled 恢复。
    const [enabledConfig, siteKeyConfig, secretKeyConfig] = await Promise.all([
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_enabled' } }),
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_site_key' } }),
        DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_secret_key' } })
    ]);
    // 修复: 开启判定 = 开关为 true 且 site_key / secret_key 均非空(与 geetestService.getConfig 的
    // enabled 判定"开关 && id 非空"口径一致)。配置不完整相当于未启用,全站放行对待。
    // 说明: 此处仅针对"配置不完整"这一正常状态放行;DB 读取抛异常等故障仍会走上方注释的 503 fail-closed。
    hcaptchaEnabledCache = !!(enabledConfig && enabledConfig.config_value === 'true'
        && siteKeyConfig && siteKeyConfig.config_value
        && secretKeyConfig && secretKeyConfig.config_value);
    hcaptchaCacheExpiry = now + HCAPTCHA_CACHE_TTL;
    return hcaptchaEnabledCache;
}

async function hcaptchaGuard(req, res, next) {
    if (!req.path.startsWith('/api/')) {
        return next();
    }

    // 管理端( /api/admin )与站点其它 /api 一致,同样受 hCaptcha 全站保护。
    // 若被验证码锁住无法进入后台,可通过服务器终端关闭 hcaptcha_enabled 或临时放行来恢复。
    const excludePaths = [
        '/api/users/login',
        '/api/users/register',
        '/api/users/logout',
        '/api/users/me',  // 修复: /users/me 用于 cookie 登录恢复,不能被 hCaptcha 拦截(否则已登录用户刷新后会永远显示未登录)
        '/api/users/restore-from-impersonate',
        // IM uses a short-lived RSA-signed server credential for this callback.
        // It cannot complete an interactive captcha and is verified by imSso.js.
        '/api/users/im-status',
        '/api/users/im-admin',
        '/api/health',
        '/api/hcaptcha',
        '/api/geetest',
        '/api/public',
        '/api/oauth',
        '/api/open',
        '/api/developer'
    ];

    if (excludePaths.some(p => req.path === p || req.path.startsWith(p + '/'))) {
        return next();
    }

    try {
        const enabled = await isHcaptchaEnabled();
        if (!enabled) {
            return next();
        }

        const verified = req.session?.hcaptchaVerified;
        const expireTime = req.session?.hcaptchaExpires;

        if (verified && expireTime && Date.now() < expireTime) {
            return next();
        }

        return errorResponse(res, '需要完成hCaptcha验证', 403, 'HCAPTCHA_REQUIRED');
    } catch (error) {
        // 修复 H1: DB 故障 fail-closed,返回 503 而非放行
        console.error('hCaptcha中间件错误:', error);
        return errorResponse(res, '验证码服务暂不可用,请稍后重试', 503);
    }
}

async function verifyHcaptcha(token, secret) {
    try {
        // 修复: secret 放在请求体而非 URL params,避免被代理/负载均衡器日志泄露
        const params = new URLSearchParams();
        params.append('secret', secret);
        params.append('response', token);
        const response = await axios.post('https://api.hcaptcha.com/siteverify', params.toString(), {
            timeout: 10000
        });
        // 修复 L9: 日志不再打印整个 response.data,只打印布尔结果,避免泄露
        console.log('[hCaptcha] 验证结果:', response.data?.success);
        // 修复: 统一使用可选链 + 强制布尔值,避免 response.data 为 null 时抛 TypeError
        return !!response.data?.success;
    } catch (error) {
        if (error.response) {
            // 修复: 错误日志不打印完整 response.data,只打印状态码和错误码,避免泄露
            // 修复: hCaptcha API 返回字段名是 error-codes(连字符),不是 error_codes(下划线)
            console.error('hCaptcha验证失败:', error.response.status, error.response.data?.success, error.response.data?.['error-codes']);
        } else {
            console.error('hCaptcha验证失败:', error.message);
        }
        return false;
    }
}

function invalidateHcaptchaCache() {
    hcaptchaEnabledCache = null;
    hcaptchaCacheExpiry = 0;
}

module.exports = { hcaptchaGuard, verifyHcaptcha, invalidateHcaptchaCache };
