import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communityApi } from '../api/community';
import { interactionApi } from '../api/interactions';
import { StateView } from '../components/StateView';
import { useSession } from '../session/SessionContext';
import { colors } from '../theme';
import type { Post } from '../types/community';
import type { RootStackParamList } from '../types/navigation';

type Props = NativeStackScreenProps<RootStackParamList, 'PostDetail'>;
export function PostDetailScreen({ route, navigation }: Props) {
  const { user } = useSession();
  const [post, setPost] = useState<Post | null>(null);
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => navigation.setOptions({ title: route.params.title || '帖子详情' }), [navigation, route.params.title]);
  const load = useCallback(async () => { setError(''); try { setPost(await communityApi.post(route.params.id)); } catch (e) { setError(e instanceof Error ? e.message : '帖子加载失败'); } }, [route.params.id]);
  useEffect(() => { void load(); }, [load]);
  if (!post && !error) return <StateView loading title="正在打开帖子" />;
  if (!post) return <StateView title="无法打开帖子" message={error} actionLabel="重试" onAction={() => void load()} />;
  const author = post.author || post.user;
  const requireLogin = () => { if (!user) { navigation.navigate('Login'); return true; } return false; };
  const like = async () => { if (requireLogin()) return; setActionError(''); try { const data=await interactionApi.likePost(post.id); setPost(current=>current?{...current,liked:data.liked,like_count:data.like_count}:current); } catch(e) { setActionError(e instanceof Error?e.message:'点赞失败'); } };
  const favorite = async () => { if (requireLogin()) return; try { const data=post.favorited?await interactionApi.unfavoritePost(post.id):await interactionApi.favoritePost(post.id); setPost(current=>current?{...current,...data}:current); } catch(e) { setActionError(e instanceof Error?e.message:'收藏失败'); } };
  const subscribe = async () => { if (requireLogin()) return; try { const data=await interactionApi.subscribePost(post.id); setPost(current=>current?{...current,subscribed:data.subscribed}:current); } catch(e) { setActionError(e instanceof Error?e.message:'关注失败'); } };
  const submit = async () => { if (requireLogin() || !reply.trim()) return; setBusy(true); setActionError(''); try { const comment=await interactionApi.createPostComment(post.id,reply.trim()); setPost(current=>current?{...current,comments:[comment,...(current.comments||[])],reply_count:(current.reply_count||0)+1}:current); setReply(''); } catch(e) { setActionError(e instanceof Error?e.message:'回复失败'); } finally { setBusy(false); } };
  return <SafeAreaView style={styles.safe} edges={['bottom']}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled"><View style={styles.article}><Text style={styles.category}>{post.category || '社区讨论'}</Text><Text style={styles.title}>{post.title}</Text><Pressable disabled={!author?.codemao_user_id} onPress={()=>author?.codemao_user_id&&navigation.navigate('UserProfile',{codemaoId:String(author.codemao_user_id)})}><Text style={styles.author}>{author?.nickname || author?.username || '社区成员'} · {post.view_count || 0} 次浏览</Text></Pressable><Text style={styles.body}>{post.content}</Text><View style={styles.postActions}><Pressable onPress={() => void like()} style={styles.like}><Ionicons name={post.liked?'heart':'heart-outline'} size={18} color={post.liked?colors.danger:colors.ink} /><Text style={styles.likeText}>{post.like_count || 0} 点赞</Text></Pressable><Pressable onPress={()=>void favorite()} style={styles.like}><Ionicons name={post.favorited?'star':'star-outline'} size={18} color={colors.ink}/><Text style={styles.likeText}>{post.favorited?'已收藏':'收藏'}</Text></Pressable><Pressable onPress={()=>void subscribe()} style={styles.like}><Ionicons name={post.subscribed?'notifications':'notifications-outline'} size={18} color={colors.ink}/><Text style={styles.likeText}>{post.subscribed?'已关注':'关注'}</Text></Pressable></View></View><Text style={styles.replyTitle}>回复 {post.reply_count || post.comment_count || 0}</Text><View style={styles.replyBox}><TextInput value={reply} onChangeText={setReply} multiline placeholder={user?'写下你的回复…':'登录后参与讨论'} placeholderTextColor={colors.subtle} style={styles.input}/><Pressable disabled={busy} onPress={()=>void submit()} style={styles.send}><Ionicons name="send" size={17} color={colors.ink}/></Pressable></View>{!!actionError&&<Text style={styles.error}>{actionError}</Text>}{post.comments?.length ? post.comments.map(comment => <View key={comment.id} style={styles.reply}><View style={styles.replyIcon}><Ionicons name="person" size={15} color="#FFF" /></View><View style={{ flex: 1 }}><Text style={styles.replyAuthor}>{comment.author?.nickname || comment.user?.nickname || comment.author?.username || '社区成员'}</Text><Text style={styles.replyBody}>{comment.content}</Text></View></View>) : <StateView title="还没有回复" message="登录后参与这场讨论" />}</ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:colors.background},content:{padding:16,paddingBottom:34},article:{padding:20,borderRadius:22,backgroundColor:colors.surface},category:{color:'#876400',fontSize:11,fontWeight:'800'},title:{marginTop:10,color:colors.ink,fontSize:25,lineHeight:34,fontWeight:'900'},author:{marginTop:13,color:colors.subtle,fontSize:12},body:{marginTop:22,color:colors.ink,fontSize:15,lineHeight:26},postActions:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:22},like:{paddingHorizontal:11,height:38,flexDirection:'row',alignItems:'center',gap:5,borderRadius:11,backgroundColor:colors.primarySoft},likeText:{fontSize:11,fontWeight:'800',color:colors.ink},replyTitle:{marginTop:24,marginBottom:12,color:colors.ink,fontSize:18,fontWeight:'900'},replyBox:{minHeight:50,paddingLeft:13,flexDirection:'row',alignItems:'center',borderRadius:14,backgroundColor:colors.surface,borderWidth:1,borderColor:colors.border},input:{flex:1,maxHeight:100,paddingVertical:10,fontSize:14,color:colors.ink},send:{width:48,height:48,alignItems:'center',justifyContent:'center'},error:{marginTop:8,fontSize:11,color:colors.danger},reply:{marginTop:10,padding:15,flexDirection:'row',gap:11,borderRadius:17,backgroundColor:colors.surface},replyIcon:{width:34,height:34,alignItems:'center',justifyContent:'center',borderRadius:11,backgroundColor:colors.ink},replyAuthor:{color:colors.ink,fontSize:13,fontWeight:'800'},replyBody:{marginTop:6,color:colors.muted,fontSize:14,lineHeight:22}});
