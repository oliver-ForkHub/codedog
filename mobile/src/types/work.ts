export type WorkAuthor = {
  id: number;
  codemao_user_id?: string | null;
  username?: string | null;
  nickname?: string | null;
  avatar?: string | null;
  bio?: string | null;
};

export type Work = {
  id: number;
  codemao_work_id: string;
  name: string;
  description?: string | null;
  preview?: string | null;
  type?: string | null;
  ide_type?: string | null;
  work_url?: string | null;
  view_times?: number;
  praise_times?: number;
  collection_times?: number;
  comment_count?: number;
  liked?: boolean;
  is_liked?: boolean;
  created_at?: string;
  status?: string;
  author?: WorkAuthor | null;
};

export type WorksPage = {
  list: Work[];
  total: number;
  pagination?: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
};
