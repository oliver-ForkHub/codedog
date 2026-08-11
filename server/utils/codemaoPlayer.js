'use strict';

/**
 * 编程猫作品播放器规则：
 * - Kitten3、Kitten4、Neko（KittenN）和 Wood（Python）都属于 Kitten 系列，
 *   但它们是不同型号，播放器 URL 必须按具体型号选择，不能统一生成 Kitten4 地址。
 * - Nemo 和 Neko 是两个不同的编辑器，严禁把 NEKO 规范化为 NEMO。
 * - https://api.codemao.cn/creation-tools/v1/works/ 返回的 player_url 是权威播放地址；
 *   导入作品、用户登录同步和后台主动抓取时都必须优先原样保存该字段。
 * - 只有 API 没有返回 player_url 时，才按下面的具体型号生成兜底地址。
 */
const FALLBACK_BASE_URLS = Object.freeze({
    KITTEN3: 'https://player.codemao.cn/old/',
    KITTEN4: 'https://player.codemao.cn/new/',
    KITTEN: 'https://player.codemao.cn/new/',
    NEMO: 'https://nemo.codemao.cn/player/',
    NEKO: 'https://kn.codemao.cn/editor/player/',
    KITTENN: 'https://kn.codemao.cn/editor/player/',
    KITTEN_N: 'https://kn.codemao.cn/editor/player/',
    COCO: 'https://coco.codemao.cn/editor/player/',
    WOOD: 'https://turtle.codemao.cn/player/h5/',
    PYTHON: 'https://turtle.codemao.cn/player/h5/'
});
const ALLOWED_PLAYER_HOSTS = new Set([
    'player.codemao.cn', 'nemo.codemao.cn', 'kn.codemao.cn',
    'coco.codemao.cn', 'turtle.codemao.cn'
]);

function isAllowedCodemaoPlayerUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' && ALLOWED_PLAYER_HOSTS.has(url.hostname.toLowerCase());
    } catch {
        return false;
    }
}

function normalizeIdeModel(value) {
    return String(value || '').trim().toUpperCase().replace(/[·\s-]/g, '_');
}

function buildCodemaoPlayerUrl({ workId, playerUrl, type, ideType }) {
    if (typeof playerUrl === 'string' && isAllowedCodemaoPlayerUrl(playerUrl.trim())) return playerUrl.trim();

    // type 通常包含 Kitten3/Kitten4 等具体型号；ide_type 通常只是 KITTEN 系列名。
    const concreteType = normalizeIdeModel(type);
    const familyType = normalizeIdeModel(ideType);
    const baseUrl = FALLBACK_BASE_URLS[concreteType]
        || FALLBACK_BASE_URLS[familyType]
        || FALLBACK_BASE_URLS.KITTEN4;
    return `${baseUrl}${workId}`;
}

module.exports = { buildCodemaoPlayerUrl, normalizeIdeModel, isAllowedCodemaoPlayerUrl, FALLBACK_BASE_URLS, ALLOWED_PLAYER_HOSTS };
