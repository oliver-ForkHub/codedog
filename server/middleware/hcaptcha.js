/**
 * hCaptcha验证中间件
 */

const { errorResponse } = require('../middleware/response');
const { getConfig, invalidateHcaptchaCache } = require('../services/hcaptchaService');
const { HCaptchaService } = require('../services/hcaptcha');

/**
 * hCaptcha 是否启用的唯一运行时判断（代理到 hcaptchaService.getConfig）。
 * DB 故障时 getConfig 抛异常，由 hcaptchaGuard 的 catch 统一返回 503 fail-closed。
 */
async function isHcaptchaEnabled() {
    const config = await getConfig();
    return config.enabled;
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

/**
 * 服务端 hCaptcha token 二次校验（中间件内复用）。
 * 修复 M03：向 siteverify 提交 remoteip（req.ip）与预期 sitekey（服务端配置，不信任客户端）。
 */
async function verifyHcaptcha(token, secret, siteKey, remoteip) {
    try {
        const hcaptcha = new HCaptchaService(secret, siteKey);
        const result = await hcaptcha.verify(token, { remoteip, sitekey: siteKey });
        return result.success;
    } catch (error) {
        if (error.response) {
            console.error('hCaptcha验证失败:', error.response.status, error.response.data?.success, error.response.data?.['error-codes']);
        } else {
            console.error('hCaptcha验证失败:', error.message);
        }
        return false;
    }
}

module.exports = { hcaptchaGuard, isHcaptchaEnabled, verifyHcaptcha, invalidateHcaptchaCache };
