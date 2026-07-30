const DEFAULT_VERSION = '1.1.0';

function parseVersion(value) {
    const match = String(value || '').trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
    return match ? match.slice(1).map(Number) : null;
}

function compareVersions(left, right) {
    const a = parseVersion(left);
    const b = parseVersion(right);
    if (!a || !b) return null;
    for (let index = 0; index < 3; index += 1) {
        if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
    }
    return 0;
}

function getMobileVersionPolicy() {
    const minimum_version = process.env.MOBILE_ANDROID_MIN_VERSION || DEFAULT_VERSION;
    const latest_version = process.env.MOBILE_ANDROID_LATEST_VERSION || minimum_version;
    return {
        platform: 'android',
        minimum_version,
        latest_version,
        update_url: process.env.MOBILE_ANDROID_UPDATE_URL || 'https://github.com/txcxgzs/codedog/releases/download/mobile-latest/codedog-mobile.apk',
        message: process.env.MOBILE_ANDROID_UPDATE_MESSAGE || '当前版本已停止服务，请更新后继续使用。'
    };
}

function mobileVersionGate(req, res, next) {
    const platform = String(req.get('x-app-platform') || '').toLowerCase();
    const version = String(req.get('x-app-version') || '');
    const looksLikeMobile = platform === 'android' || req.path === '/users/mobile/login' || /okhttp/i.test(req.get('user-agent') || '');
    if (!looksLikeMobile) return next();
    const policy = getMobileVersionPolicy();
    const comparison = compareVersions(version, policy.minimum_version);
    if (comparison === null || comparison < 0) {
        return res.status(426).json({ code: 426, msg: policy.message, data: { ...policy, current_version: version || null, force_update: true } });
    }
    return next();
}

module.exports = { compareVersions, getMobileVersionPolicy, mobileVersionGate };
