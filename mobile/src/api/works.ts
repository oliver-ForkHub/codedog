import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { Work, WorksPage } from '../types/work';

export const worksApi = {
  list(params: { page?: number; pageSize?: number; keyword?: string; sortBy?: 'latest' | 'popular' | 'praise' } = {}) {
    return apiGet<WorksPage>('/works', params);
  },
  featured() {
    return apiGet<Work[]>('/works/featured');
  },
  mine(params: { page?: number; pageSize?: number } = {}) {
    return apiGet<WorksPage>('/works/my', params);
  },
  byUser(codemaoUserId: string) {
    return apiGet<WorksPage>(`/works/user/${encodeURIComponent(codemaoUserId)}`, { page: 1, pageSize: 30 });
  },
  detail(codemaoId: string) {
    return apiGet<Work>(`/works/${encodeURIComponent(codemaoId)}`);
  },
  publish(codemaoWorkId: string) {
    return apiPost<Work>('/works/publish', { codemaoWorkId });
  },
  update(codemaoId: string, data: { name: string; description: string }) { return apiPut<Work>(`/works/${encodeURIComponent(codemaoId)}`, data); },
  remove(codemaoId: string) { return apiDelete<null>(`/works/${encodeURIComponent(codemaoId)}`); },
};
