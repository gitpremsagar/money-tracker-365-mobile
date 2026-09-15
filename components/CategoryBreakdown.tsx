import { useThemeColors } from '@/hooks/use-theme-colors';
import type { CategoryBreakdownItem, CategoryType } from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PieChart } from 'react-native-gifted-charts';

export const SLICE_COLORS = [
  '#4e79a7',
  '#f28e2b',
  '#e15759',
  '#76b7b2',
  '#59a14f',
  '#edc948',
  '#b07aa1',
  '#ff9da7',
  '#9c755f',
  '#bab0ac',
  '#1f77b4',
  '#ff7f0e',
  '#2ca02c',
  '#d62728',
  '#9467bd',
  '#8c564b',
  '#e377c2',
  '#17becf',
  '#bcbd22',
  '#7f7f7f',
];

export function sliceColor(index: number): string {
  return SLICE_COLORS[index % SLICE_COLORS.length] ?? SLICE_COLORS[0]!;
}

type CardProps = {
  items: CategoryBreakdownItem[];
  title: string;
  color: string;
  addLabel: string;
  onSelect: (item: CategoryBreakdownItem) => void;
  onAdd: () => void;
};

export default function CategoryBreakdown({
  items,
  title,
  color,
  addLabel,
  onSelect,
  onAdd,
}: CardProps) {
  const theme = useThemeColors();
  const pieData = items.flatMap((item, index) =>
    item.total > 0
      ? [{ value: item.total, color: sliceColor(index), onPress: () => onSelect(item) }]
      : [],
  );

  return (
    <View>
      <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
      {items.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: 14 }}>No data</Text>
      ) : (
        <>
          {pieData.length > 0 ? (
            <View style={styles.pie}>
              <PieChart
                data={pieData}
                donut
                radius={90}
                innerRadius={54}
                innerCircleColor={theme.card}
                focusOnPress
                showText={false}
              />
            </View>
          ) : null}
          {items.map((item, index) => (
            <Pressable key={item.id} onPress={() => onSelect(item)} style={styles.item}>
              <View style={styles.row}>
                <View style={[styles.dot, { backgroundColor: sliceColor(index) }]} />
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
            </Pressable>
          ))}
        </>
      )}
      <Pressable
        onPress={onAdd}
        style={[styles.addButton, { borderColor: theme.border }]}>
        <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>Add {addLabel}</Text>
      </Pressable>
    </View>
  );
}

const BREAKDOWN_CARDS: {
  type: CategoryType;
  title: string;
  color: string;
  addLabel: string;
}[] = [
  { type: 'INCOME', title: 'Income by Category', color: '#10b981', addLabel: 'income' },
  { type: 'EXPENSE', title: 'Expenses by Category', color: '#f87171', addLabel: 'expense' },
  { type: 'SAVING', title: 'Savings by Category', color: '#3b82f6', addLabel: 'saving' },
  { type: 'INVESTMENT', title: 'Investments by Category', color: '#a855f7', addLabel: 'investment' },
];

export function CategoryBreakdownGrid({
  items,
  cardStyle,
  onSelect,
  onAdd,
}: {
  items: CategoryBreakdownItem[];
  cardStyle: { backgroundColor: string; borderColor: string };
  onSelect: (item: CategoryBreakdownItem) => void;
  onAdd: (type: CategoryType) => void;
}) {
  return (
    <View style={styles.grid}>
      {BREAKDOWN_CARDS.map((card) => (
        <View key={card.type} style={[styles.card, cardStyle]}>
          <CategoryBreakdown
            items={items.filter((item) => item.type === card.type)}
            title={card.title}
            color={card.color}
            addLabel={card.addLabel}
            onSelect={onSelect}
            onAdd={() => onAdd(card.type)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  pie: {
    alignItems: 'center',
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
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
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
  addButton: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  grid: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
});
