import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Discover: undefined;
  Publish: undefined;
  Forum: undefined;
  Mine: undefined;
};

export type RootStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  WorkDetail: { codemaoId: string; title?: string };
  PostDetail: { id: number; title?: string };
  Studios: undefined;
  StudioDetail: { id: number; title?: string };
  Login: undefined;
  Notifications: undefined;
  MyWorks: undefined;
  Favorites: undefined;
  EditProfile: undefined;
  UserProfile: { codemaoId: string };
  Connections: { codemaoId: string; mode: 'followers' | 'following'; title?: string };
  StudioSubmit: { id: number; title?: string };
  MyPosts: undefined;
  EditPost: { id: number };
  EditWork: { codemaoId: string };
  StudioManage: { id: number; title?: string };
  OAuthAuthorize: { client_id?: string; redirect_uri?: string; scope?: string; state?: string; response_type?: string };
};
