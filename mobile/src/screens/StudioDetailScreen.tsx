import { Ionicons } from "@expo/vector-icons";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { communityApi } from "../api/community";
import { resolveAssetUrl } from "../api/client";
import { StateView } from "../components/StateView";
import { WorkCard } from "../components/WorkCard";
import { useSession } from "../session/SessionContext";
import { colors } from "../theme";
import type { StudioDetail } from "../types/community";
import type { RootStackParamList } from "../types/navigation";

export function StudioDetailScreen({
  route,
  navigation,
}: NativeStackScreenProps<RootStackParamList, "StudioDetail">) {
  const { user } = useSession();
  const [detail, setDetail] = useState<StudioDetail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useLayoutEffect(
    () => navigation.setOptions({ title: route.params.title || "工作室详情" }),
    [navigation, route.params.title],
  );
  const load = useCallback(async () => {
    try {
      setError("");
      setDetail(await communityApi.studio(route.params.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "工作室加载失败");
    }
  }, [route.params.id]);
  useEffect(() => {
    void load();
  }, [load]);
  if (!detail && !error) return <StateView loading title="正在打开工作室" />;
  if (!detail)
    return (
      <StateView
        title="无法打开工作室"
        message={error}
        actionLabel="重试"
        onAction={() => void load()}
      />
    );
  const studio = detail.studio;
  const cover = resolveAssetUrl(studio.cover || studio.cover_url);
  const active = detail.userMemberStatus === "active";
  const pending = detail.userMemberStatus === "pending";
  const membership = async () => {
    if (!user) return navigation.navigate("Login");
    setBusy(true);
    try {
      if (active) {
        await communityApi.leaveStudio(studio.id);
        Alert.alert("已退出工作室");
      } else {
        await communityApi.joinStudio(studio.id);
        Alert.alert(
          "申请已提交",
          "开放工作室会直接加入，申请制工作室需等待审核",
        );
      }
      await load();
    } catch (e) {
      Alert.alert(
        active ? "退出失败" : "加入失败",
        e instanceof Error ? e.message : "请稍后重试",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cover} />
      ) : (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={55} color={colors.subtle} />
        </View>
      )}
      <View style={styles.card}>
        <Text style={styles.level}>LEVEL {studio.level || 1}</Text>
        <Text style={styles.name}>{studio.name}</Text>
        <Text style={styles.desc}>
          {studio.description || "这个工作室还没有填写介绍。"}
        </Text>
        <View style={styles.stats}>
          <Stat value={studio.member_count || 0} label="成员" />
          <Stat value={studio.work_count || detail.works.length} label="作品" />
          <Stat
            value={studio.join_type === "public" ? "开放" : "申请"}
            label="加入方式"
          />
        </View>
        {detail.joinBlockedReason ? (
          <Text style={styles.warning}>{detail.joinBlockedReason}</Text>
        ) : (
          <Pressable
            disabled={busy || pending}
            onPress={() => void membership()}
            style={[
              styles.join,
              active && styles.leave,
              pending && styles.disabled,
            ]}
          >
            {busy ? (
              <ActivityIndicator color={colors.ink} />
            ) : (
              <Text style={styles.joinText}>
                {active ? "退出工作室" : pending ? "申请审核中" : "加入工作室"}
              </Text>
            )}
          </Pressable>
        )}
        {active && (
          <Pressable
            onPress={() =>
              navigation.navigate("StudioSubmit", {
                id: studio.id,
                title: studio.name,
              })
            }
            style={styles.submit}
          >
            <Text style={styles.submitText}>投稿我的作品</Text>
          </Pressable>
        )}
        {['owner', 'vice_owner', 'admin'].includes(detail.userRole || '') && (
          <Pressable
            onPress={() => navigation.navigate('StudioManage', { id: studio.id, title: studio.name })}
            style={styles.submit}
          >
            <Text style={styles.submitText}>审核成员与投稿</Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.heading}>工作室作品</Text>
      <View style={styles.grid}>
        {detail.works.map((work) => (
          <WorkCard
            key={work.id}
            compact
            work={work}
            onPress={() =>
              navigation.navigate("WorkDetail", {
                codemaoId: work.codemao_work_id,
                title: work.name,
              })
            }
          />
        ))}
      </View>
      <Text style={styles.heading}>成员</Text>
      <View style={styles.members}>
        {detail.members.map((member) => (
          <Pressable
            key={member.id}
            style={styles.member}
            onPress={() =>
              member.user.codemao_user_id &&
              navigation.navigate("UserProfile", {
                codemaoId: String(member.user.codemao_user_id),
              })
            }
          >
            <View style={styles.memberAvatar}>
              <Text style={styles.memberInitial}>
                {(member.user.nickname || member.user.username || "?").slice(
                  0,
                  1,
                )}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.memberName}>
                {member.user.nickname || member.user.username}
              </Text>
              <Text style={styles.role}>{member.memberRole}</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.subtle} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.num}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  cover: { width: "100%", aspectRatio: 1.7, borderRadius: 22 },
  empty: {
    width: "100%",
    aspectRatio: 1.7,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
    backgroundColor: colors.blueSoft,
  },
  card: {
    marginTop: 14,
    padding: 21,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  level: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    color: "#876400",
  },
  name: { marginTop: 8, fontSize: 26, fontWeight: "900", color: colors.ink },
  desc: { marginTop: 10, fontSize: 14, lineHeight: 23, color: colors.muted },
  stats: {
    marginTop: 24,
    paddingTop: 18,
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  stat: { flex: 1, alignItems: "center" },
  num: {
    textAlign: "center",
    fontSize: 16,
    fontWeight: "900",
    color: colors.ink,
  },
  label: {
    marginTop: 3,
    textAlign: "center",
    fontSize: 10,
    color: colors.subtle,
  },
  join: {
    height: 46,
    marginTop: 18,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  leave: { backgroundColor: "#FFF2F2" },
  disabled: { opacity: 0.55 },
  joinText: { fontWeight: "900", color: colors.ink },
  submit: {
    height: 44,
    marginTop: 9,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
  },
  submitText: { fontWeight: "800", color: colors.ink },
  warning: {
    marginTop: 16,
    padding: 11,
    borderRadius: 11,
    color: colors.danger,
    backgroundColor: "#FFF2F2",
  },
  heading: {
    marginVertical: 16,
    fontSize: 18,
    fontWeight: "900",
    color: colors.ink,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
  },
  members: {
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: colors.surface,
  },
  member: {
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  memberAvatar: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: colors.ink,
  },
  memberInitial: { fontWeight: "900", color: "#fff" },
  memberName: { fontWeight: "800", color: colors.ink },
  role: { marginTop: 2, fontSize: 10, color: colors.subtle },
});
