import { apiDelete, apiGet, apiPost, apiPut } from './client';
import type { CommunityPage } from '../types/community';
import type { Comment, Notification } from '../types/interaction';
import type { WorksPage } from '../types/work';

export const interactionApi = {
  workComments(workId: string, page = 1) { return apiGet<CommunityPage<Comment>>(`/comments/work/${encodeURIComponent(workId)}`, { page, pageSize: 30 }); },
  createWorkComment(workId: string, content: string) { return apiPost<Comment>('/comments', { work_id: workId, content }); },
  createPostComment(postId: number, content: string) { return apiPost<Comment>('/comments', { post_id: postId, content }); },
  likeComment(id: number) { return apiPost<{ liked: boolean; like_count: number }>(`/comments/${id}/like`, {}); },
  deleteComment(id: number) { return apiDelete<null>(`/comments/${id}`); },
  likeWork(workId: string) { return apiPost<{ liked: boolean; praise_times: number }>(`/works/${encodeURIComponent(workId)}/like`, {}); },
  checkFavorite(workId: string) { return apiGet<{ isFavorited?: boolean; favorited?: boolean }>(`/favorites/check/${encodeURIComponent(workId)}`); },
  myFavorites(page = 1) { return apiGet<WorksPage>('/favorites/my', { page, pageSize: 30 }); },
  addFavorite(workId: string) { return apiPost<unknown>('/favorites', { workId }); },
  removeFavorite(workId: string) { return apiDelete<unknown>(`/favorites/${encodeURIComponent(workId)}`, {}); },
  likePost(postId: number) { return apiPost<{ liked: boolean; like_count: number }>(`/posts/${postId}/like`, {}); },
  favoritePost(postId: number) { return apiPost<{ favorited: boolean; collection_count: number }>(`/posts/${postId}/favorite`, {}); },
  unfavoritePost(postId: number) { return apiDelete<{ favorited: boolean; collection_count: number }>(`/posts/${postId}/favorite`); },
  subscribePost(postId: number) { return apiPost<{ subscribed: boolean }>(`/posts/${postId}/subscription`, {}); },
  notifications() { return apiGet<CommunityPage<Notification>>('/notifications', { page: 1, pageSize: 50 }); },
  markNotificationRead(id: number) { return apiPut<null>(`/notifications/${id}/read`); },
  markAllRead() { return apiPut<null>('/notifications/read-all'); },
  deleteNotification(id: number) { return apiDelete<null>(`/notifications/${id}`); },
  clearNotifications() { return apiDelete<null>('/notifications/clear/all'); },
};
