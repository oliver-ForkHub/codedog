import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CaptchaProvider } from './src/components/CaptchaProvider';

import { HomeScreen } from './src/screens/HomeScreen';
import { ForumScreen } from './src/screens/ForumScreen';
import { EditProfileScreen } from './src/screens/EditProfileScreen';
import { EditPostScreen } from './src/screens/EditPostScreen';
import { EditWorkScreen } from './src/screens/EditWorkScreen';
import { ConnectionsScreen } from './src/screens/ConnectionsScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { MineScreen } from './src/screens/MineScreen';
import { MyPostsScreen } from './src/screens/MyPostsScreen';
import { NotificationsScreen } from './src/screens/NotificationsScreen';
import { OAuthAuthorizeScreen } from './src/screens/OAuthAuthorizeScreen';
import { FavoritesScreen, MyWorksScreen } from './src/screens/PersonalWorksScreen';
import { PostDetailScreen } from './src/screens/PostDetailScreen';
import { PublishScreen } from './src/screens/PublishScreen';
import { StudioDetailScreen } from './src/screens/StudioDetailScreen';
import { StudioSubmitScreen } from './src/screens/StudioSubmitScreen';
import { StudioManageScreen } from './src/screens/StudioManageScreen';
import { StudiosScreen } from './src/screens/StudiosScreen';
import { WorkDetailScreen } from './src/screens/WorkDetailScreen';
import { WorksScreen } from './src/screens/WorksScreen';
import { UserProfileScreen } from './src/screens/UserProfileScreen';
import { SessionProvider } from './src/session/SessionContext';
import { colors } from './src/theme';
import type { MainTabParamList, RootStackParamList } from './src/types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const tabIcons: Record<keyof MainTabParamList, keyof typeof Ionicons.glyphMap> = {
  Home: 'home-outline', Discover: 'compass-outline', Publish: 'add-circle-outline', Forum: 'chatbubbles-outline', Mine: 'person-outline',
};

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.ink,
      tabBarInactiveTintColor: colors.subtle,
      tabBarStyle: { height: 66, paddingTop: 7, paddingBottom: 8, borderTopColor: colors.border, backgroundColor: colors.surface },
      tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      tabBarIcon: ({ color, size }) => <Ionicons name={tabIcons[route.name]} color={route.name === 'Publish' ? colors.primary : color} size={route.name === 'Publish' ? size + 7 : size} />,
    })}>
      <Tabs.Screen name="Home" component={HomeScreen} options={{ title: '首页' }} />
      <Tabs.Screen name="Discover" component={WorksScreen} options={{ title: '发现' }} />
      <Tabs.Screen name="Publish" component={PublishScreen} options={{ title: '创作' }} />
      <Tabs.Screen name="Forum" component={ForumScreen} options={{ title: '论坛' }} />
      <Tabs.Screen name="Mine" component={MineScreen} options={{ title: '我的' }} />
    </Tabs.Navigator>
  );
}

const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.ink,
    background: colors.background,
    card: colors.surface,
    text: colors.ink,
    border: colors.border,
  },
};

const linking = {
  prefixes: ['codedog://'],
  config: {
    screens: {
      WorkDetail: 'work/:codemaoId',
      PostDetail: 'post/:id',
      StudioDetail: 'studio/:id',
      UserProfile: 'user/:codemaoId',
      Notifications: 'notifications',
      OAuthAuthorize: 'oauth/authorize',
    },
  },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
       <CaptchaProvider>
        <NavigationContainer theme={navigationTheme} linking={linking}>
          <StatusBar style="dark" />
          <Stack.Navigator
          screenOptions={{
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerTintColor: colors.ink,
            headerTitleStyle: { fontSize: 17, fontWeight: '800' },
            contentStyle: { backgroundColor: colors.background },
          }}
        >
          <Stack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
          <Stack.Screen name="WorkDetail" component={WorkDetailScreen} options={{ title: '作品详情' }} />
          <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ title: '帖子详情' }} />
          <Stack.Screen name="Studios" component={StudiosScreen} options={{ title: '工作室' }} />
          <Stack.Screen name="StudioDetail" component={StudioDetailScreen} options={{ title: '工作室详情' }} />
          <Stack.Screen name="Login" component={LoginScreen} options={{ title: '登录' }} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: '消息通知' }} />
          <Stack.Screen name="MyWorks" component={MyWorksScreen} options={{ title: '我的作品' }} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} options={{ title: '我的收藏' }} />
          <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: '编辑资料' }} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} options={{ title: '用户主页' }} />
          <Stack.Screen name="Connections" component={ConnectionsScreen} options={({ route }) => ({ title: route.params.title || (route.params.mode === 'followers' ? '粉丝' : '关注') })} />
          <Stack.Screen name="StudioSubmit" component={StudioSubmitScreen} options={{ title: '投稿作品' }} />
          <Stack.Screen name="StudioManage" component={StudioManageScreen} options={{ title: '工作室审核' }} />
          <Stack.Screen name="OAuthAuthorize" component={OAuthAuthorizeScreen} options={{ title: '应用授权', presentation: 'modal' }} />
          <Stack.Screen name="MyPosts" component={MyPostsScreen} options={{ title: '我的帖子' }} />
          <Stack.Screen name="EditPost" component={EditPostScreen} options={{ title: '编辑帖子' }} />
          <Stack.Screen name="EditWork" component={EditWorkScreen} options={{ title: '编辑作品' }} />
        </Stack.Navigator>
        </NavigationContainer>
       </CaptchaProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
