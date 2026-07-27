const axios = require('axios');
const crypto = require('crypto');

const geetestHttp = axios.create({
    baseURL: 'https://api.geetest.com',
    timeout: 8000,
    maxRedirects: 0,
    proxy: false,
    validateStatus: status => status >= 200 && status < 300
});

function md5(value) {
    return crypto.createHash('md5').update(String(value)).digest('hex');
}

class GeetestLib {
    constructor(captchaId, privateKey) {
        this.captchaId = captchaId;
        this.privateKey = privateKey;
        this.lastRegisterSuccess = true;
    }

    async register() {
        try {
            const response = await geetestHttp.get('/register.php', {
                params: {
                    gt: this.captchaId,
                    json_format: 1,
                    sdk: 'Node_codedog',
                    digestmod: 'md5',
                    client_type: 'unknown',
                    ip_address: 'unknown'
                }
            });
            if (!response.data?.challenge) throw new Error('Missing Geetest challenge');
            this.lastRegisterSuccess = true;
            return {
                success: 1,
                gt: this.captchaId,
                challenge: md5(response.data.challenge + this.privateKey),
                new_captcha: true
            };
        } catch (error) {
            console.error('[Geetest] register failed, switching to fallback mode:', error.message);
            this.lastRegisterSuccess = false;
            return { success: 0, gt: this.captchaId, challenge: this._randomStr(), new_captcha: true };
        }
    }

    async validate(challenge, validate, seccode) {
        if (!challenge || !validate || !seccode) {
            return { result: 'fail', reason: '参数错误' };
        }

        if (!this.lastRegisterSuccess) {
            return { result: 'fail', reason: '验证服务暂不可用，请稍后重试' };
        }

        if (validate !== md5(this.privateKey + 'geetest' + challenge)) {
            return { result: 'fail', reason: '验证失败' };
        }

        try {
            const body = new URLSearchParams({
                captchaid: this.captchaId,
                gt: this.captchaId,
                challenge,
                seccode,
                json_format: '1',
                sdk: 'Node_codedog'
            });
            const response = await geetestHttp.post('/validate.php', body.toString(), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            return response.data?.seccode === md5(seccode)
                ? { result: 'success', reason: '验证成功' }
                : { result: 'fail', reason: '验证失败' };
        } catch (error) {
            console.error('[Geetest] validate failed:', error.message);
            return { result: 'fail', reason: '验证服务异常' };
        }
    }

    _randomStr() {
        return crypto.randomBytes(16).toString('hex');
    }
}

module.exports = { GeetestLib };
