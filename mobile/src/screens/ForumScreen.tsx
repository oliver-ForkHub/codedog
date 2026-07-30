import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { communityApi } from "../api/community";
import { StateView } from "../components/StateView";
import { colors } from "../theme";
import type { Post } from "../types/community";
import type { RootStackParamList } from "../types/navigation";

export function ForumScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [posts, setPosts] = useState<Post[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async (nextPage = 1, append = false) => {
    if (append) setLoadingMore(true);
    setError("");
    try {
      const data = await communityApi.posts({ page: nextPage, pageSize: 20, keyword: query });
      setPosts(current => append ? [...current, ...data.list] : data.list);
      setPage(nextPage);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "帖子加载失败");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      setRefreshing(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>论坛</Text>
          <Text style={styles.subtitle}>分享灵感，也认真解决问题</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("MainTabs", { screen: "Publish" })}
          style={styles.write}
        >
          <Ionicons name="create-outline" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.subtle} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => setQuery(keyword.trim())}
          placeholder="搜索帖子"
          placeholderTextColor={colors.subtle}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
      {loading ? (
        <StateView loading title="正在加载讨论" />
      ) : error && !posts.length ? (
        <StateView
          title="论坛暂时不可用"
          message={error}
          actionLabel="重试"
          onAction={() => void load()}
        />
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load();
              }}
            />
          }
          ListEmptyComponent={
            <StateView title="暂无帖子" message="来发布第一条讨论吧" />
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.ink} /> : null}
          onEndReached={() => { if (posts.length < total && !loadingMore) void load(page + 1, true); }}
          onEndReachedThreshold={0.35}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate("PostDetail", {
                  id: item.id,
                  title: item.title,
                })
              }
              style={styles.post}
            >
              <View style={styles.postTop}>
                {item.is_top && <Text style={styles.badge}>置顶</Text>}
                {item.is_essence && <Text style={styles.essence}>精华</Text>}
                <Text style={styles.category}>{item.category || "讨论"}</Text>
              </View>
              <Text numberOfLines={2} style={styles.postTitle}>
                {item.title}
              </Text>
              <Text numberOfLines={2} style={styles.excerpt}>
                {item.content}
              </Text>
              <View style={styles.meta}>
                <Text style={styles.author}>
                  {item.author?.nickname ||
                    item.user?.nickname ||
                    item.author?.username ||
                    "社区成员"}
                </Text>
                <Ionicons name="eye-outline" size={14} color={colors.subtle} />
                <Text style={styles.metaText}>{item.view_count || 0}</Text>
                <Ionicons
                  name="chatbubble-outline"
                  size={13}
                  color={colors.subtle}
                />
                <Text style={styles.metaText}>
                  {item.reply_count || item.comment_count || 0}
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 25, fontWeight: "900", color: colors.ink },
  subtitle: { marginTop: 3, fontSize: 12, color: colors.muted },
  write: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  search: {
    height: 46,
    marginHorizontal: 18,
    marginBottom: 12,
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  list: { padding: 18, paddingTop: 2, paddingBottom: 30 },
  post: {
    marginBottom: 12,
    padding: 17,
    borderRadius: 18,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  postTop: { flexDirection: "row", alignItems: "center", gap: 6 },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.primary,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "800",
  },
  essence: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.blueSoft,
    color: colors.ink,
    fontSize: 10,
    fontWeight: "800",
  },
  category: { color: colors.subtle, fontSize: 11 },
  postTitle: {
    marginTop: 9,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    color: colors.ink,
  },
  excerpt: { marginTop: 6, fontSize: 13, lineHeight: 20, color: colors.muted },
  meta: { marginTop: 13, flexDirection: "row", alignItems: "center", gap: 5 },
  author: { flex: 1, fontSize: 11, fontWeight: "700", color: colors.muted },
  metaText: { marginRight: 5, fontSize: 11, color: colors.subtle },
});
