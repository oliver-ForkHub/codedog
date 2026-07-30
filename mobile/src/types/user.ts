export type CurrentUser = {
  id: number;
  codemao_user_id?: string | null;
  username: string;
  nickname?: string | null;
  avatar?: string | null;
  bio?: string | null;
  doing?: string | null;
  show_favorites?: boolean;
  role?: string;
  work_count?: number;
  follower_count?: number;
  following_count?: number;
};

export type PublicUser = CurrentUser & {
  profile_cover?: string | null;
  level?: number;
  created_at?: string;
};
