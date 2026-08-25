import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const APP_VERSION = '1.1.3';
export type UpgradePolicy = { minimum_version: string; latest_version: string; update_url: string; message: string; force_update?: boolean };
let upgradeHandler: ((policy: UpgradePolicy) => void) | null = null;
export function setUpgradeHandler(handler: ((policy: UpgradePolicy) => void) | null) { upgradeHandler = handler; }

type ApiEnvelope<T> = {
  code: number;
  msg: string;
  data: T;
};

export type CaptchaFields = Partial<{ geetest_lot_number: string; geetest_captcha_output: string; geetest_pass_token: string; geetest_gen_time: string }>;
type CaptchaHandler = (scene: string, kind: 'geetest' | 'hcaptcha') => Promise<CaptchaFields | null>;
let captchaHandler: CaptchaHandler | null = null;
export function setCaptchaHandler(handler: CaptchaHandler | null) { captchaHandler = handler; }

const emulatorDefault = Platform.select({
  android: 'http://10.0.2.2:3001/api',
  default: 'http://127.0.0.1:3001/api',
});

export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || emulatorDefault).replace(/\/$/, '');
const ACCESS_TOKEN_KEY = 'codedog_mobile_access_token';
let accessToken: string | null = null;

export async function loadAccessToken() {
  accessToken = await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  return accessToken;
}

export async function saveAccessToken(token: string) {
  accessToken = token;
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function clearAccessToken() {
  accessToken = null;
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

function captchaScene(path: string, method: string) {
  if (path.includes('/mobile/login')) return 'login';
  if (path === '/works/publish') return 'publish_work';
  if (path === '/posts' && method === 'POST') return 'publish_post';
  if (path.includes('/like')) return 'like';
  if (path.startsWith('/comments')) return method === 'POST' ? 'comment' : 'like';
  if (path.startsWith('/favorites') || path.includes('/favorite')) return 'favorite';
  if (path === '/users/profile') return 'update_profile';
  if (/\/studios\/\d+\/join/.test(path)) return 'join_studio';
  if (/\/studios\/\d+\/works$/.test(path)) return 'submit_work';
  // 修复 M12：工作室成员/作品审核路径精确映射到 review_member，而非统一兜底为 studio_management。
  // 此前 path.startsWith('/studios') 兜底过宽，导致 review_member 场景错配。
  if (/\/studios\/\d+\/members\/\d+\/review/.test(path)) return 'review_member';
  if (/\/studios\/\d+\/works\/\d+\/review/.test(path)) return 'review_member';
  if (path.startsWith('/studios')) return 'studio_management';
  return 'global';
}

function withCaptcha(options: RequestInit, fields: CaptchaFields): RequestInit {
  if (options.body instanceof FormData) {
    Object.entries(fields).forEach(([key, value]) => (options.body as FormData).append(key, value));
    return options;
  }
  const existing = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : {};
  return { ...options, body: JSON.stringify({ ...existing, ...fields }) };
}

export async function apiRequest<T>(path: string, options: RequestInit = {}, params?: Record<string, string | number | undefined>, hcaptchaAttempted = false, geetestAttempted = false): Promise<T> {
  const query = Object.entries(params || {})
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  const url = `${API_BASE_URL}${path}${query ? `?${query}` : ''}`;
  if (accessToken === null) await loadAccessToken();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'X-App-Platform': Platform.OS,
      'X-App-Version': APP_VERSION,
      'X-App-Build': '3',
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
  });
  const body = (await response.json().catch(() => null)) as ApiEnvelope<T> | null;

  if (!response.ok || !body || body.code !== 200) {
    if (response.status === 426 && body?.data) upgradeHandler?.(body.data as unknown as UpgradePolicy);
    const message = body?.msg || '';
    // 修复 M13：拆分 hCaptcha/geetest 两种验证码的重试标记，允许一次操作内顺序完成两种验证。
    // 此前单一 captchaRetried 布尔在首次 hCaptcha 后置 true，若业务路由再要求极验则无重试机会直接失败。
    const isHcaptcha = /hcaptcha/i.test(message);
    const attempted = isHcaptcha ? hcaptchaAttempted : geetestAttempted;
    if (!attempted && captchaHandler && /验证码|安全验证/.test(message) && !path.startsWith('/geetest/')) {
      const fields = await captchaHandler(captchaScene(path, String(options.method || 'GET').toUpperCase()), isHcaptcha ? 'hcaptcha' : 'geetest');
      if (fields) return apiRequest<T>(path, withCaptcha(options, fields), params, isHcaptcha ? true : hcaptchaAttempted, !isHcaptcha ? true : geetestAttempted);
    }
    throw new ApiError(body?.msg || `请求失败（${response.status}）`, response.status);
  }
  return body.data;
}

export function apiGet<T>(path: string, params?: Record<string, string | number | undefined>) {
  return apiRequest<T>(path, {}, params);
}

export function apiPost<T>(path: string, body: unknown) {
  return apiRequest<T>(path, { method: 'POST', body: JSON.stringify(body) });
}

export function apiPut<T>(path: string, body: unknown = {}) {
  return apiRequest<T>(path, { method: 'PUT', body: JSON.stringify(body) });
}

export function apiDelete<T>(path: string, body?: unknown) {
  return apiRequest<T>(path, { method: 'DELETE', ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export function apiMultipart<T>(path: string, method: 'POST' | 'PUT', body: FormData) {
  return apiRequest<T>(path, { method, body });
}

export function resolveAssetUrl(value?: string | null) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  const origin = API_BASE_URL.replace(/\/api$/, '');
  return `${origin}${value.startsWith('/') ? '' : '/'}${value}`;
}
