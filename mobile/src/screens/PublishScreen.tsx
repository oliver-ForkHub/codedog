import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { communityApi } from '../api/community';
import { worksApi } from '../api/works';
import { useSession } from '../session/SessionContext';
import { colors } from '../theme';
import type { ForumBoard, Studio } from '../types/community';
import type { RootStackParamList } from '../types/navigation';

type Mode = 'work' | 'post';
type PostType = 'discussion' | 'question' | 'tutorial';

const postTypeLabels: Record<PostType, string> = { discussion: '讨论', question: '提问', tutorial: '教程' };

export function PublishScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { user } = useSession();
  const loadedDraft = useRef(false);
  const [mode, setMode] = useState<Mode>('work');
  const [workId, setWorkId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [boards, setBoards] = useState<ForumBoard[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [postType, setPostType] = useState<PostType>('discussion');
  const [studios, setStudios] = useState<Studio[]>([]);
  const [studioId, setStudioId] = useState<number | null>(null);
  const [tags, setTags] = useState('');
  const [cover, setCover] = useState('');
  const [coverBusy, setCoverBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [draftState, setDraftState] = useState('');
  const selectedBoard = useMemo(() => boards.find((board) => board.id === boardId), [boards, boardId]);

  useEffect(() => {
    void communityApi.boards().then((items) => {
      setBoards(items);
      setBoardId((current) => current ?? items[0]?.id ?? null);
    }).catch(() => setError('版块加载失败，请稍后重试'));
  }, []);

  useEffect(() => {
    if (!user) return;
    void communityApi.myStudios().then((items) => setStudios(items.filter((studio) => studio.memberStatus === 'active'))).catch(() => setStudios([]));
  }, [user]);

  useEffect(() => {
    if (!selectedBoard) return;
    setPostType(selectedBoard.slug === 'question' ? 'question' : selectedBoard.slug === 'tutorial' ? 'tutorial' : 'discussion');
    if (selectedBoard.slug !== 'studios') setStudioId(null);
  }, [selectedBoard]);

  useEffect(() => {
    if (!user || loadedDraft.current) return;
    loadedDraft.current = true;
    void communityApi.getDraft().then((draft) => {
      if (!draft) return;
      setTitle(draft.title || ''); setContent(draft.content || ''); setBoardId(draft.board_id || null);
      setPostType(draft.post_type || 'discussion'); setCover(draft.cover || ''); setTags((draft.tags || []).join(', '));
      setDraftState('已恢复草稿');
    }).catch(() => null);
  }, [user]);

  useEffect(() => {
    if (!user || mode !== 'post' || !loadedDraft.current || (!title.trim() && !content.trim() && !cover && !tags.trim())) return;
    setDraftState('保存中…');
    const timer = setTimeout(() => {
      void communityApi.saveDraft({ title, content, board_id: boardId, post_type: postType, cover, tags: parseTags(tags) })
        .then(() => setDraftState('草稿已保存')).catch(() => setDraftState('草稿保存失败'));
    }, 900);
    return () => clearTimeout(timer);
  }, [title, content, boardId, postType, cover, tags, mode, user]);

  const pickCover = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError('需要相册权限才能选择封面'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [16, 9], quality: 0.9 });
    if (result.canceled) return;
    const asset = result.assets[0];
    setCoverBusy(true); setError('');
    try {
      const uploaded = await communityApi.uploadImage(asset.uri, asset.fileName || 'cover.jpg', asset.mimeType || 'image/jpeg');
      setCover(uploaded.url);
    } catch (e) { setError(e instanceof Error ? e.message : '封面上传失败'); }
    finally { setCoverBusy(false); }
  };

  const submit = async () => {
    if (!user) { navigation.navigate('Login'); return; }
    setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'work') {
        if (!/^\d+$/.test(workId.trim())) throw new Error('请输入正确的编程猫作品 ID');
        const work = await worksApi.publish(workId.trim());
        navigation.navigate('WorkDetail', { codemaoId: String(work.codemao_work_id), title: work.name });
      } else {
        if (title.trim().length < 2 || content.trim().length < 5) throw new Error('标题或正文内容过短');
        if (!boardId) throw new Error('请选择发布版块');
        if (selectedBoard?.slug === 'studios' && !studioId) throw new Error('请选择要发布到的工作室');
        const post = await communityApi.createPost({ title: title.trim(), content: content.trim(), board_id: boardId, studio_id: studioId || undefined, post_type: postType, tags: parseTags(tags), cover: cover || undefined });
        await communityApi.deleteDraft().catch(() => null);
        setTitle(''); setContent(''); setTags(''); setCover(''); setDraftState('');
        navigation.navigate('PostDetail', { id: post.id, title: post.title });
      }
    } catch (e) { setError(e instanceof Error ? e.message : '发布失败'); }
    finally { setBusy(false); }
  };

  return <SafeAreaView style={styles.safe} edges={['top']}><KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.pageTitle}>创作</Text><Text style={styles.subtitle}>把作品和想法分享给社区</Text>
    <View style={styles.switch}>{(['work', 'post'] as Mode[]).map((value) => <Pressable key={value} onPress={() => { setMode(value); setError(''); setMessage(''); }} style={[styles.switchItem, mode === value && styles.switchActive]}><Text style={[styles.switchText, mode === value && styles.switchTextActive]}>{value === 'work' ? '发布作品' : '发布帖子'}</Text></Pressable>)}</View>
    <View style={styles.card}>{mode === 'work' ? <><FieldLabel text="编程猫作品 ID"/><TextInput value={workId} onChangeText={setWorkId} keyboardType="number-pad" placeholder="例如：123456789" placeholderTextColor={colors.subtle} style={styles.input}/><Text style={styles.help}>填写作品 ID 后即可导入并发布。</Text></> : <>
      <View style={styles.labelRow}><FieldLabel text="标题"/><Text style={styles.draft}>{draftState}</Text></View><TextInput value={title} onChangeText={setTitle} maxLength={100} placeholder="清楚地说明你想讨论什么" placeholderTextColor={colors.subtle} style={styles.input}/>
      <FieldLabel text="发布版块"/><View style={styles.chips}>{boards.map((board) => <Choice key={board.id} active={board.id === boardId} label={`${board.icon || ''} ${board.name}`.trim()} onPress={() => setBoardId(board.id)}/>)}</View>
      {selectedBoard?.slug === 'studios' && <><FieldLabel text="工作室"/><View style={styles.chips}>{studios.map((studio) => <Choice key={studio.id} active={studio.id === studioId} label={studio.name} onPress={() => setStudioId(studio.id)}/>)}</View>{!studios.length && <Text style={styles.help}>你尚未加入可发帖的工作室。</Text>}</>}
      <FieldLabel text="帖子类型"/><View style={styles.chips}>{(Object.keys(postTypeLabels) as PostType[]).map((value) => <Choice key={value} active={value === postType} label={postTypeLabels[value]} onPress={() => setPostType(value)}/>)}</View>
      <FieldLabel text="正文"/><TextInput value={content} onChangeText={setContent} maxLength={50000} multiline textAlignVertical="top" placeholder="分享想法、问题或经验…" placeholderTextColor={colors.subtle} style={styles.textarea}/>
      <FieldLabel text="封面（可选）"/>{cover ? <Image source={{ uri: cover }} style={styles.cover} resizeMode="cover"/> : null}<Pressable disabled={coverBusy} onPress={() => void pickCover()} style={styles.secondaryButton}><Text style={styles.secondaryText}>{coverBusy ? '上传中…' : cover ? '更换封面' : '选择封面图片'}</Text></Pressable>
      <FieldLabel text="标签（可选）"/><TextInput value={tags} onChangeText={setTags} maxLength={300} placeholder="多个标签用逗号分隔" placeholderTextColor={colors.subtle} style={styles.input}/>
    </>}
    {!!error && <Text style={styles.error}>{error}</Text>}{!!message && <Text style={styles.success}>{message}</Text>}
    <Pressable disabled={busy || coverBusy} onPress={() => void submit()} style={[styles.button, (busy || coverBusy) && styles.disabled]}><Text style={styles.buttonText}>{!user ? '登录后发布' : busy ? '正在提交…' : '确认发布'}</Text></Pressable>
    </View></ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

function parseTags(value: string) { return [...new Set(value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 20); }
function FieldLabel({ text }: { text: string }) { return <Text style={styles.label}>{text}</Text>; }
function Choice({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}><Text numberOfLines={1} style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></Pressable>; }

const styles = StyleSheet.create({
  safe:{flex:1,backgroundColor:colors.background},flex:{flex:1},content:{padding:18,paddingBottom:110},pageTitle:{fontSize:26,fontWeight:'900',color:colors.ink},subtitle:{marginTop:4,fontSize:12,color:colors.muted},switch:{height:46,marginTop:18,padding:4,flexDirection:'row',borderRadius:14,backgroundColor:'#E8ECF2'},switchItem:{flex:1,alignItems:'center',justifyContent:'center',borderRadius:11},switchActive:{backgroundColor:colors.surface},switchText:{fontSize:13,fontWeight:'700',color:colors.muted},switchTextActive:{color:colors.ink},card:{marginTop:14,padding:18,borderRadius:22,backgroundColor:colors.surface},labelRow:{flexDirection:'row',justifyContent:'space-between'},label:{marginTop:4,marginBottom:8,fontSize:13,fontWeight:'800',color:colors.ink},draft:{fontSize:10,color:colors.subtle},input:{height:48,marginBottom:14,paddingHorizontal:14,borderRadius:14,borderWidth:1,borderColor:colors.border,fontSize:15,color:colors.ink},textarea:{minHeight:210,marginBottom:14,padding:14,borderRadius:14,borderWidth:1,borderColor:colors.border,fontSize:15,lineHeight:23,color:colors.ink},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14},chip:{maxWidth:'100%',paddingHorizontal:12,paddingVertical:9,borderRadius:12,borderWidth:1,borderColor:colors.border,backgroundColor:'#F8FAFC'},chipActive:{borderColor:colors.primary,backgroundColor:colors.primarySoft},chipText:{fontSize:12,fontWeight:'700',color:colors.muted},chipTextActive:{color:colors.ink},cover:{width:'100%',aspectRatio:16/9,marginBottom:10,borderRadius:14,backgroundColor:'#EEF1F5'},secondaryButton:{height:44,marginBottom:14,alignItems:'center',justifyContent:'center',borderRadius:13,borderWidth:1,borderColor:colors.border},secondaryText:{fontSize:13,fontWeight:'800',color:colors.ink},help:{marginTop:-4,marginBottom:12,fontSize:11,lineHeight:17,color:colors.subtle},error:{marginTop:4,color:colors.danger,fontSize:12},success:{marginTop:4,color:'#23844E',fontSize:12},button:{height:50,marginTop:16,alignItems:'center',justifyContent:'center',borderRadius:14,backgroundColor:colors.primary},buttonText:{fontSize:15,fontWeight:'900',color:colors.ink},disabled:{opacity:.55}
});
