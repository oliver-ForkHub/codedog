const axios = require('axios');
const crypto = require('crypto');

/**
 * 极验4 (GeeTest4 / GT4) 服务端接入
 *
 * 协议说明（依据极验官方文档 gcaptcha4.geetest.com/validate）：
 *   1. 前端通过 initGeetest4({ captchaId, product }) 初始化，captchaId 即配置的 captcha_id。
 *   2. 用户完成滑动验证后，前端回调 getValidate() 返回四个参数：
 *        lot_number    —— 本次验证的流水号（原始消息）
 *        captcha_output —— 验证输出
 *        pass_token    —— 校验凭证
 *        gen_time      —— 生成时间戳
 *   3. 服务端拿到这四个参数后，用标准 HMAC-SHA256 生成签名：
 *         sign_token = HMAC_SHA256(message = lot_number, key = 客户验证私钥 captcha_key)
 *   4. 将 captcha_id 放在 URL query，将 lot_number / captcha_output / pass_token / gen_time / sign_token
 *      以 application/x-www-form-urlencoded POST 到
 *        https://gcaptcha4.geetest.com/validate?captcha_id=xxx
 *   5. 响应 { result: "success", reason, captcha_args }，result === "success" 表示通过，
 *      其余（"fail" 或异常）一律视为未通过。
 */
const geetestHttp = axios.create({
    baseURL: 'https://gcaptcha4.geetest.com',
    timeout: 8000,
    maxRedirects: 0,
    proxy: false,
    validateStatus: status => status >= 200 && status < 300
});

class GeetestLib {
    constructor(captchaId, privateKey) {
        this.captchaId = captchaId;
        this.privateKey = privateKey;
    }

    /**
     * GT4 前端只需要 captcha_id 即可初始化 initGeetest4，无需像旧版那样
     * 向极验注册一次临时 challenge。此处直接返回配置的 captcha_id。
     * @returns {{code: number, captcha_id: string, success: 1}}
     */
    async register() {
        if (!this.captchaId) {
            return { code: 0, captcha_id: '', success: 0 };
        }
        return { code: 1, captcha_id: this.captchaId, success: 1 };
    }

    /**
     * 服务端二次校验（GT4 标准鉴权）。
     * @param {object} ctx 前端 initGeetest4 回调返回的验证结果
     * @param {string} ctx.lot_number 验证流水号（HMAC 原始消息）
     * @param {string} ctx.captcha_output 验证输出
     * @param {string} ctx.pass_token 校验凭证
     * @param {string|number} ctx.gen_time 生成时间戳
     * @returns {{result: 'success'|'fail', reason: string}}
     */
    async validate({ lot_number, captcha_output, pass_token, gen_time } = {}) {
        if (!lot_number || !captcha_output || !pass_token || !gen_time) {
            return { result: 'fail', reason: '参数错误' };
        }

        try {
            // 官方签名规则：sign_token = HMAC-SHA256(message=lot_number, key=privateKey)，hex 编码
            const signToken = crypto
                .createHmac('sha256', this.privateKey)
                .update(String(lot_number))
                .digest('hex');

            const body = new URLSearchParams({
                lot_number: String(lot_number),
                captcha_output: String(captcha_output),
                pass_token: String(pass_token),
                gen_time: String(gen_time),
                sign_token: signToken
            });

            const response = await geetestHttp.post('/validate', body.toString(), {
                // captcha_id 放在 URL query（官方推荐做法）
                params: { captcha_id: this.captchaId },
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            const data = response.data || {};
            // 官方判定：result === 'success' 为通过，其余均视为失败
            if (data.result === 'success') {
                return { result: 'success', reason: '验证成功' };
            }
            return { result: 'fail', reason: data.reason || data.msg || '验证失败' };
        } catch (error) {
            // 文档 5.3：高风险动作建议失败关闭——极验接口异常时拒绝业务
            console.error('[Geetest4] validate failed:', error.message);
            return { result: 'fail', reason: '验证服务异常' };
        }
    }
}

module.exports = { GeetestLib };