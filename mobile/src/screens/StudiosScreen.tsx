import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { communityApi } from "../api/community";
import { resolveAssetUrl } from "../api/client";
import { StateView } from "../components/StateView";
import { colors } from "../theme";
import type { Studio } from "../types/community";
import type { RootStackParamList } from "../types/navigation";
export function StudiosScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<Studio[]>([]);
  const [keyword, setKeyword] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setError("");
    try {
      setItems(
        (await communityApi.studios({ page: 1, pageSize: 30, keyword: query }))
          .list,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "工作室加载失败");
    } finally {
      setLoading(false);
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <View style={styles.root}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.subtle} />
        <TextInput
          value={keyword}
          onChangeText={setKeyword}
          onSubmitEditing={() => setQuery(keyword.trim())}
          placeholder="搜索工作室"
          placeholderTextColor={colors.subtle}
          style={styles.input}
        />
      </View>
      {loading ? (
        <StateView loading title="正在寻找伙伴" />
      ) : error ? (
        <StateView
          title="加载失败"
          message={error}
          actionLabel="重试"
          onAction={() => void load()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(x) => String(x.id)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<StateView title="暂无工作室" />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                navigation.navigate("StudioDetail", {
                  id: item.id,
                  title: item.name,
                })
              }
              style={styles.card}
            >
              {resolveAssetUrl(item.cover || item.cover_url) ? (
                <Image
                  source={{
                    uri: resolveAssetUrl(item.cover || item.cover_url)!,
                  }}
                  style={styles.cover}
                />
              ) : (
                <View style={styles.coverEmpty}>
                  <Ionicons
                    name="people-outline"
                    size={32}
                    color={colors.subtle}
                  />
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.name}>{item.name}</Text>
                <Text numberOfLines={2} style={styles.desc}>
                  {item.description || "一起创作，一起成长"}
                </Text>
                <Text style={styles.meta}>
                  {item.member_count || 0} 位成员 · {item.work_count || 0}{" "}
                  个作品
                </Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  search: {
    height: 46,
    margin: 16,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, fontSize: 15, color: colors.ink },
  list: { padding: 16, paddingTop: 0 },
  card: {
    marginBottom: 12,
    overflow: "hidden",
    flexDirection: "row",
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  cover: { width: 112, height: 112 },
  coverEmpty: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.blueSoft,
  },
  body: { flex: 1, padding: 15 },
  name: { fontSize: 17, fontWeight: "900", color: colors.ink },
  desc: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.muted },
  meta: { marginTop: "auto", fontSize: 11, color: colors.subtle },
});
