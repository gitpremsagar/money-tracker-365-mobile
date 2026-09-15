import EmptyState from '@/components/EmptyState';
import StatCard from '@/components/StatCard';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getMonthlyReport, listDebts, listTransactions, type Debt, type MonthlyReport, type Transaction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  TYPE_COLORS,
  currentMonth,
  formatAmount,
  formatCurrency,
  formatDate,
  monthLabel,
  typeIcon,
} from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function DashboardScreen() {
  const { user, accessToken, logout } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [activeDebts, setActiveDebts] = useState<Debt[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const month = currentMonth();
  const monthLabelText = monthLabel(month);
  const debtTaken = activeDebts.filter((debt) => debt.type === 'TAKEN').reduce((sum, debt) => sum + debt.amount, 0);
  const debtGiven = activeDebts.filter((debt) => debt.type === 'GIVEN').reduce((sum, debt) => sum + debt.amount, 0);

  const loadDashboard = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [rep, txResult, debtResult] = await Promise.all([
        getMonthlyReport(month, accessToken),
        listTransactions({ month, page: 1, limit: 5 }, accessToken),
        listDebts({ status: 'ACTIVE', limit: 100 }, accessToken),
      ]);
      setReport(rep);
      setRecentTransactions(txResult.transactions);
      setActiveDebts(debtResult.debts);
    } catch {
      // show empty state
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, month]);

  useFocusEffect(
    useCallback(() => {
      void loadDashboard();
    }, [loadDashboard]),
  );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={[styles.greeting, { color: theme.colors.text }]}>
            Hello, {user?.name?.split(' ')[0]} 👋
          </Text>
          {user?.name ? (
            <Text style={[styles.accountName, { color: theme.colors.text }]} numberOfLines={1}>
              {user.name}
            </Text>
          ) : null}
          {user?.email ? (
            <Text style={[styles.accountEmail, { color: theme.muted }]} numberOfLines={1}>
              {user.email}
            </Text>
          ) : null}
          <Text style={[styles.subtitle, { color: theme.muted }]}>{monthLabelText} summary</Text>
          <Pressable onPress={() => void logout()} style={styles.logoutButton}>
            <Ionicons name="log-out-outline" size={16} color={theme.muted} />
            <Text style={{ color: theme.muted, fontWeight: '600', fontSize: 14 }}>Log out</Text>
          </Pressable>
        </View>
        <Pressable
          onPress={() => router.push('/(app)/transactions/new')}
          style={[styles.addButton, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginVertical: 32 }} />
      ) : report ? (
        <View style={styles.statsGrid}>
          <StatCard label="Total Income" value={formatCurrency(report.totalIncome)} color="green" />
          <StatCard label="Total Expense" value={formatCurrency(report.totalExpense)} color="red" />
          <StatCard label="Total Savings" value={formatCurrency(report.totalSaving)} color="blue" />
          <StatCard label="Total Investments" value={formatCurrency(report.totalInvestment)} color="purple" />
          <StatCard
            label="Net Balance"
            value={`${report.netBalance >= 0 ? '+' : ''}${formatCurrency(report.netBalance)}`}
            color={report.netBalance >= 0 ? 'blue' : 'red'}
          />
          <StatCard label="Debt Taken" value={formatCurrency(debtTaken)} color="red" />
          <StatCard label="Debt Given" value={formatCurrency(debtGiven)} color="green" />
        </View>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Recent Transactions</Text>
        <Pressable onPress={() => router.push('/(app)/(tabs)/transactions')}>
          <Text style={{ color: theme.primary, fontSize: 14 }}>View all</Text>
        </Pressable>
      </View>

      {isLoading ? null : recentTransactions.length === 0 ? (
        <EmptyState
          message="No transactions this month."
          actionLabel="Add one"
          onAction={() => router.push('/(app)/transactions/new')}
        />
      ) : (
        recentTransactions.map((tx) => {
          const colors = TYPE_COLORS[tx.type];
          return (
            <Pressable
              key={tx.id}
              onPress={() => router.push(`/(app)/transactions/${tx.id}`)}
              style={[styles.txRow, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <View
                style={[
                  styles.txIcon,
                  { backgroundColor: theme.isDark ? colors.darkBg : colors.bg },
                ]}>
                <Text>{typeIcon(tx.type)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.txName, { color: theme.colors.text }]} numberOfLines={1}>
                  {tx.category.name}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{formatDate(tx.date)}</Text>
              </View>
              <Text style={{ color: theme.isDark ? colors.darkText : colors.text, fontWeight: '600' }}>
                {formatAmount(tx.amount, tx.type)}
              </Text>
            </Pressable>
          );
        })
      )}

      <View style={styles.quickLinks}>
        {(
          [
            { label: 'Add Transaction', route: '/(app)/transactions/new' as Href, icon: 'add-circle-outline' as const },
            { label: 'Add Debt', route: '/(app)/debts/new' as Href, icon: 'card-outline' as const },
            { label: 'Categories', route: '/(app)/(tabs)/categories' as Href, icon: 'pricetags-outline' as const },
            { label: 'Monthly Report', route: { pathname: '/(app)/(tabs)/reports', params: { view: 'monthly' } } as Href, icon: 'bar-chart-outline' as const },
            { label: 'Annual Report', route: { pathname: '/(app)/(tabs)/reports', params: { view: 'annual' } } as Href, icon: 'calendar-outline' as const },
            { label: 'All Debts', route: '/(app)/(tabs)/debts' as Href, icon: 'wallet-outline' as const },
            { label: 'All Transactions', route: '/(app)/(tabs)/transactions' as Href, icon: 'list-outline' as const },
          ] as const
        ).map((item) => (
          <Pressable
            key={item.label}
            onPress={() => router.push(item.route)}
            style={[styles.quickLink, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Ionicons name={item.icon} size={24} color={theme.primary} />
            <Text style={[styles.quickLinkText, { color: theme.muted }]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  greeting: { fontSize: 22, fontWeight: '700' },
  accountName: { fontSize: 14, fontWeight: '600', marginTop: 6 },
  accountEmail: { fontSize: 12, marginTop: 2 },
  subtitle: { fontSize: 14, marginTop: 4 },
  logoutButton: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, alignSelf: 'flex-start' },
  addButton: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  addText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  txIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  txName: { fontSize: 14, fontWeight: '500' },
  quickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  quickLink: { width: '47%', alignItems: 'center', padding: 16, borderRadius: 14, borderWidth: 1, gap: 6 },
  quickLinkText: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
});
