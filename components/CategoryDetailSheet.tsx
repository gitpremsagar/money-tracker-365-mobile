import TypeBadge from '@/components/TypeBadge';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  listTransactions,
  type CategoryBreakdownItem,
  type ReportPeriod,
  type Transaction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatAmount, formatCurrency, monthLabel } from '@/lib/format';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SortKey = 'date' | 'amount';
type SortDirection = 'asc' | 'desc';

function periodLabel(period: ReportPeriod): string {
  if (period.kind === 'year') return String(period.year);
  return monthLabel(period.month);
}

async function listAllTransactions(
  params: { month?: string; year?: number; categoryId: string; type: CategoryBreakdownItem['type'] },
  accessToken: string,
): Promise<Transaction[]> {
  const limit = 100;
  const transactions: Transaction[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const result = await listTransactions({ ...params, page, limit }, accessToken);
    transactions.push(...result.transactions);
    totalPages = result.pagination.totalPages;
    page += 1;
  }

  return transactions;
}

function sortTransactions(transactions: Transaction[], key: SortKey, direction: SortDirection) {
  const factor = direction === 'asc' ? 1 : -1;
  return [...transactions].sort((a, b) => {
    if (key === 'amount') return (a.amount - b.amount) * factor;
    return (new Date(a.date).getTime() - new Date(b.date).getTime()) * factor;
  });
}

type Props = {
  item: CategoryBreakdownItem | null;
  period: ReportPeriod;
  onClose: () => void;
};

export default function CategoryDetailSheet({ item, period, onClose }: Props) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const periodMonth = period.kind === 'month' ? period.month : undefined;
  const periodYear = period.kind === 'year' ? period.year : undefined;

  useEffect(() => {
    if (!item || !accessToken) return;
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);
      setTransactions([]);
      try {
        const data = await listAllTransactions(
          {
            categoryId: item.id,
            type: item.type,
            ...(periodMonth ? { month: periodMonth } : { year: periodYear }),
          },
          accessToken,
        );
        if (!cancelled) setTransactions(data);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load transactions');
          setTransactions([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, item, periodMonth, periodYear]);

  const average = item && transactions.length > 0 ? item.total / transactions.length : 0;
  const sortedTransactions = useMemo(
    () => sortTransactions(transactions, sortKey, sortDirection),
    [transactions, sortKey, sortDirection],
  );

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((direction) => (direction === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(nextKey);
    setSortDirection('desc');
  }

  function openTransaction(id: string) {
    onClose();
    router.push(`/(app)/transactions/${id}`);
  }

  return (
    <Modal visible={item !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
        {item ? (
          <>
            <View style={[styles.header, { borderBottomColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.period, { color: theme.muted }]}>{periodLabel(period)}</Text>
                <Text style={[styles.title, { color: theme.colors.text }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <TypeBadge type={item.type} />
              </View>
              <Pressable onPress={onClose} style={styles.close}>
                <Text style={{ color: theme.muted, fontSize: 16, fontWeight: '600' }}>Close</Text>
              </Pressable>
            </View>

            <View style={[styles.stats, { borderBottomColor: theme.border }]}>
              <Stat label="Total" value={formatCurrency(item.total, 0)} themeText={theme.colors.text} muted={theme.muted} />
              <Stat label="Share" value={`${item.percentage}%`} themeText={theme.colors.text} muted={theme.muted} />
              <Stat
                label="Average"
                value={isLoading ? '—' : formatCurrency(average, 0)}
                themeText={theme.colors.text}
                muted={theme.muted}
              />
            </View>

            <ScrollView contentContainerStyle={styles.list}>
              {isLoading ? (
                <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
              ) : error ? (
                <Text style={styles.error}>{error}</Text>
              ) : transactions.length === 0 ? (
                <Text style={{ color: theme.muted }}>No transactions in this period.</Text>
              ) : (
                <>
                  <View style={styles.sortRow}>
                    <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>
                      {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
                    </Text>
                    <View style={[styles.sortToggle, { borderColor: theme.border }]}>
                      {(['date', 'amount'] as const).map((key) => {
                        const active = sortKey === key;
                        return (
                          <Pressable
                            key={key}
                            onPress={() => toggleSort(key)}
                            style={[
                              styles.sortButton,
                              { backgroundColor: active ? theme.primary : 'transparent' },
                            ]}>
                            <Text style={{ color: active ? '#fff' : theme.muted, fontSize: 12, fontWeight: '600' }}>
                              {key === 'date' ? 'Date' : 'Amount'}
                              {active ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  {sortedTransactions.map((tx) => (
                    <Pressable
                      key={tx.id}
                      onPress={() => openTransaction(tx.id)}
                      style={[styles.tx, { borderColor: theme.border, backgroundColor: theme.card }]}>
                      <View style={styles.txTop}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>DATE & TIME</Text>
                          <Text style={{ color: theme.colors.text, marginTop: 2 }}>
                            {new Date(tx.date).toLocaleString('en-IN', {
                              weekday: 'short',
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '700', color: theme.colors.text }}>
                          {formatAmount(tx.amount, tx.type)}
                        </Text>
                      </View>
                      <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600', marginTop: 10 }}>NOTE</Text>
                      <Text style={{ color: theme.colors.text, marginTop: 2 }}>{tx.note?.trim() ? tx.note : '—'}</Text>
                      <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginTop: 10 }}>
                        Open transaction
                      </Text>
                    </Pressable>
                  ))}
                </>
              )}
            </ScrollView>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

function Stat({
  label,
  value,
  themeText,
  muted,
}: {
  label: string;
  value: string;
  themeText: string;
  muted: string;
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: themeText, fontWeight: '700', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  period: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 20, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  close: { paddingVertical: 4 },
  stats: { flexDirection: 'row', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
  list: { padding: 16, gap: 12, paddingBottom: 32 },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sortToggle: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 2 },
  sortButton: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  tx: { borderWidth: 1, borderRadius: 14, padding: 14 },
  txTop: { flexDirection: 'row', gap: 12 },
  error: { color: '#dc2626', fontSize: 14 },
});
