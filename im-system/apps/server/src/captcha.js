const axios = require('axios');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('./config');

const SCENES = new Set(['im_message', 'im_search', 'im_create_group']);
const configCache = new Map();
const consumed = new Map();

function communityBase(user) {
  const value = String(user?.community_url || '').replace(/\/$/, '');
  if (!/^https?:\/\//i.test(value)) throw Object.assign(new Error('编程狗地址不可用，请重新进入即时通讯'), { statusCode: 401 });
  return value;
}

async function communityRequest(user, method, path, data) {
  const publicBase = communityBase(user);
  let lastError;
  for (const base of [...new Set([config.communityInternalUrl, publicBase])]) {
    try {
      const response = await axios({ method, url: `${base}${path}`, data, timeout: 8000, maxRedirects: 0, headers: { Host: new URL(publicBase).host }, validateStatus: () => true });
      if (response.status !== 200 || response.data?.code !== 200) throw Object.assign(new Error(response.data?.msg || '编程狗极验服务不可用'), { statusCode: response.status || 503 });
      return response.data.data;
    } catch (error) { lastError = error; }
  }
  throw Object.assign(new Error(lastError?.message || '编程狗极验服务不可用'), { statusCode: lastError?.statusCode || 503 });
}

async function sceneConfig(user, scene, force = false) {
  if (!SCENES.has(scene)) throw Object.assign(new Error('不支持的验证场景'), { statusCode: 400 });
  const key = String(user.id);
  let entry = configCache.get(key);
  if (force || !entry || entry.expiresAt < Date.now()) {
    const data = await communityRequest(user, 'get', '/api/geetest/config');
    entry = { data, expiresAt: Date.now() + 60 * 1000 };
    configCache.set(key, entry);
  }
  return { enabled: !!(entry.data?.enabled && entry.data?.scenes?.[scene]), product: entry.data?.product || 'popup' };
}

function issueGrant(user, scene) {
  const reusable = scene === 'im_message';
  return jwt.sign({ type: 'im_captcha', scene, reusable }, config.sessionSecret, {
    algorithm: 'HS256', issuer: 'codedog-im', audience: 'codedog-im-captcha',
    subject: String(user.id), jwtid: crypto.randomUUID(), expiresIn: reusable ? '2m' : '90s'
  });
}

async function validateCaptcha(user, scene, payload) {
  const current = await sceneConfig(user, scene, true);
  if (!current.enabled) return { required: false, grant: '' };
  await communityRequest(user, 'post', '/api/geetest/validate', {
    scene,
    challenge: payload?.geetest_challenge,
    validate: payload?.geetest_validate,
    seccode: payload?.geetest_seccode
  });
  return { required: true, grant: issueGrant(user, scene) };
}

async function registerCaptcha(user, scene) {
  const current = await sceneConfig(user, scene);
  if (!current.enabled) return { enabled: false };
  const data = await communityRequest(user, 'get', '/api/geetest/register');
  return { enabled: true, product: current.product, ...data };
}

function verifyGrant(user, scene, token) {
  try {
    const payload = jwt.verify(String(token || ''), config.sessionSecret, {
      algorithms: ['HS256'], issuer: 'codedog-im', audience: 'codedog-im-captcha', subject: String(user.id)
    });
    if (payload.type !== 'im_captcha' || payload.scene !== scene) return false;
    if (!payload.reusable) {
      const now = Date.now();
      for (const [jti, expiry] of consumed) if (expiry < now) consumed.delete(jti);
      if (consumed.has(payload.jti)) return false;
      consumed.set(payload.jti, payload.exp * 1000);
    }
    return true;
  } catch { return false; }
}

function requireCaptcha(scene) {
  return async (req, res, next) => {
    try {
      const current = await sceneConfig(req.user, scene);
      if (!current.enabled) return next();
      if (!verifyGrant(req.user, scene, req.get('x-im-captcha-grant'))) return res.status(403).json({ code: 403, msg: '请完成极验安全验证', data: { captcha_required: true, scene } });
      next();
    } catch (error) { res.status(error.statusCode || 503).json({ code: error.statusCode || 503, msg: error.message, data: null }); }
  };
}

async function assertCaptchaGrant(user, scene, token) {
  const current = await sceneConfig(user, scene);
  if (!current.enabled) return true;
  if (!verifyGrant(user, scene, token)) throw Object.assign(new Error('请完成安全验证'), { statusCode: 403, captchaRequired: true });
  return true;
}

module.exports = { sceneConfig, registerCaptcha, validateCaptcha, requireCaptcha, assertCaptchaGrant };
