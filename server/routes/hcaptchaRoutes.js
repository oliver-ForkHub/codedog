const express = require('express');
const router = express.Router();
const { CaptchaStats } = require('../models');
const { successResponse, errorResponse } = require('../middleware/response');
const { HCaptchaService } = require('../services/hcaptcha');
const hcaptchaService = require('../services/hcaptchaService');
const DbAdapter = require('../utils/dbAdapter');
const { createRateLimiter } = require('../middleware/rateLimit');

const hcaptchaVerifyRateLimit = createRateLimiter({
    windowMs: 60 * 1000,
    max: 10,
    keyPrefix: 'hcaptcha-verify',
    keyGenerator: req => req.ip || req.connection?.remoteAddress || 'unknown'
});

async function recordStats(type, scene, action, req) {
    try {
        await DbAdapter.create(CaptchaStats, {
            type,
            scene,
            action,
            ip: req.ip || req.connection?.remoteAddress,
            user_agent: req.headers['user-agent']?.substring(0, 500)
        });
    } catch (e) {
        console.error('记录验证码统计失败:', e);
    }
}

router.get('/config', async (req, res) => {
    try {
        // 修复 CAPTCHA-H02：enabled 统一取自 hcaptchaService.getConfig，
        // 与 /status、guard 三端共用同一判断（开关 + siteKey + secretKey 全有）。
        const config = await hcaptchaService.getConfig();
        return successResponse(res, {
            enabled: config.enabled,
            site_key: config.siteKey
        });
    } catch (error) {
        console.error('获取hCaptcha配置错误:', error);
        return errorResponse(res, '获取配置失败', 500);
    }
});

router.post('/show', async (req, res) => {
    try {
        const { scene } = req.body;
        await recordStats('hcaptcha', scene || 'global', 'show', req);
        return successResponse(res, null, '记录成功');
    } catch (error) {
        console.error('记录展示错误:', error);
        return errorResponse(res, '记录失败', 500);
    }
});

router.post('/verify', hcaptchaVerifyRateLimit, async (req, res) => {
    let scene = 'global';
    try {
        const { token, scene: reqScene } = req.body;
        scene = reqScene || 'global';

        if (!token) {
            await recordStats('hcaptcha', scene || 'global', 'fail', req);
            return errorResponse(res, '请完成验证', 400);
        }

        // 修复 CAPTCHA-H02 / M03 / L03：配置统一从 hcaptchaService 读取，
        // verify 提交 remoteip 与服务端配置的 sitekey（不信任客户端）。
        const config = await hcaptchaService.getConfig();
        if (!config.enabled || !config.secretKey) {
            return errorResponse(res, 'hCaptcha未配置', 500);
        }

        const hcaptcha = new HCaptchaService(config.secretKey, config.siteKey);
        const result = await hcaptcha.verify(token, {
            remoteip: req.ip,
            sitekey: config.siteKey
        });

        if (result.success) {
            // expireMinutes：0=通过后立即失效（每次操作都需重新验证）；正整数=N 分钟免签。
            const expiresAt = Date.now() + config.expireMinutes * 60 * 1000;

            req.session.hcaptchaVerified = true;
            req.session.hcaptchaExpires = expiresAt;

            await recordStats('hcaptcha', scene || 'global', 'pass', req);

            return successResponse(res, {
                verified: true,
                expires_at: expiresAt
            });
        } else {
            await recordStats('hcaptcha', scene || 'global', 'block', req);
            return errorResponse(res, '验证失败: ' + (result.reason || '请重试'), 400);
        }
    } catch (error) {
        console.error('hCaptcha验证错误:', error);
        await recordStats('hcaptcha', scene || 'global', 'block', req);
        return errorResponse(res, '验证失败', 500);
    }
});

router.get('/status', async (req, res) => {
    try {
        // 修复 CAPTCHA-H02：required 统一取自 hcaptchaService.getConfig().enabled，
        // 不再仅凭 hcaptcha_enabled 开关，与 /config、guard 一致。
        const config = await hcaptchaService.getConfig();
        if (!config.enabled) {
            return successResponse(res, { required: false });
        }

        const now = Date.now();
        const expires = req.session.hcaptchaExpires;
        const verified = req.session.hcaptchaVerified && expires && now < expires;

        return successResponse(res, {
            required: true,
            verified: !!verified,
            expires_at: expires || null
        });
    } catch (error) {
        console.error('检查hCaptcha状态错误:', error);
        return errorResponse(res, '检查失败', 500);
    }
});

module.exports = router;
