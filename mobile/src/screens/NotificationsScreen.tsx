import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { interactionApi } from '../api/interactions';
import { StateView } from '../components/StateView';
import { colors } from '../theme';
import type { Notification } from '../types/interaction';
import type { RootStackParamList } from '../types/navigation';

export function NotificationsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setError('');
    try { setItems((await interactionApi.notifications()).list); }
    catch (e) { setError(e instanceof Error ? e.message : '通知加载失败'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const open = async (item: Notification) => {
    if (!item.is_read) {
      await interactionApi.markNotificationRead(item.id).catch(() => null);
      setItems(list => list.map(x => x.id === item.id ? { ...x, is_read: true } : x));
    }
    if (item.related_type === 'work' && item.related_id) navigation.navigate('WorkDetail', { codemaoId: String(item.related_id) });
    else if (item.related_type === 'post' && item.related_id) navigation.navigate('PostDetail', { id: Number(item.related_id) });
    else if (item.related_type === 'user' && item.related_id) navigation.navigate('UserProfile', { codemaoId: String(item.related_id) });
  };
  if (loading) return <StateView loading title="正在加载通知" />;
  if (error) return <StateView title="通知暂时不可用" message={error} actionLabel="重试" onAction={() => void load()} />;
  const clear = () => Alert.alert('清空通知', '清空后无法恢复。', [{ text: '取消', style: 'cancel' }, { text: '清空', style: 'destructive', onPress: async () => { await interactionApi.clearNotifications(); setItems([]); } }]);
  return <View style={styles.root}><View style={styles.toolbar}><Text style={styles.count}>{items.filter(x => !x.is_read).length} 条未读</Text><View style={styles.tools}><Pressable onPress={async () => { await interactionApi.markAllRead(); setItems(list => list.map(x => ({ ...x, is_read: true }))); }}><Text style={styles.readAll}>全部已读</Text></Pressable><Pressable onPress={clear}><Text style={styles.clear}>清空</Text></Pressable></View></View><FlatList data={items} keyExtractor={x => String(x.id)} contentContainerStyle={styles.list} ListEmptyComponent={<StateView title="暂无通知" message="互动消息会出现在这里" />} renderItem={({ item }) => <Pressable onPress={() => void open(item)} onLongPress={()=>Alert.alert('删除通知','确定删除这一条通知吗？',[{text:'取消',style:'cancel'},{text:'删除',style:'destructive',onPress:async()=>{await interactionApi.deleteNotification(item.id);setItems(list=>list.filter(x=>x.id!==item.id))}}])} style={[styles.item, !item.is_read && styles.unread]}><View style={styles.icon}><Ionicons name={item.type === 'like' ? 'heart-outline' : 'notifications-outline'} size={20} color={colors.ink} /></View><View style={{ flex: 1 }}><Text style={styles.title}>{item.title}</Text>{!!item.content && <Text numberOfLines={2} style={styles.content}>{item.content}</Text>}<Text style={styles.sender}>{item.sender?.nickname || item.sender?.username || '社区消息'}</Text></View>{!item.is_read && <View style={styles.dot} />}</Pressable>} /></View>;
}
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:colors.background},toolbar:{height:48,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},count:{fontSize:12,color:colors.muted},tools:{flexDirection:'row',gap:18},readAll:{fontSize:12,fontWeight:'800',color:colors.ink},clear:{fontSize:12,fontWeight:'800',color:colors.danger},list:{padding:16,paddingTop:0},item:{marginBottom:10,padding:15,flexDirection:'row',gap:11,borderRadius:18,backgroundColor:colors.surface},unread:{borderWidth:1,borderColor:'#F2D77E'},icon:{width:40,height:40,alignItems:'center',justifyContent:'center',borderRadius:13,backgroundColor:colors.primarySoft},title:{fontSize:14,fontWeight:'900',color:colors.ink},content:{marginTop:4,fontSize:12,lineHeight:18,color:colors.muted},sender:{marginTop:7,fontSize:10,color:colors.subtle},dot:{width:8,height:8,borderRadius:4,backgroundColor:colors.primary} });
