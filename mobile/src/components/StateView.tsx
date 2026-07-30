import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = {
  loading?: boolean;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
};

export function StateView({ loading, title, message, actionLabel, onAction }: Props) {
  return (
    <View style={styles.root}>
      {loading ? <ActivityIndicator color={colors.ink} /> : <Ionicons name="file-tray-outline" size={38} color={colors.subtle} />}
      <Text style={styles.title}>{title}</Text>
      {!!message && <Text style={styles.message}>{message}</Text>}
      {!!actionLabel && !!onAction && (
        <Pressable accessibilityRole="button" onPress={onAction} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { minHeight: 240, alignItems: 'center', justifyContent: 'center', padding: 28 },
  title: { marginTop: 12, color: colors.ink, fontSize: 16, fontWeight: '800' },
  message: { marginTop: 6, color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  button: { marginTop: 18, minHeight: 42, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 12, backgroundColor: colors.primary },
  buttonText: { color: colors.ink, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
});
