import type { CategoryType } from '@/lib/api';
import { TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

export default function TypeBadge({ type }: { type: CategoryType }) {
  const theme = useThemeColors();
  const colors = TYPE_COLORS[type];

  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: theme.isDark ? colors.darkBg : colors.bg },
      ]}>
      <Text style={[styles.text, { color: theme.isDark ? colors.darkText : colors.text }]}>
        {TYPE_LABEL[type]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
