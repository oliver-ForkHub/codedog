import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { resolveAssetUrl } from '../api/client';
import { userApi } from '../api/user';
import { useSession } from '../session/SessionContext';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

export function MineScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user, checking, logout, refresh } = useSession();
  const [uploading, setUploading] = useState(false);
  if (checking) return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;
  if (!user) return <SafeAreaView style={styles.safe} edges={['top']}><View style={styles.guest}><View style={styles.guestIcon}><Ionicons name="paw-outline" size={38} color={colors.ink} /></View><Text style={styles.guestTitle}>登录编程狗社区</Text><Text style={styles.guestText}>同步作品、收藏和社区消息，继续你的创作旅程。</Text><Pressable onPress={() => navigation.navigate('Login')} style={styles.login}><Text style={styles.loginText}>登录</Text></Pressable></View></SafeAreaView>;
  const avatar = resolveAssetUrl(user.avatar);
  const selectAvatar = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('需要相册权限', '请允许访问照片后再选择头像。');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.82,
    });
    if (result.canceled) return;
    setUploading(true);
    try {
      await userApi.updateAvatar(result.assets[0]);
      await refresh();
      Alert.alert('头像已更新');
    } catch (error) {
      Alert.alert('上传失败', error instanceof Error ? error.message : '请稍后重试');
    } finally {
      setUploading(false);
    }
  };
  const menus: [keyof typeof Ionicons.glyphMap, string, () => void][] = [
    ['folder-open-outline', '我的作品', () => navigation.navigate('MyWorks')],
    ['document-text-outline', '我的帖子', () => navigation.navigate('MyPosts')],
    ['bookmark-outline', '我的收藏', () => navigation.navigate('Favorites')],
    ['people-outline', '工作室', () => navigation.navigate('Studios')],
    ['notifications-outline', '消息通知', () => navigation.navigate('Notifications')],
    ['image-outline', '更换头像', () => void selectAvatar()],
    ['create-outline', '编辑资料', () => navigation.navigate('EditProfile')],
  ];
  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content}><Text style={styles.pageTitle}>我的</Text><View style={styles.profile}>{avatar ? <Image source={{ uri: avatar }} style={styles.avatar} /> : <View style={styles.avatarEmpty}><Text style={styles.initial}>{(user.nickname || user.username).slice(0, 1)}</Text></View>}<View style={{ flex: 1 }}><Text style={styles.name}>{user.nickname || user.username}</Text><Text style={styles.handle}>编程猫 ID {user.codemao_user_id || '未绑定'}</Text></View>{uploading && <ActivityIndicator color={colors.ink} />}</View><View style={styles.stats}><Stat value={user.work_count || 0} label="作品" /><Stat value={user.follower_count || 0} label="粉丝" /><Stat value={user.following_count || 0} label="关注" /></View><View style={styles.menu}>{menus.map(([icon, label, onPress]) => <Pressable key={label} onPress={onPress} disabled={uploading} style={styles.menuItem}><View style={styles.menuIcon}><Ionicons name={icon} size={20} color={colors.ink} /></View><Text style={styles.menuText}>{label}</Text><Ionicons name="chevron-forward" size={17} color={colors.subtle} /></Pressable>)}</View><Pressable onPress={() => void logout()} style={styles.logout}><Text style={styles.logoutText}>退出登录</Text></Pressable></ScrollView></SafeAreaView>;
}
function Stat({ value, label }: { value: number; label: string }) { return <View style={styles.stat}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text></View>; }
const styles = StyleSheet.create({ safe:{flex:1,backgroundColor:colors.background},center:{flex:1,alignItems:'center',justifyContent:'center'},guest:{flex:1,alignItems:'center',justifyContent:'center',padding:35},guestIcon:{width:82,height:82,alignItems:'center',justifyContent:'center',borderRadius:28,backgroundColor:colors.primarySoft},guestTitle:{marginTop:22,fontSize:24,fontWeight:'900',color:colors.ink},guestText:{maxWidth:290,marginTop:10,textAlign:'center',fontSize:14,lineHeight:22,color:colors.muted},login:{width:'100%',height:50,marginTop:28,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:colors.primary},loginText:{fontSize:15,fontWeight:'900',color:colors.ink},content:{padding:18,paddingBottom:35},pageTitle:{fontSize:26,fontWeight:'900',color:colors.ink},profile:{marginTop:18,padding:18,flexDirection:'row',alignItems:'center',gap:13,borderRadius:22,backgroundColor:colors.surface},avatar:{width:58,height:58,borderRadius:18},avatarEmpty:{width:58,height:58,alignItems:'center',justifyContent:'center',borderRadius:18,backgroundColor:colors.ink},initial:{fontSize:22,fontWeight:'900',color:'#FFF'},name:{fontSize:19,fontWeight:'900',color:colors.ink},handle:{marginTop:5,fontSize:11,color:colors.subtle},stats:{marginTop:12,paddingVertical:16,flexDirection:'row',borderRadius:18,backgroundColor:colors.surface},stat:{flex:1,alignItems:'center'},statValue:{fontSize:17,fontWeight:'900',color:colors.ink},statLabel:{marginTop:3,fontSize:10,color:colors.subtle},menu:{marginTop:14,overflow:'hidden',borderRadius:20,backgroundColor:colors.surface},menuItem:{height:62,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:12,borderBottomWidth:1,borderColor:colors.border},menuIcon:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:colors.blueSoft},menuText:{flex:1,fontSize:14,fontWeight:'700',color:colors.ink},logout:{height:48,marginTop:16,alignItems:'center',justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:'#F1CACA',backgroundColor:'#FFF7F7'},logoutText:{fontSize:14,fontWeight:'800',color:colors.danger} });
