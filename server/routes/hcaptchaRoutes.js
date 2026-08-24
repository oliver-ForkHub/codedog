const express = require('express');
const router = express.Router();
const { SystemConfig, CaptchaStats } = require('../models');
const { successResponse, errorResponse } = require('../middleware/response');
const { HCaptchaService } = require('../services/hcaptcha');
const DbAdapter = require('../utils/dbAdapter');
const { Op } = require('sequelize');
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
        const configs = await DbAdapter.findAll(SystemConfig, {
            where: { config_key: { [Op.in]: ['hcaptcha_enabled', 'hcaptcha_site_key'] } }
        });
        
        const configMap = {};
        configs.forEach(c => {
            configMap[c.config_key] = c.config_value;
        });
        
        const enabled = configMap.hcaptcha_enabled === 'true' && !!configMap.hcaptcha_site_key;
        
        return successResponse(res, {
            enabled,
            site_key: configMap.hcaptcha_site_key || ''
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
        
        const [secretKeyConfig, expireConfig] = await Promise.all([
            DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_secret_key' } }),
            DbAdapter.findOne(SystemConfig, { where: { config_key: 'hcaptcha_expire_minutes' } })
        ]);
        
        if (!secretKeyConfig || !secretKeyConfig.config_value) {
            return errorResponse(res, 'hCaptcha未配置', 500);
        }
        
        // 修复边界 bug: 原 `parseInt(config_value) || 20` 在输入为 "0" 时因 0 是 falsy
        // 会错误回退成默认 20,导致管理员无法关闭"免签窗口"。
        // 语义: 正整数=验证通过后 N 分钟免签; "0"=通过后立即失效(每次操作都需重新验证);
        //       未配置或非法值(=NaN/负数)=用默认 20 分钟。
        let expireMinutes = 20;
        if (expireConfig && expireConfig.config_value) {
            const parsed = parseInt(expireConfig.config_value, 10);
            if (Number.isFinite(parsed) && parsed >= 0) {
                expireMinutes = parsed;
            }
        }
        // expireMinutes 为 0 时, expiresAt = Date.now(),中间件判断 Date.now() < expiresAt 恒为 false,
        // 从而每次请求都会强制重新验证,符合"0 = 关闭免签"的预期。
        
        const hcaptcha = new HCaptchaService(secretKeyConfig.config_value);
        const result = await hcaptcha.verify(token);
        
        if (result.success) {
            const expiresAt = Date.now() + expireMinutes * 60 * 1000;
            
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
        const config = await DbAdapter.findOne(SystemConfig, { 
            where: { config_key: 'hcaptcha_enabled' } 
        });
        
        if (!config || config.config_value !== 'true') {
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
