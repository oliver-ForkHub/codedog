import { apiGet, apiPost } from './client';
export type GeetestConfig = { enabled: boolean; captcha_id: string; product?: string; scenes: Record<string, boolean> };
export type GeetestRegister = { gt: string; challenge: string; success: number; new_captcha: boolean };
export const captchaApi = {
  config: () => apiGet<GeetestConfig>('/geetest/config'),
  register: () => apiGet<GeetestRegister>('/geetest/register'),
  show: (scene: string) => apiPost<null>('/geetest/show', { scene }),
  hcaptchaConfig: () => apiGet<{ enabled: boolean; site_key: string }>('/hcaptcha/config'),
  hcaptchaShow: (scene: string) => apiPost<null>('/hcaptcha/show', { scene }),
  hcaptchaVerify: (token: string, scene: string) => apiPost<{ verified: boolean; expires_at: number }>('/hcaptcha/verify', { token, scene }),
};
