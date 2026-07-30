import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { userApi } from '../api/user';
import { useSession } from '../session/SessionContext';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';

export function EditProfileScreen({ navigation }: NativeStackScreenProps<RootStackParamList, 'EditProfile'>) {
  const { user, refresh } = useSession();
  const [nickname, setNickname] = useState(user?.nickname || user?.username || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [doing, setDoing] = useState(user?.doing || '');
  const [showFavorites, setShowFavorites] = useState(!!user?.show_favorites);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    if (!nickname.trim()) return Alert.alert('昵称不能为空');
    setSaving(true);
    try {
      await userApi.updateProfile({ nickname: nickname.trim(), bio: bio.trim(), doing: doing.trim(), show_favorites: showFavorites });
      await refresh();
      Alert.alert('资料已保存', '', [{ text: '完成', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : '请稍后重试');
    } finally { setSaving(false); }
  };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Field label="昵称" value={nickname} onChangeText={setNickname} maxLength={50} />
    <Field label="正在做" value={doing} onChangeText={setDoing} maxLength={200} placeholder="最近在做什么？" />
    <Field label="个人简介" value={bio} onChangeText={setBio} maxLength={500} placeholder="介绍一下自己" multiline />
    <View style={styles.switchRow}><View style={{flex:1}}><Text style={styles.label}>公开收藏夹</Text><Text style={styles.help}>其他用户可以查看你收藏的作品</Text></View><Switch value={showFavorites} onValueChange={setShowFavorites} trackColor={{true:colors.primary}} /></View>
    <Pressable disabled={saving} onPress={() => void save()} style={[styles.save, saving && {opacity:.6}]}>{saving ? <ActivityIndicator color={colors.ink} /> : <Text style={styles.saveText}>保存资料</Text>}</Pressable>
  </ScrollView>;
}
function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) { return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} placeholderTextColor={colors.subtle} style={[styles.input, props.multiline && styles.multiline]} /></View>; }
const styles = StyleSheet.create({content:{padding:18,paddingBottom:40},field:{marginBottom:18},label:{marginBottom:8,fontSize:13,fontWeight:'800',color:colors.ink},input:{minHeight:48,paddingHorizontal:14,borderWidth:1,borderColor:colors.border,borderRadius:14,backgroundColor:colors.surface,color:colors.ink},multiline:{height:120,paddingTop:13,textAlignVertical:'top'},switchRow:{padding:16,flexDirection:'row',alignItems:'center',borderRadius:16,backgroundColor:colors.surface},help:{fontSize:11,color:colors.muted},save:{height:50,marginTop:24,alignItems:'center',justifyContent:'center',borderRadius:15,backgroundColor:colors.primary},saveText:{fontSize:15,fontWeight:'900',color:colors.ink}});
