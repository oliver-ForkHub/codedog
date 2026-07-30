import type { WorkAuthor } from './work';

export type Post = {
  id: number;
  title: string;
  content: string;
  category?: string;
  post_type?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  reply_count?: number;
  is_top?: boolean;
  is_essence?: boolean;
  created_at?: string;
  author?: WorkAuthor | null;
  user?: WorkAuthor | null;
  comments?: Array<{ id: number; content: string; created_at?: string; user?: WorkAuthor | null; author?: WorkAuthor | null }>;
  liked?: boolean;
  favorited?: boolean;
  subscribed?: boolean;
  collection_count?: number;
};

export type ForumBoard = {
  id: number;
  name: string;
  slug: string;
  icon?: string;
  description?: string;
  color?: string;
};

export type PostDraft = {
  title?: string;
  content?: string;
  board_id?: number | null;
  post_type?: 'discussion' | 'question' | 'tutorial';
  cover?: string;
  tags?: string[];
};

export type Studio = {
  id: number;
  name: string;
  description?: string | null;
  cover?: string | null;
  cover_url?: string | null;
  member_count?: number;
  work_count?: number;
  level?: number;
  join_type?: string;
  owner?: WorkAuthor | null;
  is_public?: boolean;
  recruitment_status?: string;
};

export type StudioDetail = {
  studio: Studio;
  members: Array<{ id: number; memberRole: string; user: WorkAuthor }>;
  works: import('./work').Work[];
  userRole?: string | null;
  userMemberStatus?: string | null;
  joinBlockedReason?: string | null;
};

export type CommunityPage<T> = { list: T[]; total: number; page?: number; totalPages?: number };
export type Banner = { id:number; title:string; image_url:string; link_url?:string|null };
