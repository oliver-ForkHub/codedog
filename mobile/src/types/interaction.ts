import type { WorkAuthor } from './work';

export type Comment = {
  id: number;
  content: string;
  like_count?: number;
  liked?: boolean;
  created_at?: string;
  user?: WorkAuthor | null;
  replies?: Comment[];
};

export type Notification = {
  id: number;
  type: string;
  title: string;
  content?: string | null;
  related_id?: number | string | null;
  related_type?: string | null;
  is_read: boolean;
  created_at?: string;
  sender?: WorkAuthor | null;
};
