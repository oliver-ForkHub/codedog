function normalizeHttpUrl(value, { allowEmpty = true, maxLength = 500 } = {}) {
    const raw = value == null ? '' : String(value).trim();
    if (!raw) return allowEmpty ? { ok: true, value: null } : { ok: false, msg: 'URL不能为空' };
    if (raw.length > maxLength) return { ok: false, msg: `URL不能超过${maxLength}字` };

    let url;
    try {
        url = new URL(raw);
    } catch {
        return { ok: false, msg: 'URL格式不正确' };
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
        return { ok: false, msg: 'URL只允许使用HTTP或HTTPS协议' };
    }
    if (url.username || url.password) {
        return { ok: false, msg: 'URL不能包含账号或密码' };
    }

    return { ok: true, value: url.toString() };
}

function normalizePublicHttpUrl(value, { allowEmpty = true, maxLength = 500 } = {}) {
    const result = normalizeHttpUrl(value, { allowEmpty, maxLength });
    if (!result.ok || !result.value) return result;

    const url = new URL(result.value);
    const isLocalhost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && isLocalhost)) {
        return { ok: false, msg: '公开URL必须使用HTTPS（本地开发可使用HTTP localhost）' };
    }
    return result;
}

module.exports = { normalizeHttpUrl, normalizePublicHttpUrl };
