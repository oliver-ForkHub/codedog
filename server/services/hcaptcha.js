/**
 * hCaptcha验证服务
 */

const axios = require('axios');

class HCaptchaService {
    constructor(secretKey, siteKey) {
        this.secretKey = secretKey;
        this.siteKey = siteKey || '';
        this.verifyUrl = 'https://api.hcaptcha.com/siteverify';
    }

    /**
     * @param {string} token 前端回调返回的验证 token
     * @param {object} [opts]
     * @param {string} [opts.remoteip] 用户真实 IP（经可信代理设置后的 req.ip）
     * @param {string} [opts.sitekey] 预期 sitekey（从服务端配置读取，不信任客户端）
     */
    async verify(token, { remoteip, sitekey } = {}) {
        if (!token) {
            return { success: false, reason: '缺少验证token' };
        }

        try {
            const params = new URLSearchParams();
            params.append('secret', this.secretKey);
            params.append('response', token);
            // 修复 M03：提交 remoteip 与预期 sitekey，获得更精确的风险判定并防止跨 sitekey 的 token 兑换。
            // sitekey 优先取调用方传入（来自服务端配置），其次回退构造时的 this.siteKey。
            if (remoteip) params.append('remoteip', remoteip);
            const expectedSitekey = sitekey || this.siteKey;
            if (expectedSitekey) params.append('sitekey', expectedSitekey);

            const response = await axios.post(this.verifyUrl, params.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000
            });

            // 修复：不记录完整响应（可能含敏感信息），只记录关键结果字段
            // 修复：hCaptcha API 错误码字段是 error-codes（连字符），不是 error_codes
            console.log('[hCaptcha] 验证结果:', response.data?.success, response.data?.['error-codes']?.length || 0);

            // 修复: 添加 response.data 空值保护,避免 response.data 为 null 时抛 TypeError
            const data = response.data || {};
            return {
                success: !!data.success,
                score: data.score,
                reason: Array.isArray(data['error-codes']) ? data['error-codes'].join(', ') || null : null
            };
        } catch (error) {
            console.error('hCaptcha验证失败:', error.message);
            return { success: false, reason: '验证服务异常' };
        }
    }
}

module.exports = { HCaptchaService };
