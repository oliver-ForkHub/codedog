import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { worksApi } from '../api/works';
import { StateView } from '../components/StateView';
import { WorkCard } from '../components/WorkCard';
import { colors } from '../theme';
import type { RootStackParamList } from '../types/navigation';
import type { Work } from '../types/work';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [featured, setFeatured] = useState<Work[]>([]);
  const [latest, setLatest] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [featuredData, latestData] = await Promise.all([
        worksApi.featured(),
        worksApi.list({ page: 1, pageSize: 8, sortBy: 'latest' }),
      ]);
      setFeatured(featuredData.slice(0, 8));
      setLatest(latestData.list.slice(0, 8));
    } catch (err) {
      setError(err instanceof Error ? err.message : '暂时无法连接社区');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const openWork = (work: Work) => navigation.navigate('WorkDetail', { codemaoId: String(work.codemao_work_id), title: work.name });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.ink} />}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>编程狗</Text>
            <Text style={styles.greeting}>发现有趣的创作</Text>
          </View>
          <Pressable accessibilityRole="button" style={styles.avatar}><Ionicons name="person-outline" size={20} color={colors.ink} /></Pressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>CODING DOG COMMUNITY</Text>
            <Text style={styles.heroTitle}>灵感，从一次探索开始</Text>
            <Text style={styles.heroText}>浏览社区作品，看看大家今天创造了什么。</Text>
              <Pressable accessibilityRole="button" onPress={() => navigation.navigate('MainTabs', { screen: 'Discover' })} style={styles.heroButton}>
              <Text style={styles.heroButtonText}>开始发现</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.ink} />
            </Pressable>
          </View>
          <View style={styles.heroMark}><Ionicons name="code-slash" size={36} color={colors.ink} /></View>
        </View>

        {loading ? (
          <StateView loading title="正在加载社区" />
        ) : error ? (
          <StateView title="连接失败" message={error} actionLabel="重新加载" onAction={() => void load()} />
        ) : (
          <>
            <SectionHeader title="推荐作品" action="查看全部" onPress={() => navigation.navigate('MainTabs', { screen: 'Discover' })} />
            {featured.length ? (
              <FlatList horizontal data={featured} keyExtractor={(item) => String(item.id)} renderItem={({ item }) => <WorkCard work={item} onPress={() => openWork(item)} />} contentContainerStyle={styles.horizontalList} ItemSeparatorComponent={() => <View style={{ width: 12 }} />} showsHorizontalScrollIndicator={false} scrollEnabled />
            ) : <StateView title="暂无推荐作品" message="推荐内容将在管理员设置后显示" />}

            <SectionHeader title="最新作品" action="更多" onPress={() => navigation.navigate('MainTabs', { screen: 'Discover' })} />
            <View style={styles.grid}>{latest.map((work) => <WorkCard key={work.id} compact work={work} onPress={() => openWork(work)} />)}</View>
            <Pressable onPress={() => navigation.navigate('Studios')} style={styles.studioEntry}><View><Text style={styles.studioTitle}>寻找一起创作的人</Text><Text style={styles.studioText}>浏览社区工作室，认识新的伙伴</Text></View><Ionicons name="people-outline" size={28} color={colors.ink} /></Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) {
  return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable></View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingBottom: 36 },
  header: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: colors.ink, fontSize: 23, fontWeight: '900', letterSpacing: -0.7 },
  greeting: { marginTop: 2, color: colors.muted, fontSize: 12 },
  avatar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  hero: { minHeight: 210, margin: 18, marginTop: 4, overflow: 'hidden', flexDirection: 'row', borderRadius: 24, backgroundColor: colors.primarySoft },
  heroCopy: { flex: 1, padding: 22, zIndex: 1 },
  eyebrow: { color: '#8A6500', fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  heroTitle: { maxWidth: 230, marginTop: 12, color: colors.ink, fontSize: 27, lineHeight: 33, fontWeight: '900', letterSpacing: -0.8 },
  heroText: { maxWidth: 240, marginTop: 8, color: colors.muted, fontSize: 13, lineHeight: 20 },
  heroButton: { alignSelf: 'flex-start', minHeight: 40, marginTop: 16, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 12, backgroundColor: colors.primary },
  heroButtonText: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  heroMark: { position: 'absolute', right: -24, bottom: -28, width: 130, height: 130, alignItems: 'center', justifyContent: 'center', borderRadius: 65, backgroundColor: '#FFFFFF' },
  sectionHeader: { marginTop: 12, marginBottom: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.ink, fontSize: 19, fontWeight: '900' },
  sectionAction: { color: colors.muted, fontSize: 13, fontWeight: '700' },
  horizontalList: { paddingHorizontal: 18, paddingBottom: 18 },
  grid: { paddingHorizontal: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  studioEntry: { margin: 18, marginTop: 8, minHeight: 92, padding: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 20, backgroundColor: colors.blueSoft },
  studioTitle: { color: colors.ink, fontSize: 17, fontWeight: '900' },
  studioText: { marginTop: 5, color: colors.muted, fontSize: 12 },
});
