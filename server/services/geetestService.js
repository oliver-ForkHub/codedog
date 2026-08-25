const { GeetestLib } = require('./geetest');
const { SystemConfig, CaptchaStats } = require('../models');
const DbAdapter = require('../utils/dbAdapter');

const GEETEST_ID = process.env.GEETEST_ID || '';
const GEETEST_KEY = process.env.GEETEST_KEY || '';

class GeetestService {
    static async getConfig() {
        // 修复: DB 故障时不再返回 enabled:false(fail-open 安全隐患),
        // 而是抛出异常,由 verify 的 catch 返回 fail-closed 拒绝验证
        const [idConfig, keyConfig, enabledConfig] = await Promise.all([
            DbAdapter.findOne(SystemConfig, { where: { config_key: 'geetest_id' } }),
            DbAdapter.findOne(SystemConfig, { where: { config_key: 'geetest_key' } }),
            DbAdapter.findOne(SystemConfig, { where: { config_key: 'geetest_enabled' } })
        ]);

        const geetestId = (idConfig && idConfig.config_value) || GEETEST_ID;
        const geetestKey = (keyConfig && keyConfig.config_value) || GEETEST_KEY;

        return {
            geetestId,
            geetestKey,
            // 修复 CAPTCHA-H03：enabled 仅表示"整体开关已打开"，不再隐含 id 非空。
            // 配置完整性（id/key 是否非空）由 verify 中的 misconfigured 分支判断，
            // 避免"开关开但缺 id"时 enabled=false 被当作"未启用"直接放行。
            enabled: ((enabledConfig && enabledConfig.config_value) === 'true')
        };
    }

    // 修复: 读取 per-scene 开关。配置 key 为 geetest_<scene> ('true'/'false')。
    // 未配置时默认为 false(不强制验证),只在整体启用 + scene 启用时才需要验证
    static async isSceneEnabled(scene) {
        if (!scene) return false;
        const sceneConfig = await DbAdapter.findOne(SystemConfig, { where: { config_key: `geetest_${scene}` } });
        // 新增的工作室敏感操作默认受保护，避免老站升级后因尚未保存新开关而裸奔。
        if (!sceneConfig && scene === 'studio_management') return true;
        return sceneConfig && sceneConfig.config_value === 'true';
    }

    /**
     * GT4 服务端二次校验。
     * @param {string} scene 验证场景
     * @param {object} payload 前端 initGeetest4 返回的验证参数
     * @param {string} payload.lot_number 验证流水号
     * @param {string} payload.captcha_output 验证输出
     * @param {string} payload.pass_token 校验凭证
     * @param {string|number} payload.gen_time 生成时间戳
     * @param {object} req 请求对象（用于统计）
     */
    static async verify(scene, payload, req) {
        try {
            const config = await this.getConfig();

            if (!config.enabled) {
                // 验证码整体未启用，按设计放行，但记录告警日志便于运维排查
                console.warn('[Geetest] 验证码未启用，所有验证放行');
                return { success: true };
            }

            // 修复: 即使整体启用,per-scene 未启用也放行
            // 这解决"极验整体配置了但发帖没打开验证,用户却被强制要求验证码"的 bug
            const sceneEnabled = await this.isSceneEnabled(scene);
            if (!sceneEnabled) {
                console.log(`[Geetest] scene=${scene} 未开启验证,放行`);
                return { success: true };
            }

            if (!config.geetestId || !config.geetestKey) {
                await this.recordStats(scene, 'misconfigured', req);
                return { success: false, reason: '验证码配置不完整' };
            }

            payload = payload || {};
            const { lot_number, captcha_output, pass_token, gen_time } = payload;

            // 修复: 参数校验提前到 recordStats('verify') 之前,避免统计口径不一致
            if (!lot_number || !captcha_output || !pass_token || !gen_time) {
                await this.recordStats(scene, 'fail', req);
                return { success: false, reason: '请完成验证码验证' };
            }

            await this.recordStats(scene, 'verify', req);

            const geetest = new GeetestLib(config.geetestId, config.geetestKey);
            const result = await geetest.validate({ lot_number, captcha_output, pass_token, gen_time });

            if (result.result === 'success') {
                await this.recordStats(scene, 'pass', req);
                return { success: true };
            }

            await this.recordStats(scene, 'fail', req);
            return { success: false, reason: result.reason || '验证码验证失败' };
        } catch (error) {
            console.error('[Geetest] verify error:', error);
            await this.recordStats(scene, 'error', req);
            return { success: false, reason: '验证码服务异常' };
        }
    }

    static async recordStats(scene, action, req) {
        try {
            await DbAdapter.create(CaptchaStats, {
                type: 'geetest',
                scene: scene || 'global',
                action: action || 'unknown',
                ip: req?.ip || req?.connection?.remoteAddress || 'unknown',
                user_agent: req?.headers?.['user-agent']?.substring(0, 500) || 'unknown'
            });
        } catch (error) {
            console.error('[Geetest] failed to record stats:', error);
        }
    }
}

module.exports = GeetestService;
