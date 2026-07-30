import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { interactionApi } from '../api/interactions';
import { worksApi } from '../api/works';
import { WorkCard } from '../components/WorkCard';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import type { Work } from '../types/work';

type Props = NativeStackScreenProps<RootStackParamList, 'MyWorks' | 'Favorites'> & { mode: 'works' | 'favorites' };

export function PersonalWorksScreen({ navigation, mode }: Props) {
  const [items, setItems] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      setError('');
      const data = mode === 'works' ? await worksApi.mine({ page: 1, pageSize: 30 }) : await interactionApi.myFavorites();
      setItems(data.list || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [mode]);
  useEffect(() => { void load(); }, [load]);
  const manage = (work: Work) => Alert.alert(work.name, '管理这个作品', [
    { text: '取消', style: 'cancel' },
    { text: '编辑', onPress: () => navigation.navigate('EditWork', { codemaoId: work.codemao_work_id }) },
    { text: '删除', style: 'destructive', onPress: () => Alert.alert('确认删除', '删除后作品将不再公开展示。', [{ text: '取消', style: 'cancel' }, { text: '删除', style: 'destructive', onPress: async () => { try { await worksApi.remove(work.codemao_work_id); setItems(list => list.filter(item => item.id !== work.id)); } catch (e) { Alert.alert('删除失败', e instanceof Error ? e.message : '请稍后重试'); } } }]) },
  ]);
  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;
  return <FlatList
    data={items}
    numColumns={2}
    keyExtractor={(item) => `${mode}-${item.id}`}
    columnWrapperStyle={styles.row}
    contentContainerStyle={styles.content}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} />}
    ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
    ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyTitle}>{mode === 'works' ? '还没有发布作品' : '收藏夹还是空的'}</Text><Text style={styles.emptyText}>{mode === 'works' ? '前往创作页发布你的第一个作品。' : '在作品详情页点收藏后会出现在这里。'}</Text></View>}
    renderItem={({ item }) => <WorkCard compact work={item} onPress={() => navigation.navigate('WorkDetail', { codemaoId: item.codemao_work_id, title: item.name })} onLongPress={mode === 'works' ? () => manage(item) : undefined} />}
  />;
}

export function MyWorksScreen(props: NativeStackScreenProps<RootStackParamList, 'MyWorks'>) {
  return <PersonalWorksScreen {...props} mode="works" />;
}

export function FavoritesScreen(props: NativeStackScreenProps<RootStackParamList, 'Favorites'>) {
  return <PersonalWorksScreen {...props} mode="favorites" />;
}

const styles = StyleSheet.create({
  center:{flex:1,alignItems:'center',justifyContent:'center',backgroundColor:colors.background},
  content:{padding:16,paddingBottom:36,flexGrow:1},row:{justifyContent:'space-between'},
  error:{marginBottom:12,padding:12,borderRadius:12,color:colors.danger,backgroundColor:'#FFF1F1'},
  empty:{flex:1,minHeight:420,alignItems:'center',justifyContent:'center',padding:30},
  emptyTitle:{fontSize:18,fontWeight:'900',color:colors.ink},emptyText:{marginTop:8,textAlign:'center',lineHeight:21,color:colors.muted},
});
