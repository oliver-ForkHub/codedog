import { apiGet, apiPost } from './client';
export type OAuthScope = { key: string; name?: string; description?: string; risk?: 'read'|'write'|'admin'; is_new?: boolean };
export type OAuthAuthorizeInfo = { app: { name: string; description?: string|null; logo_url?: string|null; homepage_url?: string|null; client_id: string }; scopes: OAuthScope[]; reauthorization_required?: boolean; redirect_uri: string; state?: string|null };
export type OAuthParams = { client_id: string; redirect_uri: string; scope?: string; state?: string; response_type?: string };
export const oauthApi={
  info:(params:OAuthParams)=>apiGet<OAuthAuthorizeInfo>('/oauth/authorize-info',params),
  decide:(params:OAuthParams,approved:boolean)=>apiPost<{redirect_to:string;code_expires_in?:number}>('/oauth/authorize',{...params,approved}),
};
