import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, Linking, NativeScrollEvent, NativeSyntheticEvent, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communityApi } from '../api/community';
import { worksApi } from '../api/works';
import { StateView } from '../components/StateView';
import { WorkCard } from '../components/WorkCard';
import { colors } from '../theme';
import type { Banner, Post } from '../types/community';
import { resolveAssetUrl } from '../api/client';
import type { RootStackParamList } from '../types/navigation';
import type { Work } from '../types/work';

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [featured, setFeatured] = useState<Work[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [latest, setLatest] = useState<Work[]>([]);
  const [hot, setHot] = useState<Work[]>([]);
  const [featuredPosts, setFeaturedPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true); setError('');
    try {
      const [bannerData, featuredData, latestData, hotData, postData] = await Promise.all([
        communityApi.banners(),
        worksApi.featured(), worksApi.list({ page: 1, pageSize: 10, sortBy: 'latest' }),
        worksApi.list({ page: 1, pageSize: 10, sortBy: 'popular' }), communityApi.posts({ page: 1, pageSize: 4, category: 'essence' }),
      ]);
      setBanners(bannerData); setFeatured(featuredData.slice(0, 10)); setLatest(latestData.list.slice(0, 8));
      setHot(hotData.list.slice(0, 10)); setFeaturedPosts(postData.list.slice(0, 4));
    } catch (err) { setError(err instanceof Error ? err.message : '暂时无法连接社区'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  const openWork = (work: Work) => navigation.navigate('WorkDetail', { codemaoId: String(work.codemao_work_id), title: work.name });
  const discover = () => navigation.navigate('MainTabs', { screen: 'Discover' });

  return <SafeAreaView style={styles.safe} edges={['top']}><ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.ink}/>}>
    <View style={styles.header}><View><Text style={styles.brand}>编程狗</Text><Text style={styles.greeting}>发现有趣的创作</Text></View><Pressable onPress={() => navigation.navigate('MainTabs', { screen: 'Mine' })} style={styles.avatar}><Ionicons name="person-outline" size={20} color={colors.ink}/></Pressable></View>
    {!!banners.length && <BannerCarousel banners={banners}/>}<View style={styles.hero}><View style={styles.heroCopy}><Text style={styles.eyebrow}>CODING DOG COMMUNITY</Text><Text style={styles.heroTitle}>灵感，从一次探索开始</Text><Text style={styles.heroText}>浏览社区作品，看看大家今天创造了什么。</Text><Pressable onPress={discover} style={styles.heroButton}><Text style={styles.heroButtonText}>开始发现</Text><Ionicons name="arrow-forward" size={16} color={colors.ink}/></Pressable></View><View style={styles.heroMark}><Ionicons name="code-slash" size={36} color={colors.ink}/></View></View>
    {loading ? <StateView loading title="正在加载社区"/> : error ? <StateView title="连接失败" message={error} actionLabel="重新加载" onAction={() => void load()}/> : <>
      <WorkRail title="推荐作品" items={featured} empty="暂无推荐作品" onMore={discover} onOpen={openWork}/>
      <SectionHeader title="最新作品" action="更多" onPress={discover}/><View style={styles.grid}>{latest.map((work) => <WorkCard key={work.id} compact work={work} onPress={() => openWork(work)}/>)}</View>
      <WorkRail title="热门作品" items={hot} empty="暂无热门作品" onMore={discover} onOpen={openWork}/>
      {!!featuredPosts.length && <><SectionHeader title="社区精选" action="进入论坛" onPress={() => navigation.navigate('MainTabs', { screen: 'Forum' })}/><View style={styles.posts}>{featuredPosts.map((post) => <Pressable key={post.id} onPress={() => navigation.navigate('PostDetail', { id: post.id, title: post.title })} style={styles.post}><View style={styles.postIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.ink}/></View><View style={styles.postCopy}><Text numberOfLines={1} style={styles.postTitle}>{post.title}</Text><Text numberOfLines={1} style={styles.postMeta}>{post.author?.nickname || post.author?.username || '社区成员'} · {post.reply_count || post.comment_count || 0} 条回复</Text></View><Ionicons name="chevron-forward" size={17} color={colors.subtle}/></Pressable>)}</View></>}
      <Pressable onPress={() => navigation.navigate('Studios')} style={styles.studioEntry}><View><Text style={styles.studioTitle}>寻找一起创作的人</Text><Text style={styles.studioText}>浏览社区工作室，认识新的伙伴</Text></View><Ionicons name="people-outline" size={28} color={colors.ink}/></Pressable>
    </>}
  </ScrollView></SafeAreaView>;
}

function WorkRail({ title, items, empty, onMore, onOpen }: { title:string; items:Work[]; empty:string; onMore:()=>void; onOpen:(work:Work)=>void }) { return <><SectionHeader title={title} action="查看全部" onPress={onMore}/>{items.length ? <FlatList horizontal data={items} keyExtractor={(item) => String(item.id)} renderItem={({item}) => <WorkCard work={item} onPress={() => onOpen(item)}/>} contentContainerStyle={styles.horizontalList} ItemSeparatorComponent={() => <View style={styles.separator}/>} showsHorizontalScrollIndicator={false}/> : <Text style={styles.empty}>{empty}</Text>}</>; }
function SectionHeader({ title, action, onPress }: { title:string; action:string; onPress:()=>void }) { return <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{title}</Text><Pressable onPress={onPress}><Text style={styles.sectionAction}>{action}</Text></Pressable></View>; }
function BannerCarousel({banners}:{banners:Banner[]}){const{width}=useWindowDimensions();const itemWidth=width-36;const ref=useRef<ScrollView>(null);const[index,setIndex]=useState(0);useEffect(()=>{if(banners.length<2)return;const timer=setInterval(()=>setIndex((current)=>{const next=(current+1)%banners.length;ref.current?.scrollTo({x:next*itemWidth,animated:true});return next;}),4500);return()=>clearInterval(timer);},[banners.length,itemWidth]);const onScroll=(event:NativeSyntheticEvent<NativeScrollEvent>)=>setIndex(Math.round(event.nativeEvent.contentOffset.x/itemWidth));return <View style={styles.carousel}><ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll}>{banners.map((banner)=>{const image=resolveAssetUrl(banner.image_url);return <Pressable accessibilityLabel={banner.title} key={banner.id} disabled={!banner.link_url} onPress={()=>banner.link_url&&void Linking.openURL(banner.link_url)} style={[styles.banner,{width:itemWidth}]}>{image&&<Image source={{uri:image}} style={styles.bannerImage} resizeMode="contain"/>}</Pressable>})}</ScrollView>{banners.length>1&&<View pointerEvents="none" style={styles.dots}>{banners.map((banner,i)=><View key={banner.id} style={[styles.dot,i===index&&styles.dotActive]}/>)}</View>}</View>}

const styles = StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{paddingBottom:36},header:{paddingHorizontal:18,paddingVertical:14,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:colors.ink,fontSize:23,fontWeight:'900'},greeting:{marginTop:2,color:colors.muted,fontSize:12},avatar:{width:40,height:40,alignItems:'center',justifyContent:'center',borderRadius:14,borderWidth:1,borderColor:colors.border,backgroundColor:colors.surface},carousel:{marginHorizontal:18,marginBottom:12,overflow:'hidden',borderRadius:20,backgroundColor:'#EEF1F5'},banner:{aspectRatio:3.4,overflow:'hidden',alignItems:'center',justifyContent:'center'},bannerImage:{width:'100%',height:'100%'},dots:{position:'absolute',left:0,right:0,bottom:9,flexDirection:'row',justifyContent:'center',gap:5},dot:{width:6,height:6,borderRadius:3,backgroundColor:'rgba(255,255,255,.72)',borderWidth:1,borderColor:'rgba(23,32,51,.24)'},dotActive:{width:18,backgroundColor:colors.primary,borderColor:'rgba(23,32,51,.42)'},hero:{minHeight:210,margin:18,marginTop:4,overflow:'hidden',flexDirection:'row',borderRadius:24,backgroundColor:colors.primarySoft},heroCopy:{flex:1,padding:22,zIndex:1},eyebrow:{color:'#8A6500',fontSize:9,fontWeight:'900',letterSpacing:1.1},heroTitle:{maxWidth:230,marginTop:12,color:colors.ink,fontSize:27,lineHeight:33,fontWeight:'900'},heroText:{maxWidth:240,marginTop:8,color:colors.muted,fontSize:13,lineHeight:20},heroButton:{alignSelf:'flex-start',minHeight:40,marginTop:16,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:7,borderRadius:12,backgroundColor:colors.primary},heroButtonText:{color:colors.ink,fontSize:13,fontWeight:'800'},heroMark:{position:'absolute',right:-24,bottom:-28,width:130,height:130,alignItems:'center',justifyContent:'center',borderRadius:65,backgroundColor:'#FFF'},sectionHeader:{marginTop:12,marginBottom:12,paddingHorizontal:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},sectionTitle:{color:colors.ink,fontSize:19,fontWeight:'900'},sectionAction:{color:colors.muted,fontSize:13,fontWeight:'700'},horizontalList:{paddingHorizontal:18,paddingBottom:18},separator:{width:12},grid:{paddingHorizontal:18,flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between'},empty:{paddingHorizontal:18,paddingBottom:20,color:colors.subtle,fontSize:12},posts:{marginHorizontal:18,overflow:'hidden',borderRadius:18,backgroundColor:colors.surface},post:{minHeight:68,paddingHorizontal:14,flexDirection:'row',alignItems:'center',gap:11,borderBottomWidth:1,borderBottomColor:colors.border},postIcon:{width:36,height:36,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:colors.primarySoft},postCopy:{flex:1},postTitle:{color:colors.ink,fontSize:14,fontWeight:'800'},postMeta:{marginTop:4,color:colors.subtle,fontSize:11},studioEntry:{margin:18,minHeight:92,padding:18,flexDirection:'row',alignItems:'center',justifyContent:'space-between',borderRadius:20,backgroundColor:colors.blueSoft},studioTitle:{color:colors.ink,fontSize:17,fontWeight:'900'},studioText:{marginTop:5,color:colors.muted,fontSize:12}});
