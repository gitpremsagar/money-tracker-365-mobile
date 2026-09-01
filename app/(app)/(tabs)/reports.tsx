import CategoryBreakdown from '@/components/CategoryBreakdown';
import MonthPicker from '@/components/MonthPicker';
import StatCard from '@/components/StatCard';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getMonthlyReport, type MonthlyReport } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { currentMonth, formatCurrency } from '@/lib/format';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';

export default function ReportsScreen() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [month, setMonth] = useState(currentMonth());
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await getMonthlyReport(month, accessToken);
      setReport(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, month]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await fetchReport();
    })();
  }, [fetchReport]);

  const incomeCategories = report?.categoryBreakdown.filter((c) => c.type === 'INCOME') ?? [];
  const expenseCategories = report?.categoryBreakdown.filter((c) => c.type === 'EXPENSE') ?? [];
  const savingCategories = report?.categoryBreakdown.filter((c) => c.type === 'SAVING') ?? [];
  const investmentCategories = report?.categoryBreakdown.filter((c) => c.type === 'INVESTMENT') ?? [];

  const chartWidth = Dimensions.get('window').width - 64;

  const barData =
    report?.dailyTotals.flatMap((d) => [
      { value: d.income, label: d.date.slice(8), frontColor: '#10b981', spacing: 2 },
      { value: d.expense, frontColor: '#f87171', spacing: 2 },
      { value: d.saving, frontColor: '#3b82f6', spacing: 2 },
      { value: d.investment, frontColor: '#a855f7', spacing: 8 },
    ]) ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => { setIsRefreshing(true); void fetchReport(); }}
          tintColor={theme.primary}
        />
      }>
      <Text style={[styles.subtitle, { color: theme.muted }]}>Monthly Report</Text>
      <MonthPicker month={month} onChange={setMonth} />

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : report ? (
        <>
          <View style={styles.statsGrid}>
            <StatCard label="Total Income" value={formatCurrency(report.totalIncome, 0)} color="green" />
            <StatCard label="Total Expense" value={formatCurrency(report.totalExpense, 0)} color="red" />
            <StatCard label="Total Savings" value={formatCurrency(report.totalSaving, 0)} color="blue" />
            <StatCard label="Total Investments" value={formatCurrency(report.totalInvestment, 0)} color="purple" />
            <StatCard
              label="Net Balance"
              value={`${report.netBalance >= 0 ? '+' : '-'}${formatCurrency(report.netBalance, 0)}`}
              color={report.netBalance >= 0 ? 'blue' : 'red'}
            />
          </View>

          {barData.length > 0 ? (
            <View style={[styles.chartCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.chartTitle, { color: theme.colors.text }]}>Daily Trend</Text>
              <View style={styles.legend}>
                {[
                  { label: 'Income', color: '#10b981' },
                  { label: 'Expense', color: '#f87171' },
                  { label: 'Saving', color: '#3b82f6' },
                  { label: 'Investment', color: '#a855f7' },
                ].map((item) => (
                  <View key={item.label} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                    <Text style={{ color: theme.muted, fontSize: 11 }}>{item.label}</Text>
                  </View>
                ))}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <BarChart
                  data={barData}
                  width={Math.max(chartWidth, barData.length * 12)}
                  height={200}
                  barWidth={8}
                  noOfSections={4}
                  yAxisTextStyle={{ color: theme.muted, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: theme.muted, fontSize: 9 }}
                  isAnimated
                />
              </ScrollView>
            </View>
          ) : (
            <View style={[styles.emptyChart, { borderColor: theme.border }]}>
              <Text style={{ color: theme.muted, fontSize: 14 }}>No transaction data for this month.</Text>
            </View>
          )}

          <View style={styles.breakdownGrid}>
            <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <CategoryBreakdown items={incomeCategories} title="Income by Category" color="#10b981" />
            </View>
            <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <CategoryBreakdown items={expenseCategories} title="Expenses by Category" color="#f87171" />
            </View>
            <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <CategoryBreakdown items={savingCategories} title="Savings by Category" color="#3b82f6" />
            </View>
            <View style={[styles.breakdownCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <CategoryBreakdown items={investmentCategories} title="Investments by Category" color="#a855f7" />
            </View>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  subtitle: { fontSize: 14, marginBottom: -8 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  chartTitle: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  emptyChart: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 16, padding: 32, alignItems: 'center' },
  breakdownGrid: { gap: 12 },
  breakdownCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  error: { color: '#dc2626', fontSize: 14, marginTop: 16 },
});
