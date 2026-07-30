import { apiDelete, apiGet, apiMultipart, apiPost, clearAccessToken, saveAccessToken } from './client';
import type { CurrentUser, PublicUser } from '../types/user';
import type { CommunityPage } from '../types/community';

export const userApi = {
  me() { return apiGet<CurrentUser>('/users/me'); },
  publicProfile(codemaoId: string) { return apiGet<PublicUser>(`/users/${encodeURIComponent(codemaoId)}`); },
  checkFollow(codemaoId: string) { return apiGet<{ isFollowing: boolean }>(`/follows/check/${encodeURIComponent(codemaoId)}`); },
  follow(codemaoId: string) { return apiPost<null>('/follows', { codemaoUserId: codemaoId }); },
  unfollow(codemaoId: string) { return apiDelete<null>(`/follows/${encodeURIComponent(codemaoId)}`); },
  followers(codemaoId: string) { return apiGet<CommunityPage<PublicUser>>(`/follows/followers/${encodeURIComponent(codemaoId)}`, { page: 1, pageSize: 50 }); },
  following(codemaoId: string) { return apiGet<CommunityPage<PublicUser>>(`/follows/following/${encodeURIComponent(codemaoId)}`, { page: 1, pageSize: 50 }); },
  login(username: string, password: string) {
    return apiPost<{ user: CurrentUser; access_token: string; token_type: 'Bearer' }>('/users/mobile/login', { username, password });
  },
  async persistToken(token: string) { await saveAccessToken(token); },
  async clearLocalToken() { await clearAccessToken(); },
  updateAvatar(asset: { uri: string; fileName?: string | null; mimeType?: string | null }) {
    const body = new FormData();
    body.append('avatar', {
      uri: asset.uri,
      name: asset.fileName || `avatar-${Date.now()}.jpg`,
      type: asset.mimeType || 'image/jpeg',
    } as unknown as Blob);
    return apiMultipart<CurrentUser>('/users/profile', 'PUT', body);
  },
  updateProfile(fields: { nickname: string; bio: string; doing: string; show_favorites: boolean }) {
    const body = new FormData();
    body.append('nickname', fields.nickname);
    body.append('bio', fields.bio);
    body.append('doing', fields.doing);
    body.append('show_favorites', String(fields.show_favorites));
    return apiMultipart<CurrentUser>('/users/profile', 'PUT', body);
  },
  async logout() { try { await apiPost<null>('/users/logout', {}); } finally { await clearAccessToken(); } },
};
