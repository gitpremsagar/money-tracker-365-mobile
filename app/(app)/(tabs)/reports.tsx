import { CategoryBreakdownGrid } from '@/components/CategoryBreakdown';
import CategoryDetailSheet from '@/components/CategoryDetailSheet';
import MonthPicker from '@/components/MonthPicker';
import StatCard from '@/components/StatCard';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  getAnnualReport,
  getMonthlyReport,
  listDebts,
  type AnnualReport,
  type CategoryBreakdownItem,
  type CategoryType,
  type Debt,
  type MonthlyReport,
  type ReportPeriod,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { currentMonth, currentYear, defaultDateForPeriod, formatCurrency } from '@/lib/format';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LEGEND = [
  { label: 'Income', color: '#10b981' },
  { label: 'Expense', color: '#f87171' },
  { label: 'Saving', color: '#3b82f6' },
  { label: 'Investment', color: '#a855f7' },
];

export default function ReportsScreen() {
  const { view } = useLocalSearchParams<{ view?: string }>();
  const [mode, setMode] = useState<'monthly' | 'annual'>(view === 'annual' ? 'annual' : 'monthly');

  useEffect(() => {
    if (view === 'annual') setMode('annual');
    else if (view === 'monthly') setMode('monthly');
  }, [view]);

  return (
    <View style={{ flex: 1 }}>
      <ReportModeToggle mode={mode} onChange={setMode} />
      {mode === 'monthly' ? <MonthlyReportView /> : <AnnualReportView />}
    </View>
  );
}

function ReportModeToggle({
  mode,
  onChange,
}: {
  mode: 'monthly' | 'annual';
  onChange: (mode: 'monthly' | 'annual') => void;
}) {
  const theme = useThemeColors();

  return (
    <View style={[styles.toggleWrap, { backgroundColor: theme.background }]}>
      <View style={[styles.toggle, { borderColor: theme.border }]}>
        {(['monthly', 'annual'] as const).map((item) => {
          const active = mode === item;
          return (
            <Pressable
              key={item}
              onPress={() => onChange(item)}
              style={[styles.toggleItem, { backgroundColor: active ? theme.primary : 'transparent' }]}>
              <Text style={{ color: active ? '#fff' : theme.muted, fontWeight: '600', fontSize: 14 }}>
                {item === 'monthly' ? 'Monthly' : 'Annual'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function SummaryCards({
  totalIncome,
  totalExpense,
  totalSaving,
  totalInvestment,
  netBalance,
}: {
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  netBalance: number;
}) {
  return (
    <View style={styles.statsGrid}>
      <StatCard label="Total Income" value={formatCurrency(totalIncome, 0)} color="green" />
      <StatCard label="Total Expense" value={formatCurrency(totalExpense, 0)} color="red" />
      <StatCard label="Total Savings" value={formatCurrency(totalSaving, 0)} color="blue" />
      <StatCard label="Total Investments" value={formatCurrency(totalInvestment, 0)} color="purple" />
      <StatCard
        label="Net Balance"
        value={`${netBalance >= 0 ? '+' : '-'}${formatCurrency(netBalance, 0)}`}
        sub={netBalance >= 0 ? 'Surplus' : 'Deficit'}
        color={netBalance >= 0 ? 'blue' : 'red'}
      />
    </View>
  );
}

function TrendChart({
  title,
  emptyMessage,
  data,
}: {
  title: string;
  emptyMessage: string;
  data: { value: number; label?: string; frontColor: string; spacing: number }[];
}) {
  const theme = useThemeColors();
  const chartWidth = Dimensions.get('window').width - 64;
  const hasActivity = data.some((item) => item.value > 0);

  if (!hasActivity) {
    return (
      <View style={[styles.emptyChart, { borderColor: theme.border }]}>
        <Text style={{ color: theme.muted, fontSize: 14 }}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.chartTitle, { color: theme.colors.text }]}>{title}</Text>
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
          width={Math.max(chartWidth, data.length * 12)}
          height={200}
          barWidth={8}
          noOfSections={4}
          yAxisTextStyle={{ color: theme.muted, fontSize: 10 }}
          xAxisLabelTextStyle={{ color: theme.muted, fontSize: 9 }}
          isAnimated
        />
      </ScrollView>
    </View>
  );
}

function groupedBars(
  rows: { label: string; income: number; expense: number; saving: number; investment: number }[],
) {
  return rows.flatMap((row) => [
    { value: row.income, label: row.label, frontColor: '#10b981', spacing: 2 },
    { value: row.expense, frontColor: '#f87171', spacing: 2 },
    { value: row.saving, frontColor: '#3b82f6', spacing: 2 },
    { value: row.investment, frontColor: '#a855f7', spacing: 8 },
  ]);
}

function ReportBody({
  isLoading,
  isRefreshing,
  onRefresh,
  children,
}: {
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}) {
  const theme = useThemeColors();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={theme.primary} />
      }>
      {children}
      {isLoading ? <ActivityIndicator color={theme.primary} style={{ marginTop: 16 }} /> : null}
    </ScrollView>
  );
}

function ActiveDebts({
  debts,
  cardStyle,
}: {
  debts: Debt[];
  cardStyle: { backgroundColor: string; borderColor: string };
}) {
  const theme = useThemeColors();
  const taken = debts.filter((debt) => debt.type === 'TAKEN');
  const given = debts.filter((debt) => debt.type === 'GIVEN');

  return (
    <View style={[styles.chartCard, cardStyle]}>
      <Text style={[styles.chartTitle, { color: theme.colors.text }]}>Active Debts</Text>
      <View style={styles.statsGrid}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>DEBT TAKEN</Text>
          <Text style={{ color: '#dc2626', fontSize: 20, fontWeight: '700', marginTop: 4 }}>
            {formatCurrency(taken.reduce((sum, debt) => sum + debt.amount, 0), 0)}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
            {taken.length} debt{taken.length === 1 ? '' : 's'}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>DEBT GIVEN</Text>
          <Text style={{ color: '#059669', fontSize: 20, fontWeight: '700', marginTop: 4 }}>
            {formatCurrency(given.reduce((sum, debt) => sum + debt.amount, 0), 0)}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
            {given.length} debt{given.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>
    </View>
  );
}

function CategoryActions({
  items,
  period,
  cardStyle,
}: {
  items: CategoryBreakdownItem[];
  period: ReportPeriod;
  cardStyle: { backgroundColor: string; borderColor: string };
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<CategoryBreakdownItem | null>(null);

  function addTransaction(type: CategoryType) {
    router.push({
      pathname: '/(app)/transactions/new',
      params: {
        type,
        date: defaultDateForPeriod(period).toISOString(),
      },
    });
  }

  return (
    <>
      <CategoryBreakdownGrid
        items={items}
        cardStyle={cardStyle}
        onSelect={setSelected}
        onAdd={addTransaction}
      />
      <CategoryDetailSheet item={selected} period={period} onClose={() => setSelected(null)} />
    </>
  );
}

function MonthlyReportView() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [activeDebts, setActiveDebts] = useState<Debt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [data, debtResult] = await Promise.all([
        getMonthlyReport(month, accessToken),
        listDebts({ status: 'ACTIVE', limit: 100 }, accessToken),
      ]);
      setReport(data);
      setActiveDebts(debtResult.debts);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, month]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void fetchReport();
    }, [fetchReport]),
  );

  const barData = groupedBars(
    report?.dailyTotals.map((day) => ({
      label: day.date.slice(8),
      income: day.income,
      expense: day.expense,
      saving: day.saving,
      investment: day.investment,
    })) ?? [],
  );

  return (
    <ReportBody
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      onRefresh={() => {
        setIsRefreshing(true);
        void fetchReport();
      }}>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Monthly Report</Text>
      <MonthPicker month={month} onChange={setMonth} disableFuture />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {report && !isLoading ? (
        <>
          <SummaryCards
            totalIncome={report.totalIncome}
            totalExpense={report.totalExpense}
            totalSaving={report.totalSaving}
            totalInvestment={report.totalInvestment}
            netBalance={report.netBalance}
          />
          <TrendChart title="Daily Trend" emptyMessage="No transaction data for this month." data={barData} />
          <CategoryActions
            items={report.categoryBreakdown}
            period={{ kind: 'month', month }}
            cardStyle={{ backgroundColor: theme.card, borderColor: theme.border }}
          />
          <ActiveDebts debts={activeDebts} cardStyle={{ backgroundColor: theme.card, borderColor: theme.border }} />
        </>
      ) : null}
    </ReportBody>
  );
}

function AnnualReportView() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();
  const [year, setYear] = useState(currentYear());
  const [report, setReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextDisabled = year >= currentYear();

  const fetchReport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await getAnnualReport(year, accessToken);
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, year]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void fetchReport();
    }, [fetchReport]),
  );

  const barData = groupedBars(
    report?.monthlyTotals.map((item) => ({
      label: MONTH_LABELS[parseInt(item.month.slice(5), 10) - 1] ?? item.month,
      income: item.income,
      expense: item.expense,
      saving: item.saving,
      investment: item.investment,
    })) ?? [],
  );

  return (
    <ReportBody
      isLoading={isLoading}
      isRefreshing={isRefreshing}
      onRefresh={() => {
        setIsRefreshing(true);
        void fetchReport();
      }}>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Annual Report</Text>
      <View style={[styles.yearPicker, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => setYear((value) => value - 1)} style={styles.yearArrow}>
          <Text style={[styles.yearArrowText, { color: theme.colors.text }]}>‹</Text>
        </Pressable>
        <Text style={[styles.yearLabel, { color: theme.colors.text }]}>{year}</Text>
        <Pressable
          disabled={nextDisabled}
          onPress={() => setYear((value) => value + 1)}
          style={[styles.yearArrow, { opacity: nextDisabled ? 0.4 : 1 }]}>
          <Text style={[styles.yearArrowText, { color: theme.colors.text }]}>›</Text>
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {report && !isLoading ? (
        <>
          <SummaryCards
            totalIncome={report.totalIncome}
            totalExpense={report.totalExpense}
            totalSaving={report.totalSaving}
            totalInvestment={report.totalInvestment}
            netBalance={report.netBalance}
          />
          <TrendChart title="Monthly Trend" emptyMessage="No transaction data for this year." data={barData} />
          <CategoryActions
            items={report.categoryBreakdown}
            period={{ kind: 'year', year }}
            cardStyle={{ backgroundColor: theme.card, borderColor: theme.border }}
          />
        </>
      ) : null}
    </ReportBody>
  );
}

const styles = StyleSheet.create({
  toggleWrap: { paddingHorizontal: 16, paddingTop: 12 },
  toggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, alignSelf: 'flex-start' },
  toggleItem: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  subtitle: { fontSize: 14, marginBottom: -8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  chartTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  emptyChart: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center' },
  error: { color: '#dc2626', fontSize: 14, marginTop: 16 },
  yearPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  yearArrow: { paddingHorizontal: 12, paddingVertical: 4 },
  yearArrowText: { fontSize: 24, fontWeight: '300' },
  yearLabel: { fontSize: 16, fontWeight: '600' },
});
