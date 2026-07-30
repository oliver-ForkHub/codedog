import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { resolveAssetUrl } from '../api/client';
import { colors, shadow } from '../theme';
import type { Work } from '../types/work';

type Props = { work: Work; compact?: boolean; onPress: () => void; onLongPress?: () => void };

export function WorkCard({ work, compact, onPress, onLongPress }: Props) {
  const imageUrl = resolveAssetUrl(work.preview);
  const authorName = work.author?.nickname || work.author?.username || '社区创作者';

  return (
    <Pressable accessibilityRole="button" onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [styles.card, compact && styles.compact, pressed && styles.pressed]}>
      <View style={[styles.cover, compact && styles.compactCover]}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}><Ionicons name="cube-outline" size={32} color={colors.subtle} /></View>
        )}
        {!!work.type && <Text style={styles.tag}>{work.type}</Text>}
      </View>
      <View style={styles.body}>
        <Text numberOfLines={1} style={styles.title}>{work.name}</Text>
        <Text numberOfLines={1} style={styles.author}>{authorName}</Text>
        <View style={styles.meta}>
          <Ionicons name="eye-outline" size={13} color={colors.subtle} />
          <Text style={styles.metaText}>{work.view_times || 0}</Text>
          <Ionicons name="heart-outline" size={13} color={colors.subtle} />
          <Text style={styles.metaText}>{work.praise_times || 0}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 202, overflow: 'hidden', borderRadius: 18, backgroundColor: colors.surface, ...shadow },
  compact: { width: '48.4%', marginBottom: 14 },
  cover: { height: 128, backgroundColor: colors.blueSoft },
  compactCover: { height: 112 },
  image: { width: '100%', height: '100%' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', top: 10, left: 10, overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(23,32,51,.82)', color: '#FFF', fontSize: 10, fontWeight: '700' },
  body: { padding: 12 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  author: { marginTop: 4, color: colors.muted, fontSize: 12 },
  meta: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { marginRight: 7, color: colors.subtle, fontSize: 11 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.985 }] },
});
