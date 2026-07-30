import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { worksApi } from '../api/works';
import { StateView } from '../components/StateView';
import { WorkCard } from '../components/WorkCard';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import type { Work } from '../types/work';

type Sort = 'latest' | 'popular' | 'praise';
const PAGE_SIZE = 20;

export function WorksScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [works, setWorks] = useState<Work[]>([]);
  const [keyword, setKeyword] = useState('');
  const [submittedKeyword, setSubmittedKeyword] = useState('');
  const [sort, setSort] = useState<Sort>('latest');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (nextPage = 1, mode: 'replace' | 'append' = 'replace') => {
    if (mode === 'append') setLoadingMore(true); else setLoading(true);
    setError('');
    try {
      const data = await worksApi.list({ page: nextPage, pageSize: PAGE_SIZE, keyword: submittedKeyword, sortBy: sort });
      setWorks((current) => mode === 'append' ? [...current, ...data.list] : data.list);
      setPage(nextPage);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : '作品加载失败');
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [sort, submittedKeyword]);

  useEffect(() => { void load(); }, [load]);
  const canLoadMore = works.length < total;
  const submitSearch = () => setSubmittedKeyword(keyword.trim());

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.subtle} />
          <TextInput value={keyword} onChangeText={setKeyword} onSubmitEditing={submitSearch} returnKeyType="search" placeholder="搜索作品" placeholderTextColor={colors.subtle} style={styles.input} />
          {!!keyword && <Pressable onPress={() => { setKeyword(''); setSubmittedKeyword(''); }}><Ionicons name="close-circle" size={18} color={colors.subtle} /></Pressable>}
        </View>
        <View style={styles.sortRow}>
          {([['latest', '最新'], ['popular', '热门'], ['praise', '好评']] as const).map(([value, label]) => (
            <Pressable key={value} onPress={() => setSort(value)} style={[styles.sortButton, sort === value && styles.sortActive]}><Text style={[styles.sortText, sort === value && styles.sortTextActive]}>{label}</Text></Pressable>
          ))}
        </View>
      </View>

      {loading ? <StateView loading title="正在寻找作品" /> : error && !works.length ? <StateView title="加载失败" message={error} actionLabel="重试" onAction={() => void load()} /> : (
        <FlatList
          data={works}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <WorkCard compact work={item} onPress={() => navigation.navigate('WorkDetail', { codemaoId: String(item.codemao_work_id), title: item.name })} />}
          ListEmptyComponent={<StateView title="没有找到作品" message="换个关键词或排序方式试试" />}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.footer} color={colors.ink} /> : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} tintColor={colors.ink} />}
          onEndReached={() => { if (canLoadMore && !loadingMore) void load(page + 1, 'append'); }}
          onEndReachedThreshold={0.35}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  toolbar: { padding: 16, paddingBottom: 12 },
  searchBox: { height: 46, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  input: { flex: 1, color: colors.ink, fontSize: 15 },
  sortRow: { marginTop: 12, flexDirection: 'row', gap: 8 },
  sortButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 15, borderRadius: 11, backgroundColor: colors.surface },
  sortActive: { backgroundColor: colors.ink },
  sortText: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  sortTextActive: { color: '#FFF' },
  list: { paddingHorizontal: 16, paddingBottom: 30 },
  row: { justifyContent: 'space-between' },
  footer: { paddingVertical: 18 },
});
