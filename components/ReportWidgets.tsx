import CategoryDetailSheet from '@/components/CategoryDetailSheet';
import { formatSigned, signedColor } from '@/components/MoneyFlow';
import { sliceColor } from '@/components/CategoryBreakdown';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type {
  CategoryBreakdownItem,
  CategoryType,
  DailyTotalItem,
  GroupBreakdownItem,
  MonthlyTotalItem,
  ReportPeriod,
} from '@/lib/api';
import { formatCurrency } from '@/lib/format';
import { useRouter } from 'expo-router';
import { useState, type ComponentType } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';

export type PeriodTotals = {
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  totalDebtRepayment: number;
  netBalance: number;
};

export type TrendBucket = {
  label: string;
  fullLabel: string;
  income: number;
  expense: number;
  saving: number;
  investment: number;
  debtRepayment: number;
};

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function daysInMonth(month: string) {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year!, mon!, 0).getDate();
}

export function fillDailyBuckets(month: string, dailyTotals: DailyTotalItem[]): TrendBucket[] {
  const [, mon] = month.split('-').map(Number);
  const byDay = new Map(dailyTotals.map((d) => [parseInt(d.date.slice(8, 10), 10), d]));
  return Array.from({ length: daysInMonth(month) }, (_, i) => {
    const day = i + 1;
    const d = byDay.get(day);
    return {
      label: String(day),
      fullLabel: `${day} ${MONTH_SHORT[mon! - 1]}`,
      income: d?.income ?? 0,
      expense: d?.expense ?? 0,
      saving: d?.saving ?? 0,
      investment: d?.investment ?? 0,
      debtRepayment: d?.debtRepayment ?? 0,
    };
  });
}

export function fillMonthlyBuckets(year: number, monthlyTotals: MonthlyTotalItem[]): TrendBucket[] {
  const byMonth = new Map(monthlyTotals.map((m) => [parseInt(m.month.slice(5, 7), 10), m]));
  return MONTH_SHORT.map((name, i) => {
    const m = byMonth.get(i + 1);
    return {
      label: name,
      fullLabel: `${name} ${year}`,
      income: m?.income ?? 0,
      expense: m?.expense ?? 0,
      saving: m?.saving ?? 0,
      investment: m?.investment ?? 0,
      debtRepayment: m?.debtRepayment ?? 0,
    };
  });
}

function outflowOf(b: TrendBucket) {
  return b.expense + b.saving + b.investment + b.debtRepayment;
}

type ChangeSense = 'higherIsGood' | 'higherIsBad' | 'neutral';

function changeColor(change: number, sense: ChangeSense, isDark: boolean) {
  if (change === 0 || sense === 'neutral') return isDark ? '#a1a1aa' : '#71717a';
  const good = sense === 'higherIsGood' ? change > 0 : change < 0;
  return good ? (isDark ? '#34d399' : '#059669') : isDark ? '#f87171' : '#dc2626';
}

export function PeriodComparisonCard({
  current,
  previous,
  previousLabel,
}: {
  current: PeriodTotals;
  previous: PeriodTotals | null;
  previousLabel: string;
}) {
  const theme = useThemeColors();
  const rows: { label: string; key: keyof PeriodTotals; sense: ChangeSense; signed?: boolean }[] = [
    { label: 'Income', key: 'totalIncome', sense: 'higherIsGood' },
    { label: 'Expense', key: 'totalExpense', sense: 'higherIsBad' },
    { label: 'Savings', key: 'totalSaving', sense: 'neutral' },
    { label: 'Investments', key: 'totalInvestment', sense: 'neutral' },
    { label: 'Debt repayment', key: 'totalDebtRepayment', sense: 'neutral' },
    { label: 'Net balance', key: 'netBalance', sense: 'higherIsGood', signed: true },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Compared to {previousLabel}</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>
        How each total moved since the previous period
      </Text>
      {rows.map((row) => {
        const cur = current[row.key];
        const prev = previous ? previous[row.key] : null;
        const change = prev == null ? null : cur - prev;
        const pct = prev == null || prev === 0 || change == null ? null : (change / Math.abs(prev)) * 100;
        return (
          <View key={row.key} style={[styles.compareRow, { borderTopColor: theme.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }}>{row.label}</Text>
            <View style={{ alignItems: 'flex-end', gap: 2 }}>
              <Text
                style={{
                  color: row.signed ? signedColor(cur, theme.isDark) : theme.colors.text,
                  fontWeight: '600',
                  fontSize: 13,
                }}>
                {row.signed ? formatSigned(cur) : formatCurrency(cur)}
              </Text>
              <Text style={{ color: theme.muted, fontSize: 11 }}>
                Prev: {prev == null ? '—' : row.signed ? formatSigned(prev) : formatCurrency(prev)}
              </Text>
              <Text
                style={{
                  color: change == null ? theme.muted : changeColor(change, row.sense, theme.isDark),
                  fontSize: 11,
                  fontWeight: '500',
                }}>
                {change == null
                  ? '—'
                  : change === 0
                    ? 'No change'
                    : `${change > 0 ? '▲' : '▼'} ${formatCurrency(change)}${pct != null ? ` (${Math.abs(pct).toFixed(0)}%)` : ''}`}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function InsightTile({
  label,
  value,
  detail,
  valueColor,
}: {
  label: string;
  value: string;
  detail?: string;
  valueColor?: string;
}) {
  const theme = useThemeColors();
  return (
    <View style={[styles.insightTile, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
      <Text style={{ color: theme.muted, fontSize: 11 }}>{label}</Text>
      <Text
        style={{ color: valueColor ?? theme.colors.text, fontSize: 16, fontWeight: '600', marginTop: 2 }}
        numberOfLines={1}>
        {value}
      </Text>
      {detail ? (
        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }} numberOfLines={2}>
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

export function InsightsCard({
  mode,
  totals,
  categoryBreakdown,
  buckets,
  elapsed,
  projectDays,
}: {
  mode: 'month' | 'year';
  totals: PeriodTotals;
  categoryBreakdown: CategoryBreakdownItem[];
  buckets: TrendBucket[];
  elapsed: number;
  projectDays?: number;
}) {
  const theme = useThemeColors();
  const { totalIncome: income, totalExpense: expense } = totals;
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : null;
  const expenseRatio = income > 0 ? (expense / income) * 100 : null;
  const unit = mode === 'month' ? 'day' : 'month';

  const topCategory = categoryBreakdown
    .filter((c) => c.type === 'EXPENSE')
    .reduce<CategoryBreakdownItem | null>((best, c) => (!best || c.total > best.total ? c : best), null);

  const peak = buckets.reduce<TrendBucket | null>(
    (best, b) => (b.expense > 0 && (!best || b.expense > best.expense) ? b : best),
    null,
  );

  const activeBuckets = buckets.filter((b) => b.income + outflowOf(b) > 0);
  const spendDays = buckets.slice(0, elapsed).filter((b) => b.expense > 0).length;
  const deficitMonths = activeBuckets.filter((b) => b.income - outflowOf(b) < 0).length;
  const avgDivisor = mode === 'year' ? activeBuckets.length : elapsed;
  const avgSpend = avgDivisor > 0 ? expense / avgDivisor : 0;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Key insights</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>Quick read on your spending habits</Text>
      <View style={styles.insightGrid}>
        <InsightTile
          label="Savings rate"
          value={savingsRate == null ? '—' : `${savingsRate.toFixed(0)}%`}
          detail="Income left after expenses"
          valueColor={savingsRate == null ? undefined : signedColor(savingsRate, theme.isDark)}
        />
        <InsightTile
          label="Expense to income"
          value={expenseRatio == null ? '—' : `${expenseRatio.toFixed(0)}%`}
          detail={
            expenseRatio != null && expenseRatio > 100 ? 'Spending exceeds income' : 'Share of income spent'
          }
          valueColor={
            expenseRatio != null && expenseRatio > 100 ? signedColor(-1, theme.isDark) : undefined
          }
        />
        <InsightTile
          label={mode === 'month' ? 'Average daily spend' : 'Average monthly spend'}
          value={formatCurrency(avgSpend)}
          detail={`Over ${avgDivisor} ${mode === 'year' ? 'active ' : ''}${unit}${avgDivisor === 1 ? '' : 's'}`}
        />
        <InsightTile
          label="Biggest expense"
          value={topCategory ? topCategory.name : '—'}
          detail={
            topCategory
              ? `${formatCurrency(topCategory.total)} · ${topCategory.percentage}% of expenses`
              : undefined
          }
        />
        <InsightTile
          label={`Highest-spending ${unit}`}
          value={peak ? peak.fullLabel : '—'}
          detail={peak ? formatCurrency(peak.expense) : undefined}
        />
        {mode === 'month' ? (
          <InsightTile
            label="Days with spending"
            value={`${spendDays} / ${elapsed}`}
            detail={elapsed > 0 ? `${Math.round((spendDays / elapsed) * 100)}% of days` : undefined}
          />
        ) : (
          <InsightTile
            label="Months in deficit"
            value={`${deficitMonths} / ${activeBuckets.length}`}
            detail="Out of months with activity"
            valueColor={
              deficitMonths > 0 ? signedColor(-1, theme.isDark) : signedColor(1, theme.isDark)
            }
          />
        )}
        {projectDays != null ? (
          <InsightTile
            label="Projected month-end expense"
            value={formatCurrency(avgSpend * projectDays)}
            detail={`At the current pace over ${projectDays} days`}
            valueColor={
              avgSpend * projectDays > income ? signedColor(-1, theme.isDark) : undefined
            }
          />
        ) : null}
      </View>
    </View>
  );
}

const LEGEND = [
  { label: 'Income', color: '#10b981' },
  { label: 'Expense', color: '#f87171' },
  { label: 'Saving', color: '#3b82f6' },
  { label: 'Investment', color: '#a855f7' },
  { label: 'Debt repay', color: '#f97316' },
];

export function TrendChart({
  mode,
  buckets,
}: {
  mode: 'month' | 'year';
  buckets: TrendBucket[];
}) {
  const theme = useThemeColors();
  const chartWidth = Dimensions.get('window').width - 64;
  const data = buckets.flatMap((row) => [
    { value: row.income, label: row.label, frontColor: '#10b981', spacing: 1 },
    { value: row.expense, frontColor: '#f87171', spacing: 1 },
    { value: row.saving, frontColor: '#3b82f6', spacing: 1 },
    { value: row.investment, frontColor: '#a855f7', spacing: 1 },
    { value: row.debtRepayment, frontColor: '#f97316', spacing: 6 },
  ]);
  const hasActivity = data.some((item) => item.value > 0);

  if (!hasActivity) {
    return (
      <View style={[styles.empty, { borderColor: theme.border }]}>
        <Text style={{ color: theme.muted, fontSize: 14 }}>
          No transaction data for this {mode === 'month' ? 'month' : 'year'}.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
        {mode === 'month' ? 'Daily cash flow' : 'Monthly cash flow'}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>
        Bars show money in and out{mode === 'month' ? ' each day' : ' each month'}, including debt repayment.
      </Text>
      <View style={styles.legend}>
        {LEGEND.map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={{ color: theme.muted, fontSize: 11 }}>{item.label}</Text>
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <BarChart
          data={data}
          width={Math.max(chartWidth, buckets.length * 28)}
          height={200}
          barWidth={6}
          noOfSections={4}
          yAxisTextStyle={{ color: theme.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.muted, fontSize: 9 }}
          isAnimated
        />
      </ScrollView>
    </View>
  );
}

export function MonthlyBreakdownTable({ buckets }: { buckets: TrendBucket[] }) {
  const theme = useThemeColors();
  const maxAbsNet = Math.max(...buckets.map((b) => Math.abs(b.income - outflowOf(b))), 0);

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Month by month</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 12 }}>
        Income, outflow and what was left each month
      </Text>
      {buckets.map((b) => {
        const outflow = outflowOf(b);
        const net = b.income - outflow;
        const isEmpty = b.income + outflow === 0;
        const rate = b.income > 0 ? ((b.income - b.expense) / b.income) * 100 : null;
        const barWidth = maxAbsNet > 0 ? Math.min(100, (Math.abs(net) / maxAbsNet) * 100) : 0;
        return (
          <View
            key={b.label}
            style={[styles.monthRow, { borderTopColor: theme.border, opacity: isEmpty ? 0.4 : 1 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{b.label}</Text>
              <Text style={{ color: isEmpty ? theme.muted : signedColor(net, theme.isDark), fontWeight: '600' }}>
                {isEmpty ? '—' : formatSigned(net)}
              </Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              In {formatCurrency(b.income)} · Out {formatCurrency(outflow)}
              {rate != null ? ` · Save ${rate.toFixed(0)}%` : ''}
            </Text>
            {!isEmpty ? (
              <View style={[styles.thinTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5', marginTop: 6 }]}>
                <View
                  style={{
                    height: '100%',
                    width: `${barWidth}%`,
                    backgroundColor: net < 0 ? '#ef4444' : '#10b981',
                    borderRadius: 999,
                  }}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function GroupBreakdownCard({
  groups,
  title,
  color,
  addLabel,
  categories,
  onSelectCategory,
  onAdd,
}: {
  groups: GroupBreakdownItem[];
  title: string;
  color: string;
  addLabel: string;
  categories: CategoryBreakdownItem[];
  onSelectCategory: (item: CategoryBreakdownItem) => void;
  onAdd: () => void;
}) {
  const theme = useThemeColors();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const pieData = groups.flatMap((g, index) =>
    g.total > 0 ? [{ value: g.total, color: sliceColor(index) }] : [],
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>{title}</Text>
      {groups.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: 14, marginTop: 8 }}>No data</Text>
      ) : (
        <>
          {pieData.length > 0 ? (
            <View style={{ alignItems: 'center', marginVertical: 12 }}>
              <PieChart
                data={pieData}
                donut
                radius={80}
                innerRadius={48}
                innerCircleColor={theme.card}
                showText={false}
              />
            </View>
          ) : null}
          {groups.map((group, index) => {
            const key = `${group.type}:${group.id ?? 'ungrouped'}`;
            const isOpen = expanded.has(key);
            return (
              <View key={key} style={{ marginBottom: 8 }}>
                <Pressable onPress={() => toggle(key)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 8 }}>
                    <View style={[styles.legendDot, { backgroundColor: sliceColor(index) }]} />
                    <Text
                      style={{
                        flex: 1,
                        color: group.id ? theme.colors.text : theme.muted,
                        fontStyle: group.id ? 'normal' : 'italic',
                        fontWeight: group.id ? '500' : '400',
                        fontSize: 13,
                      }}
                      numberOfLines={1}>
                      {group.name}{' '}
                      <Text style={{ color: theme.muted, fontWeight: '400' }}>{group.categories.length}</Text>
                    </Text>
                    <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 13 }}>
                      {formatCurrency(group.total)}
                    </Text>
                    <Text style={{ color: theme.muted, fontSize: 11, width: 36, textAlign: 'right' }}>
                      {group.percentage}%
                    </Text>
                  </View>
                  <View style={[styles.thinTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
                    <View style={{ height: '100%', width: `${group.percentage}%`, backgroundColor: color }} />
                  </View>
                </Pressable>
                {isOpen
                  ? group.categories.map((cat) => {
                      const share = group.total > 0 ? Math.round((cat.total / group.total) * 100) : 0;
                      const item = categories.find((c) => c.id === cat.id);
                      return (
                        <Pressable
                          key={cat.id}
                          onPress={() => {
                            if (item) onSelectCategory(item);
                          }}
                          style={{ paddingLeft: 18, paddingTop: 8, flexDirection: 'row', gap: 8 }}>
                          <Text style={{ flex: 1, color: theme.muted, fontSize: 13 }} numberOfLines={1}>
                            {cat.name}
                          </Text>
                          <Text style={{ color: theme.colors.text, fontSize: 13 }}>{formatCurrency(cat.total)}</Text>
                          <Text style={{ color: theme.muted, fontSize: 11 }}>{share}% of grp</Text>
                        </Pressable>
                      );
                    })
                  : null}
              </View>
            );
          })}
        </>
      )}
      <Pressable onPress={onAdd} style={[styles.addBtn, { borderColor: theme.border }]}>
        <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 14 }}>Add {addLabel}</Text>
      </Pressable>
    </View>
  );
}

export function BreakdownSection({
  categories,
  groups,
  period,
  CategoryGrid,
}: {
  categories: CategoryBreakdownItem[];
  groups: GroupBreakdownItem[];
  period: ReportPeriod;
  CategoryGrid: ComponentType<{
    items: CategoryBreakdownItem[];
    period: ReportPeriod;
    onSelect: (item: CategoryBreakdownItem) => void;
  }>;
}) {
  const theme = useThemeColors();
  const router = useRouter();
  const hasGroups = groups.some((g) => g.id !== null);
  const [view, setView] = useState<'group' | 'category'>(hasGroups ? 'group' : 'category');
  const [selected, setSelected] = useState<CategoryBreakdownItem | null>(null);

  function addTransaction(type: CategoryType) {
    const now = new Date();
    let date = now;
    if (period.kind === 'month') {
      const [year, mon] = period.month.split('-').map(Number);
      if (!(year === now.getFullYear() && mon === now.getMonth() + 1)) {
        date = new Date(year!, (mon ?? 1) - 1, 1, 12, 0);
      }
    } else if (period.year !== now.getFullYear()) {
      date = new Date(period.year, 0, 1, 12, 0);
    }
    router.push({
      pathname: '/(app)/transactions/new',
      params: { type, date: date.toISOString() },
    });
  }

  const groupCards: { type: CategoryType; title: string; color: string; addLabel: string }[] = [
    { type: 'INCOME', title: 'Income by Group', color: '#10b981', addLabel: 'income' },
    { type: 'EXPENSE', title: 'Expenses by Group', color: '#f87171', addLabel: 'expense' },
    { type: 'SAVING', title: 'Savings by Group', color: '#3b82f6', addLabel: 'saving' },
    { type: 'INVESTMENT', title: 'Investments by Group', color: '#a855f7', addLabel: 'investment' },
  ];

  return (
    <View style={{ gap: 12 }}>
      {hasGroups ? (
        <View style={[styles.toggle, { borderColor: theme.border }]}>
          {(['group', 'category'] as const).map((id) => {
            const active = view === id;
            return (
              <Pressable
                key={id}
                onPress={() => setView(id)}
                style={[styles.toggleItem, { backgroundColor: active ? theme.primary : 'transparent' }]}>
                <Text style={{ color: active ? '#fff' : theme.muted, fontWeight: '600', fontSize: 13 }}>
                  {id === 'group' ? 'By Group' : 'By Category'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {view === 'group' && hasGroups ? (
        groupCards.map((card) => (
          <GroupBreakdownCard
            key={card.type}
            groups={groups.filter((g) => g.type === card.type)}
            title={card.title}
            color={card.color}
            addLabel={card.addLabel}
            categories={categories}
            onSelectCategory={setSelected}
            onAdd={() => addTransaction(card.type)}
          />
        ))
      ) : (
        <CategoryGrid items={categories} period={period} onSelect={setSelected} />
      )}

      <CategoryDetailSheet item={selected} period={period} onClose={() => setSelected(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  compareRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  insightTile: { width: '47%', borderRadius: 12, padding: 12 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center' },
  monthRow: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  thinTrack: { height: 6, borderRadius: 999, overflow: 'hidden' },
  addBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, alignSelf: 'flex-start' },
  toggleItem: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
});
