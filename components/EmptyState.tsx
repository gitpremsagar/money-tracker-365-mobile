import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

type Props = {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
};

export default function EmptyState({ message, actionLabel, onAction }: Props) {
  const theme = useThemeColors();

  return (
    <View style={[styles.container, { borderColor: theme.border }]}>
      <Text style={[styles.message, { color: theme.muted }]}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction}>
          <Text style={[styles.action, { color: theme.primary }]}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
  },
  action: {
    marginTop: 12,
    fontSize: 14,
    fontWeight: '600',
  },
});
