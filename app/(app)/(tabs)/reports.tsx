import { CategoryBreakdownGrid } from '@/components/CategoryBreakdown';
import { DebtsCard, MoneyFlowCard, NetBalanceBanner } from '@/components/MoneyFlow';
import MonthPicker from '@/components/MonthPicker';
import {
  BreakdownSection,
  InsightsCard,
  MonthlyBreakdownTable,
  PeriodComparisonCard,
  TrendChart,
  daysInMonth,
  fillDailyBuckets,
  fillMonthlyBuckets,
} from '@/components/ReportWidgets';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  getAnnualReport,
  getMonthlyReport,
  listDebts,
  type AnnualReport,
  type CategoryBreakdownItem,
  type Debt,
  type MonthlyReport,
  type ReportPeriod,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { currentMonth, currentYear, defaultDateForPeriod, monthLabel, navigateMonth } from '@/lib/format';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

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

function CategoryGridAdapter({
  items,
  period,
  onSelect,
}: {
  items: CategoryBreakdownItem[];
  period: ReportPeriod;
  onSelect: (item: CategoryBreakdownItem) => void;
}) {
  const theme = useThemeColors();
  const router = useRouter();

  return (
    <CategoryBreakdownGrid
      items={items}
      cardStyle={{ backgroundColor: theme.card, borderColor: theme.border }}
      onSelect={onSelect}
      onAdd={(type) => {
        router.push({
          pathname: '/(app)/transactions/new',
          params: {
            type,
            date: defaultDateForPeriod(period).toISOString(),
          },
        });
      }}
    />
  );
}

function MonthlyReportView() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();
  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [previousReport, setPreviousReport] = useState<MonthlyReport | null>(null);
  const [activeDebts, setActiveDebts] = useState<Debt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [data, previousData, debtResult] = await Promise.all([
        getMonthlyReport(month, accessToken),
        getMonthlyReport(navigateMonth(month, -1), accessToken).catch(() => null),
        listDebts({ status: 'ACTIVE', limit: 100 }, accessToken),
      ]);
      setReport(data);
      setPreviousReport(previousData);
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

  const buckets = report ? fillDailyBuckets(month, report.dailyTotals) : [];
  const hasActivity = (report?.dailyTotals.length ?? 0) > 0;
  const isCurrent = month === currentMonth();
  const elapsedDays = isCurrent ? new Date().getDate() : daysInMonth(month);
  const previousMonth = navigateMonth(month, -1);
  const previousHasData = previousReport != null && previousReport.dailyTotals.length > 0;
  const debtsTaken = activeDebts.filter((d) => d.type === 'TAKEN');
  const debtsGiven = activeDebts.filter((d) => d.type === 'GIVEN');

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
          <NetBalanceBanner
            netBalance={report.netBalance}
            label={monthLabel(month)}
            comparison={{
              previous: previousHasData ? previousReport!.netBalance : null,
              label: monthLabel(previousMonth),
            }}
          />
          <MoneyFlowCard
            income={report.totalIncome}
            expense={report.totalExpense}
            saving={report.totalSaving}
            investment={report.totalInvestment}
            debtRepayment={report.totalDebtRepayment}
          />
          {hasActivity ? (
            <>
              <PeriodComparisonCard
                current={report}
                previous={previousHasData ? previousReport : null}
                previousLabel={monthLabel(previousMonth)}
              />
              <InsightsCard
                mode="month"
                totals={report}
                categoryBreakdown={report.categoryBreakdown}
                buckets={buckets}
                elapsed={elapsedDays}
                projectDays={isCurrent ? daysInMonth(month) : undefined}
              />
              <TrendChart mode="month" buckets={buckets} />
            </>
          ) : (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={{ color: theme.muted, fontSize: 14 }}>No transaction data for this month.</Text>
            </View>
          )}
          <BreakdownSection
            categories={report.categoryBreakdown}
            groups={report.groupBreakdown ?? []}
            period={{ kind: 'month', month }}
            CategoryGrid={CategoryGridAdapter}
          />
          <DebtsCard
            taken={debtsTaken.reduce((sum, d) => sum + d.outstanding, 0)}
            given={debtsGiven.reduce((sum, d) => sum + d.outstanding, 0)}
            subtitle={`${debtsTaken.length} taken · ${debtsGiven.length} given (active)`}
          />
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
  const [previousReport, setPreviousReport] = useState<AnnualReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextDisabled = year >= currentYear();

  const fetchReport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [data, previousData] = await Promise.all([
        getAnnualReport(year, accessToken),
        getAnnualReport(year - 1, accessToken).catch(() => null),
      ]);
      setReport(data);
      setPreviousReport(previousData);
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

  const hasActivityIn = (r: AnnualReport | null) =>
    r?.monthlyTotals.some((m) => m.income + m.expense + m.saving + m.investment + m.debtRepayment > 0) ?? false;

  const hasActivity = hasActivityIn(report);
  const previousHasData = hasActivityIn(previousReport);
  const buckets = report ? fillMonthlyBuckets(year, report.monthlyTotals) : [];
  const elapsedMonths = year === currentYear() ? new Date().getMonth() + 1 : 12;

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
          <NetBalanceBanner
            netBalance={report.netBalance}
            label={String(year)}
            comparison={{
              previous: previousHasData && previousReport ? previousReport.netBalance : null,
              label: String(year - 1),
            }}
          />
          <MoneyFlowCard
            income={report.totalIncome}
            expense={report.totalExpense}
            saving={report.totalSaving}
            investment={report.totalInvestment}
            debtRepayment={report.totalDebtRepayment}
            subtitle="How this year's income was used"
          />
          {hasActivity ? (
            <>
              <PeriodComparisonCard
                current={report}
                previous={previousHasData ? previousReport : null}
                previousLabel={String(year - 1)}
              />
              <InsightsCard
                mode="year"
                totals={report}
                categoryBreakdown={report.categoryBreakdown}
                buckets={buckets}
                elapsed={elapsedMonths}
              />
              <TrendChart mode="year" buckets={buckets} />
              <MonthlyBreakdownTable buckets={buckets} />
            </>
          ) : (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={{ color: theme.muted, fontSize: 14 }}>No transaction data for this year.</Text>
            </View>
          )}
          <BreakdownSection
            categories={report.categoryBreakdown}
            groups={report.groupBreakdown ?? []}
            period={{ kind: 'year', year }}
            CategoryGrid={CategoryGridAdapter}
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
  error: { color: '#dc2626', fontSize: 14 },
  empty: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center' },
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
