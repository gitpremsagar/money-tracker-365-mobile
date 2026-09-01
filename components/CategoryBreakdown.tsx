import type { CategoryBreakdownItem } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

type Props = {
  items: CategoryBreakdownItem[];
  title: string;
  color: string;
};

export default function CategoryBreakdown({ items, title, color }: Props) {
  const theme = useThemeColors();

  return (
    <View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: 14 }}>No data</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.item}>
            <View style={styles.row}>
              <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.total, { color: theme.colors.text }]}>
                {formatCurrency(item.total, 0)}
              </Text>
              <Text style={[styles.pct, { color: theme.muted }]}>{item.percentage}%</Text>
            </View>
            <View style={[styles.track, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
              <View style={[styles.bar, { width: `${item.percentage}%`, backgroundColor: color }]} />
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  item: {
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    flex: 1,
    fontSize: 14,
    marginRight: 8,
  },
  total: {
    fontSize: 14,
    fontWeight: '600',
    marginRight: 8,
  },
  pct: {
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  track: {
    height: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    borderRadius: 999,
  },
});
