const GeetestService = require('../services/geetestService');
const { errorResponse } = require('./response');
const fs = require('fs');

function cleanupRejectedUpload(req) {
    if (req.file?.path) fs.unlink(req.file.path, () => {});
}

function geetestVerify(scene) {
    return async (req, res, next) => {
        try {
            const resolvedScene = typeof scene === 'function' ? scene(req) : scene;
            // 修复: 不在 middleware 层提前拦截缺失参数,而是交给 GeetestService.verify 统一判断
            // 原因: 极验未启用时 config.enabled=false, verify 会直接放行(success:true),
            //       但原代码的提前拦截会导致"未启用极验也无法发帖"
            const { geetest_lot_number, geetest_captcha_output, geetest_pass_token, geetest_gen_time } = req.body || {};

            const result = await GeetestService.verify(
                resolvedScene,
                {
                    lot_number: geetest_lot_number,
                    captcha_output: geetest_captcha_output,
                    pass_token: geetest_pass_token,
                    gen_time: geetest_gen_time
                },
                req
            );

            if (result.success) {
                // 标记当前请求已通过的场景，避免下游重复消费同一验证码结果。
                req.geetestVerifiedScenes = req.geetestVerifiedScenes || new Set();
                req.geetestVerifiedScenes.add(resolvedScene);
                return next();
            } else {
                cleanupRejectedUpload(req);
                return errorResponse(res, result.reason || '验证码验证失败', 400);
            }
        } catch (error) {
            console.error('验证码验证异常:', error);
            cleanupRejectedUpload(req);
            return errorResponse(res, '验证码服务异常', 500);
        }
    };
}

module.exports = { geetestVerify };
