import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { CommunityPage, Post, Studio, StudioDetail } from '../types/community';

export const communityApi = {
  posts(params: { page?: number; pageSize?: number; keyword?: string; sortBy?: string } = {}) {
    return apiGet<CommunityPage<Post>>('/posts', params);
  },
  post(id: number) { return apiGet<Post>(`/posts/${id}`); },
  createPost(data: { title: string; content: string; category: string }) { return apiPost<Post>('/posts', data); },
  studios(params: { page?: number; pageSize?: number; keyword?: string } = {}) {
    return apiGet<CommunityPage<Studio>>('/studios', params);
  },
  studio(id: number) { return apiGet<StudioDetail>(`/studios/${id}`); },
  myStudios() { return apiGet<Array<Studio & { memberRole?: string; memberStatus?: string }>>('/studios/my/list'); },
  joinStudio(id: number) { return apiPost<unknown>(`/studios/${id}/join`, {}); },
  leaveStudio(id: number) { return apiPost<null>(`/studios/${id}/leave`, {}); },
  submitStudioWork(id: number, workId: string) { return apiPost<unknown>(`/studios/${id}/works`, { workId }); },
  pendingStudioMembers(id: number) { return apiGet<Array<{ id: number; user?: import('../types/work').WorkAuthor; nickname?: string; username?: string }>>(`/studios/${id}/pending-members`); },
  reviewStudioMember(id: number, memberId: number, action: 'approve'|'reject') { return apiPost<null>(`/studios/${id}/members/${memberId}/review`, { action }); },
  pendingStudioWorks(id: number) { return apiGet<Array<{ id: number; work?: import('../types/work').Work; name?: string; codemao_work_id?: string }>>(`/studios/${id}/pending-works`); },
  reviewStudioWork(id: number, workId: number, action: 'approve'|'reject') { return apiPost<null>(`/studios/${id}/works/${workId}/review`, { action }); },
  myPosts() { return apiGet<CommunityPage<Post>>('/posts/my/list', { page: 1, pageSize: 50 }); },
  updatePost(id: number, data: { title: string; content: string; category?: string }) { return apiPut<Post>(`/posts/${id}`, data); },
  deletePost(id: number) { return apiDelete<null>(`/posts/${id}`); },
  getDraft() { return apiGet<{ title?: string; content?: string; category?: string } | null>('/posts/drafts/current'); },
  saveDraft(data: { title: string; content: string; category: string }) { return apiPut<unknown>('/posts/drafts/current', data); },
  deleteDraft() { return apiDelete<null>('/posts/drafts/current'); },
};
