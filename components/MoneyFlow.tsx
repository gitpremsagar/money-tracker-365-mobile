import { useThemeColors } from '@/hooks/use-theme-colors';
import { formatCurrency } from '@/lib/format';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export function formatSigned(amount: number) {
  return `${amount < 0 ? '-' : '+'}${formatCurrency(amount)}`;
}

export function signedColor(amount: number, isDark: boolean) {
  if (amount < 0) return isDark ? '#f87171' : '#dc2626';
  return isDark ? '#34d399' : '#059669';
}

export function percentOf(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—';
}

function Bar({ value, scale, color }: { value: number; scale: number; color: string }) {
  if (value <= 0 || scale <= 0) return null;
  return (
    <View
      style={{
        height: '100%',
        width: `${Math.min((value / scale) * 100, 100)}%`,
        backgroundColor: color,
      }}
    />
  );
}

export function NetBalanceBanner({
  netBalance,
  label,
  comparison,
}: {
  netBalance: number;
  label: string;
  comparison?: { previous: number | null; label: string };
}) {
  const theme = useThemeColors();
  const isNegative = netBalance < 0;
  const delta = comparison?.previous == null ? null : netBalance - comparison.previous;

  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: isNegative
            ? theme.isDark
              ? '#7f1d1d'
              : '#fecaca'
            : theme.isDark
              ? '#064e3b'
              : '#a7f3d0',
          backgroundColor: isNegative
            ? theme.isDark
              ? 'rgba(127,29,29,0.3)'
              : '#fef2f2'
            : theme.isDark
              ? 'rgba(6,78,59,0.3)'
              : '#ecfdf5',
        },
      ]}>
      <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>
        Net Balance · {label}
      </Text>
      <Text style={[styles.bannerAmount, { color: signedColor(netBalance, theme.isDark) }]}>
        {formatSigned(netBalance)}
      </Text>
      <Text style={{ color: theme.muted, fontSize: 13, marginTop: 4 }}>
        {isNegative
          ? `Deficit: you spent ${formatCurrency(netBalance)} more than you earned`
          : 'Surplus: you kept more than you spent'}
      </Text>
      {comparison ? (
        <Text style={{ fontSize: 13, marginTop: 8 }}>
          {delta == null ? (
            <Text style={{ color: theme.muted }}>No data for {comparison.label}</Text>
          ) : (
            <>
              <Text style={{ color: signedColor(delta, theme.isDark), fontWeight: '600' }}>
                {delta < 0 ? '▼' : '▲'} {formatCurrency(delta)}
              </Text>
              <Text style={{ color: theme.muted }}> vs {comparison.label}</Text>
            </>
          )}
        </Text>
      ) : null}
    </View>
  );
}

export function MoneyFlowCard({
  income,
  expense,
  saving,
  investment,
  debtRepayment,
  subtitle = "How this month's income was used",
}: {
  income: number;
  expense: number;
  saving: number;
  investment: number;
  debtRepayment: number;
  subtitle?: string;
}) {
  const theme = useThemeColors();
  const outflow = expense + saving + investment + debtRepayment;
  const scale = Math.max(income, outflow);
  const overspent = outflow - income;

  const legend = [
    { label: 'Income', value: income, color: '#10b981', pct: null as string | null },
    { label: 'Expense', value: expense, color: '#ef4444', pct: percentOf(expense, income) },
    { label: 'Savings', value: saving, color: '#3b82f6', pct: percentOf(saving, income) },
    { label: 'Investments', value: investment, color: '#a855f7', pct: percentOf(investment, income) },
    {
      label: 'Debt repayment',
      value: debtRepayment,
      color: '#f97316',
      pct: percentOf(debtRepayment, income),
    },
  ];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Money Flow</Text>
      <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 16 }}>{subtitle}</Text>

      <View style={{ gap: 16 }}>
        <View>
          <View style={styles.barLabelRow}>
            <Text style={{ color: theme.colors.text, fontWeight: '500', fontSize: 13 }}>Income</Text>
            <Text style={{ color: signedColor(1, theme.isDark), fontWeight: '600' }}>
              {formatCurrency(income)}
            </Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
            <Bar value={income} scale={scale} color="#10b981" />
            {overspent > 0 ? <Bar value={overspent} scale={scale} color="rgba(239,68,68,0.35)" /> : null}
          </View>
          {overspent > 0 ? (
            <Text style={{ color: signedColor(-1, theme.isDark), fontSize: 12, fontWeight: '500', textAlign: 'right', marginTop: 4 }}>
              Overspent by {formatCurrency(overspent)}
            </Text>
          ) : null}
        </View>

        <View>
          <View style={styles.barLabelRow}>
            <Text style={{ color: theme.colors.text, fontWeight: '500', fontSize: 13 }}>Outflow</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>{formatCurrency(outflow)}</Text>
          </View>
          <View style={[styles.barTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
            <Bar value={expense} scale={scale} color="#ef4444" />
            <Bar value={saving} scale={scale} color="#3b82f6" />
            <Bar value={investment} scale={scale} color="#a855f7" />
            <Bar value={debtRepayment} scale={scale} color="#f97316" />
          </View>
        </View>
      </View>

      <View style={styles.legendGrid}>
        {legend.map((item) => (
          <View
            key={item.label}
            style={[styles.legendItem, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
            <View style={styles.legendLabel}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Text style={{ color: theme.muted, fontSize: 11 }}>{item.label}</Text>
            </View>
            <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 13, marginTop: 2 }}>
              {formatCurrency(item.value)}
            </Text>
            {item.pct ? (
              <Text style={{ color: theme.muted, fontSize: 11 }}>{item.pct} of income</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

export function DebtsCard({
  taken,
  given,
  subtitle = 'Active outstanding amounts',
}: {
  taken: number;
  given: number;
  subtitle?: string;
}) {
  const theme = useThemeColors();
  const router = useRouter();
  const scale = taken + given;
  const net = given - taken;

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Debts</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{subtitle}</Text>
        </View>
        <Pressable onPress={() => router.push('/(app)/(tabs)/debts' as Href)}>
          <Text style={{ color: theme.primary, fontSize: 13 }}>All debts</Text>
        </Pressable>
      </View>

      <View style={[styles.barLabelRow, { marginBottom: 6 }]}>
        <Text style={{ color: theme.muted, fontSize: 13 }}>
          You owe{' '}
          <Text style={{ color: signedColor(-1, theme.isDark), fontWeight: '600' }}>
            {formatCurrency(taken)}
          </Text>
        </Text>
        <Text style={{ color: theme.muted, fontSize: 13 }}>
          Owed to you{' '}
          <Text style={{ color: signedColor(1, theme.isDark), fontWeight: '600' }}>
            {formatCurrency(given)}
          </Text>
        </Text>
      </View>
      <View style={[styles.barTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
        <Bar value={taken} scale={scale} color="#ef4444" />
        <Bar value={given} scale={scale} color="#10b981" />
      </View>
      <Text style={{ color: theme.muted, fontSize: 13, marginTop: 12 }}>
        Net position:{' '}
        <Text style={{ color: signedColor(net, theme.isDark), fontWeight: '600' }}>{formatSigned(net)}</Text>
      </Text>
    </View>
  );
}

export function TopExpensesCard({
  items,
  totalExpense,
}: {
  items: { id: string; name: string; total: number; percentage: number }[];
  totalExpense: number;
}) {
  const theme = useThemeColors();
  const router = useRouter();

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Where your money went</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Top expense categories</Text>
        </View>
        <Pressable onPress={() => router.push({ pathname: '/(app)/(tabs)/reports', params: { view: 'monthly' } } as Href)}>
          <Text style={{ color: theme.primary, fontSize: 13 }}>View report</Text>
        </Pressable>
      </View>
      {items.length === 0 ? (
        <Text style={{ color: theme.muted, fontSize: 14 }}>No expenses this month.</Text>
      ) : (
        <View style={{ gap: 12 }}>
          {items.map((item) => (
            <View key={item.id}>
              <View style={styles.barLabelRow}>
                <Text style={{ color: theme.colors.text, fontSize: 13, flex: 1 }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: theme.colors.text, fontWeight: '500', fontSize: 13 }}>
                  {formatCurrency(item.total)}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11, width: 36, textAlign: 'right' }}>
                  {item.percentage}%
                </Text>
              </View>
              <View style={[styles.thinTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
                <Bar value={item.total} scale={totalExpense} color="#f87171" />
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 16, borderWidth: 1, padding: 16 },
  bannerAmount: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  barLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 },
  barTrack: { height: 16, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  thinTrack: { height: 8, borderRadius: 999, overflow: 'hidden', flexDirection: 'row' },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  legendItem: { width: '47%', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  legendLabel: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
