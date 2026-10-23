import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  deleteTransaction,
  listCategories,
  listTransactions,
  type Category,
  type CategoryType,
  type Transaction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  TYPE_COLORS,
  TYPE_SHORT,
  formatAmount,
  formatCurrency,
  formatDate,
  typeIcon,
} from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

type PresetId = 'thisMonth' | 'lastMonth' | 'last3Months' | 'thisYear';

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'last3Months', label: 'Last 3 months' },
  { id: 'thisYear', label: 'This year' },
];

const TYPE_OPTIONS: { label: string; value: CategoryType | '' }[] = [
  { label: 'All types', value: '' },
  { label: 'Income', value: 'INCOME' },
  { label: 'Expense', value: 'EXPENSE' },
  { label: 'Saving', value: 'SAVING' },
  { label: 'Investment', value: 'INVESTMENT' },
];

function toDateInput(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateInput(value: string) {
  const [y, m, d] = value.split('-').map((n) => parseInt(n, 10));
  return { y: y ?? 1970, m: m ?? 1, d: d ?? 1 };
}

function presetRange(id: PresetId): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (id) {
    case 'thisMonth':
      return { from: toDateInput(new Date(y, m, 1)), to: toDateInput(new Date(y, m + 1, 0)) };
    case 'lastMonth':
      return { from: toDateInput(new Date(y, m - 1, 1)), to: toDateInput(new Date(y, m, 0)) };
    case 'last3Months':
      return { from: toDateInput(new Date(y, m - 2, 1)), to: toDateInput(new Date(y, m + 1, 0)) };
    case 'thisYear':
      return { from: toDateInput(new Date(y, 0, 1)), to: toDateInput(new Date(y, 11, 31)) };
  }
}

export default function TransactionsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const initialRange = presetRange('thisMonth');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [typeFilter, setTypeFilter] = useState<CategoryType | ''>('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);

  const activePreset = PRESETS.find((p) => {
    const r = presetRange(p.id);
    return r.from === fromDate && r.to === toDate;
  })?.id;

  const visibleCategories = typeFilter ? categories.filter((c) => c.type === typeFilter) : categories;

  const searchTerm = searchInput.trim().toLowerCase();
  const minAmountValue = minAmount.trim() === '' ? null : Number(minAmount);
  const maxAmountValue = maxAmount.trim() === '' ? null : Number(maxAmount);

  const visibleTransactions = useMemo(
    () =>
      transactions.filter((t) => {
        if (
          searchTerm &&
          !t.note?.toLowerCase().includes(searchTerm) &&
          !t.category.name.toLowerCase().includes(searchTerm)
        ) {
          return false;
        }
        if (minAmountValue !== null && !Number.isNaN(minAmountValue) && t.amount < minAmountValue) return false;
        if (maxAmountValue !== null && !Number.isNaN(maxAmountValue) && t.amount > maxAmountValue) return false;
        return true;
      }),
    [transactions, searchTerm, minAmountValue, maxAmountValue],
  );

  const totals = useMemo(() => {
    const sums: Record<CategoryType, number> = { INCOME: 0, EXPENSE: 0, SAVING: 0, INVESTMENT: 0 };
    for (const t of visibleTransactions) sums[t.type] += t.amount;
    return sums;
  }, [visibleTransactions]);

  const activeFilterCount =
    (activePreset ? 0 : 1) +
    (typeFilter ? 1 : 0) +
    (categoryFilter ? 1 : 0) +
    (minAmount.trim() ? 1 : 0) +
    (maxAmount.trim() ? 1 : 0);

  function applyPreset(id: PresetId) {
    const r = presetRange(id);
    setFromDate(r.from);
    setToDate(r.to);
  }

  function resetFilters() {
    applyPreset('thisMonth');
    setTypeFilter('');
    setCategoryFilter('');
    setMinAmount('');
    setMaxAmount('');
    setSearchInput('');
  }

  function handleTypeChange(value: CategoryType | '') {
    setTypeFilter(value);
    if (value && categoryFilter) {
      const selected = categories.find((c) => c.id === categoryFilter);
      if (selected && selected.type !== value) setCategoryFilter('');
    }
  }

  const fetchTransactions = useCallback(async () => {
    if (!accessToken) return;
    try {
      let from: string | undefined;
      let to: string | undefined;
      if (fromDate) {
        const { y, m, d } = parseDateInput(fromDate);
        from = new Date(y, m - 1, d).toISOString();
      }
      if (toDate) {
        const { y, m, d } = parseDateInput(toDate);
        to = new Date(y, m - 1, d + 1).toISOString();
      }
      const result = await listTransactions(
        {
          from,
          to,
          type: typeFilter || undefined,
          categoryId: categoryFilter || undefined,
          limit: 100,
        },
        accessToken,
      );
      setTransactions(result.transactions);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, fromDate, toDate, typeFilter, categoryFilter]);

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
      setPendingDeleteId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    } finally {
      setDeletingId(null);
    }
  }

  function handlePickDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') {
      setPicking(null);
      if (event.type !== 'set' || !selected) return;
    }
    if (!selected || !picking) return;
    const value = toDateInput(selected);
    if (picking === 'from') setFromDate(value);
    else setToDate(value);
    if (Platform.OS === 'ios') setPicking(null);
  }

  function renderItem({ item: tx }: { item: Transaction }) {
    const colors = TYPE_COLORS[tx.type];
    return (
      <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => router.push(`/(app)/transactions/${tx.id}`)} style={styles.rowMain}>
          <View style={[styles.icon, { backgroundColor: theme.isDark ? colors.darkBg : colors.bg }]}>
            <Text>{typeIcon(tx.type)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {tx.category.name}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {formatDate(tx.date)}
              {tx.note ? ` · ${tx.note}` : ''}
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
          {!isLoading && !error ? (
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              {visibleTransactions.length} transaction{visibleTransactions.length !== 1 ? 's' : ''}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/(app)/transactions/new')}
          style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          {PRESETS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => applyPreset(p.id)}
              style={[
                styles.filterChip,
                {
                  borderColor: activePreset === p.id ? theme.primary : theme.border,
                  backgroundColor: activePreset === p.id ? `${theme.primary}15` : theme.card,
                },
              ]}>
              <Text style={{ color: activePreset === p.id ? theme.primary : theme.colors.text, fontSize: 13 }}>
                {p.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            onPress={() => setFiltersOpen((v) => !v)}
            style={[
              styles.filterChip,
              {
                borderColor: !activePreset || filtersOpen ? theme.primary : theme.border,
                backgroundColor: !activePreset || filtersOpen ? `${theme.primary}15` : theme.card,
              },
            ]}>
            <Text style={{ color: !activePreset || filtersOpen ? theme.primary : theme.colors.text, fontSize: 13 }}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search note or category…"
          placeholderTextColor={theme.muted}
          style={[
            styles.searchInput,
            { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text },
          ]}
        />
      </View>

      {filtersOpen ? (
        <View style={[styles.filterPanel, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8 }}>Custom date range</Text>
          <View style={styles.dateRow}>
            <Pressable
              onPress={() => setPicking('from')}
              style={[styles.dateBtn, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>From {fromDate}</Text>
            </Pressable>
            <Pressable
              onPress={() => setPicking('to')}
              style={[styles.dateBtn, { borderColor: theme.border, backgroundColor: theme.background }]}>
              <Text style={{ color: theme.colors.text, fontSize: 13 }}>To {toDate}</Text>
            </Pressable>
          </View>

          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TYPE_OPTIONS.map((opt) => (
              <Pressable
                key={opt.value || 'all'}
                onPress={() => handleTypeChange(opt.value)}
                style={[
                  styles.filterChip,
                  {
                    borderColor: typeFilter === opt.value ? theme.primary : theme.border,
                    backgroundColor: typeFilter === opt.value ? `${theme.primary}15` : theme.background,
                  },
                ]}>
                <Text style={{ color: typeFilter === opt.value ? theme.primary : theme.colors.text, fontSize: 13 }}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          {visibleCategories.length > 0 ? (
            <>
              <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable
                  onPress={() => setCategoryFilter('')}
                  style={[
                    styles.filterChip,
                    {
                      borderColor: !categoryFilter ? theme.primary : theme.border,
                      backgroundColor: !categoryFilter ? `${theme.primary}15` : theme.background,
                    },
                  ]}>
                  <Text style={{ color: !categoryFilter ? theme.primary : theme.colors.text, fontSize: 13 }}>
                    All categories
                  </Text>
                </Pressable>
                {visibleCategories.map((cat) => (
                  <Pressable
                    key={cat.id}
                    onPress={() => setCategoryFilter(cat.id)}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: categoryFilter === cat.id ? theme.primary : theme.border,
                        backgroundColor: categoryFilter === cat.id ? `${theme.primary}15` : theme.background,
                      },
                    ]}>
                    <Text
                      style={{
                        color: categoryFilter === cat.id ? theme.primary : theme.colors.text,
                        fontSize: 13,
                      }}>
                      {cat.name} ({TYPE_SHORT[cat.type]})
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          ) : null}

          <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 8, marginTop: 12 }}>Amount</Text>
          <View style={styles.amountRow}>
            <TextInput
              value={minAmount}
              onChangeText={setMinAmount}
              keyboardType="decimal-pad"
              placeholder="Min"
              placeholderTextColor={theme.muted}
              style={[
                styles.amountInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.colors.text },
              ]}
            />
            <TextInput
              value={maxAmount}
              onChangeText={setMaxAmount}
              keyboardType="decimal-pad"
              placeholder="Max"
              placeholderTextColor={theme.muted}
              style={[
                styles.amountInput,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.colors.text },
              ]}
            />
          </View>

          <Pressable onPress={resetFilters} style={{ marginTop: 12, alignSelf: 'flex-start' }}>
            <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>Reset filters</Text>
          </Pressable>
        </View>
      ) : null}

      {picking ? (
        <DateTimePicker
          value={new Date(parseDateInput(picking === 'from' ? fromDate : toDate).y, parseDateInput(picking === 'from' ? fromDate : toDate).m - 1, parseDateInput(picking === 'from' ? fromDate : toDate).d)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={handlePickDate}
        />
      ) : null}

      {!isLoading && visibleTransactions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.totalsScroll}>
          {(Object.keys(totals) as CategoryType[]).map((type) =>
            totals[type] > 0 ? (
              <View
                key={type}
                style={[
                  styles.totalChip,
                  {
                    backgroundColor: theme.isDark ? TYPE_COLORS[type].darkBg : TYPE_COLORS[type].bg,
                  },
                ]}>
                <Text
                  style={{
                    color: theme.isDark ? TYPE_COLORS[type].darkText : TYPE_COLORS[type].text,
                    fontSize: 12,
                    fontWeight: '600',
                  }}>
                  {TYPE_SHORT[type]} {formatCurrency(totals[type])}
                </Text>
              </View>
            ) : null,
          )}
        </ScrollView>
      ) : null}

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={[styles.error, { padding: 16 }]}>{error}</Text>
      ) : visibleTransactions.length === 0 ? (
        <View style={{ padding: 16 }}>
          <EmptyState
            message="No transactions found for this period."
            actionLabel="Add your first transaction"
            onAction={() => router.push('/(app)/transactions/new')}
          />
        </View>
      ) : (
        <FlatList
          data={visibleTransactions}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void fetchTransactions();
              }}
              tintColor={theme.primary}
            />
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toolbar: { paddingHorizontal: 16, marginTop: 12 },
  searchWrap: { paddingHorizontal: 16, marginTop: 10 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  filterPanel: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  dateRow: { flexDirection: 'row', gap: 8 },
  dateBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  amountRow: { flexDirection: 'row', gap: 8 },
  amountInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
  },
  filterChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
  },
  totalsScroll: { paddingHorizontal: 16, marginTop: 10, maxHeight: 40 },
  totalChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 14, fontWeight: '500' },
  actions: { flexDirection: 'row', gap: 12, paddingRight: 14 },
  error: { color: '#dc2626', fontSize: 14 },
});
