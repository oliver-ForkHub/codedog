import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "../session/SessionContext";
import { colors } from "../theme";
import type { RootStackParamList } from "../types/navigation";
type Props = NativeStackScreenProps<RootStackParamList, "Login">;
export function LoginScreen({ navigation }: Props) {
  const { login } = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!username.trim() || !password) {
      setError("请输入账号和密码");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await login(username.trim(), password);
      navigation.goBack();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.card}>
          <Text style={styles.title}>欢迎回来</Text>
          <Text style={styles.subtitle}>使用编程猫账号登录社区</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="用户名 / 手机号 / 邮箱"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="密码"
            placeholderTextColor={colors.subtle}
            style={styles.input}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <Pressable
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.button, busy && styles.disabled]}
          >
            <Text style={styles.buttonText}>{busy ? "正在登录…" : "登录"}</Text>
          </Pressable>
          <Text style={styles.note}>
          若服务端启用安全验证，登录时会自动弹出验证挑战。
          </Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  root: { flex: 1, justifyContent: "center", padding: 20 },
  card: { padding: 22, borderRadius: 24, backgroundColor: colors.surface },
  title: { fontSize: 27, fontWeight: "900", color: colors.ink },
  subtitle: {
    marginTop: 7,
    marginBottom: 20,
    fontSize: 13,
    color: colors.muted,
  },
  input: {
    height: 50,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.ink,
    fontSize: 15,
  },
  error: { marginBottom: 10, color: colors.danger, fontSize: 12 },
  button: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  buttonText: { fontSize: 15, fontWeight: "900", color: colors.ink },
  disabled: { opacity: 0.55 },
  note: { marginTop: 14, fontSize: 11, lineHeight: 17, color: colors.subtle },
});
