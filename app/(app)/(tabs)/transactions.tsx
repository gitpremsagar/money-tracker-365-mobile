import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import MonthPicker from '@/components/MonthPicker';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  deleteTransaction,
  listCategories,
  listTransactions,
  type Category,
  type CategoryType,
  type Transaction,
  type TransactionPagination,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  TYPE_COLORS,
  TYPE_SHORT,
  currentMonth,
  formatAmount,
  formatDate,
  typeIcon,
} from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const TYPE_OPTIONS: { label: string; value: CategoryType | '' }[] = [
  { label: 'All types', value: '' },
  { label: 'Income', value: 'INCOME' },
  { label: 'Expense', value: 'EXPENSE' },
  { label: 'Saving', value: 'SAVING' },
  { label: 'Investment', value: 'INVESTMENT' },
];

export default function TransactionsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pagination, setPagination] = useState<TransactionPagination | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [month, setMonth] = useState(currentMonth());
  const [typeFilter, setTypeFilter] = useState<CategoryType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [page, setPage] = useState(1);

  const fetchTransactions = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await listTransactions(
        {
          month,
          type: typeFilter || undefined,
          categoryId: categoryFilter || undefined,
          page,
          limit: 20,
        },
        accessToken,
      );
      setTransactions(result.transactions);
      setPagination(result.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, month, typeFilter, categoryFilter, page]);

  useEffect(() => {
    if (!accessToken) return;
    listCategories(accessToken).then(setCategories).catch(() => {});
  }, [accessToken]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await fetchTransactions();
    })();
  }, [fetchTransactions]);

  async function handleDelete(id: string) {
    if (!accessToken) return;
    setDeletingId(id);
    try {
      await deleteTransaction(id, accessToken);
      setTransactions((prev) => prev.filter((t) => t.id !== id));
      if (pagination) {
        setPagination({ ...pagination, total: pagination.total - 1 });
      }
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function renderItem({ item: tx }: { item: Transaction }) {
    const colors = TYPE_COLORS[tx.type];
    return (
      <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable
          onPress={() => router.push(`/(app)/transactions/${tx.id}`)}
          style={styles.rowMain}>
          <View style={[styles.icon, { backgroundColor: theme.isDark ? colors.darkBg : colors.bg }]}>
            <Text>{typeIcon(tx.type)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {tx.category.name}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {formatDate(tx.date)}{tx.note ? ` · ${tx.note}` : ''}
            </Text>
          </View>
          <Text style={{ color: theme.isDark ? colors.darkText : colors.text, fontWeight: '600' }}>
            {formatAmount(tx.amount, tx.type)}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={() => router.push(`/(app)/transactions/${tx.id}/edit`)}>
            <Ionicons name="pencil-outline" size={18} color={theme.muted} />
          </Pressable>
          <Pressable onPress={() => setPendingDeleteId(tx.id)} disabled={deletingId === tx.id}>
            {deletingId === tx.id ? (
              <ActivityIndicator size="small" color={theme.danger} />
            ) : (
              <Ionicons name="trash-outline" size={18} color={theme.muted} />
            )}
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={styles.topBar}>
        <View>
          <Text style={{ fontSize: 12, color: theme.muted }}>Transactions</Text>
          {pagination && (
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              {pagination.total} total
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/(app)/transactions/new')}
          style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.monthFilter}>
        <MonthPicker
          month={month}
          onChange={(next) => {
            setMonth(next);
            setPage(1);
          }}
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value || 'all'}
            onPress={() => { setTypeFilter(opt.value); setPage(1); }}
            style={[
              styles.filterChip,
              {
                borderColor: typeFilter === opt.value ? theme.primary : theme.border,
                backgroundColor: typeFilter === opt.value ? `${theme.primary}15` : theme.card,
              },
            ]}>
            <Text style={{ color: typeFilter === opt.value ? theme.primary : theme.colors.text, fontSize: 13 }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {categories.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
          <Pressable
            onPress={() => { setCategoryFilter(''); setPage(1); }}
            style={[
              styles.filterChip,
              {
                borderColor: !categoryFilter ? theme.primary : theme.border,
                backgroundColor: !categoryFilter ? `${theme.primary}15` : theme.card,
              },
            ]}>
            <Text style={{ color: !categoryFilter ? theme.primary : theme.colors.text, fontSize: 13 }}>
              All categories
            </Text>
          </Pressable>
          {categories.map((cat) => (
            <Pressable
              key={cat.id}
              onPress={() => { setCategoryFilter(cat.id); setPage(1); }}
              style={[
                styles.filterChip,
                {
                  borderColor: categoryFilter === cat.id ? theme.primary : theme.border,
                  backgroundColor: categoryFilter === cat.id ? `${theme.primary}15` : theme.card,
                },
              ]}>
              <Text style={{ color: categoryFilter === cat.id ? theme.primary : theme.colors.text, fontSize: 13 }}>
                {cat.name} ({TYPE_SHORT[cat.type]})
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={[styles.error, { padding: 16 }]}>{error}</Text>
      ) : transactions.length === 0 ? (
        <View style={{ padding: 16 }}>
          <EmptyState
            message="No transactions found for this period."
            actionLabel="Add your first transaction"
            onAction={() => router.push('/(app)/transactions/new')}
          />
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => { setIsRefreshing(true); void fetchTransactions(); }}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={
            pagination && pagination.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  style={[styles.pageBtn, { borderColor: theme.border, opacity: page === 1 ? 0.4 : 1 }]}>
                  <Text style={{ color: theme.colors.text }}>Previous</Text>
                </Pressable>
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  Page {page} of {pagination.totalPages}
                </Text>
                <Pressable
                  onPress={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                  disabled={page === pagination.totalPages}
                  style={[styles.pageBtn, { borderColor: theme.border, opacity: page === pagination.totalPages ? 0.4 : 1 }]}>
                  <Text style={{ color: theme.colors.text }}>Next</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title="Delete transaction"
        message="This transaction will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        isConfirming={deletingId !== null}
        onConfirm={() => {
          if (pendingDeleteId) void handleDelete(pendingDeleteId);
        }}
        onCancel={() => {
          if (deletingId === null) setPendingDeleteId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  monthFilter: { paddingHorizontal: 16, marginTop: 12 },
  filtersScroll: { paddingHorizontal: 16, marginTop: 12, maxHeight: 44 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8 },
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, paddingRight: 14 },
  pagination: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e4e4e7' },
  pageBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  error: { color: '#dc2626', fontSize: 14 },
});
