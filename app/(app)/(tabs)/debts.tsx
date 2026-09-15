import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  deleteDebt,
  listDebts,
  type Debt,
  type DebtPagination,
  type DebtStatus,
  type DebtType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  DEBT_COLORS,
  DEBT_STATUS_LABEL,
  DEBT_TYPE_LABEL,
  formatCurrency,
  formatDateOnly,
} from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
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

const TYPE_OPTIONS: { label: string; value: DebtType | '' }[] = [
  { label: 'All types', value: '' },
  { label: 'Taken', value: 'TAKEN' },
  { label: 'Given', value: 'GIVEN' },
];

const STATUS_OPTIONS: { label: string; value: DebtStatus | '' }[] = [
  { label: 'All statuses', value: '' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Settled', value: 'SETTLED' },
];

export default function DebtsScreen() {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [debts, setDebts] = useState<Debt[]>([]);
  const [pagination, setPagination] = useState<DebtPagination | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<DebtType | ''>('');
  const [statusFilter, setStatusFilter] = useState<DebtStatus | ''>('');
  const [page, setPage] = useState(1);

  const fetchDebts = useCallback(async () => {
    if (!accessToken) return;
    try {
      const result = await listDebts(
        {
          type: typeFilter || undefined,
          status: statusFilter || undefined,
          page,
          limit: 20,
        },
        accessToken,
      );
      setDebts(result.debts);
      setPagination(result.pagination);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load debts');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken, typeFilter, statusFilter, page]);

  useFocusEffect(
    useCallback(() => {
      setIsLoading(true);
      void fetchDebts();
    }, [fetchDebts]),
  );

  async function handleDelete(id: string) {
    if (!accessToken) return;
    setDeletingId(id);
    try {
      await deleteDebt(id, accessToken);
      setDebts((prev) => prev.filter((debt) => debt.id !== id));
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

  function renderItem({ item: debt }: { item: Debt }) {
    const colors = DEBT_COLORS[debt.type];
    return (
      <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => router.push(`/(app)/debts/${debt.id}` as Href)} style={styles.rowMain}>
          <View style={[styles.icon, { backgroundColor: theme.isDark ? colors.darkBg : colors.bg }]}>
            <Text>{debt.type === 'TAKEN' ? '↓' : '↑'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {debt.partyName}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {DEBT_TYPE_LABEL[debt.type]} · {formatDateOnly(debt.date)} · {DEBT_STATUS_LABEL[debt.status]}
            </Text>
          </View>
          <Text style={{ color: theme.isDark ? colors.darkText : colors.text, fontWeight: '600' }}>
            {formatCurrency(debt.amount)}
          </Text>
        </Pressable>
        <View style={styles.actions}>
          <Pressable onPress={() => router.push(`/(app)/debts/${debt.id}/edit` as Href)}>
            <Ionicons name="pencil-outline" size={18} color={theme.muted} />
          </Pressable>
          <Pressable onPress={() => setPendingDeleteId(debt.id)} disabled={deletingId === debt.id}>
            {deletingId === debt.id ? (
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
          <Text style={{ fontSize: 12, color: theme.muted }}>Debts</Text>
          {pagination ? (
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              {pagination.total} debt{pagination.total === 1 ? '' : 's'}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/(app)/debts/new' as Href)}
          style={[styles.addBtn, { backgroundColor: theme.primary }]}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14 }}>Add</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
        {TYPE_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value || 'all-types'}
            onPress={() => {
              setTypeFilter(opt.value);
              setPage(1);
            }}
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

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
        {STATUS_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value || 'all-statuses'}
            onPress={() => {
              setStatusFilter(opt.value);
              setPage(1);
            }}
            style={[
              styles.filterChip,
              {
                borderColor: statusFilter === opt.value ? theme.primary : theme.border,
                backgroundColor: statusFilter === opt.value ? `${theme.primary}15` : theme.card,
              },
            ]}>
            <Text style={{ color: statusFilter === opt.value ? theme.primary : theme.colors.text, fontSize: 13 }}>
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={theme.primary} style={{ marginTop: 32 }} />
      ) : error ? (
        <Text style={[styles.error, { padding: 16 }]}>{error}</Text>
      ) : debts.length === 0 ? (
        <View style={{ padding: 16 }}>
          <EmptyState
            message="No debts found."
            actionLabel="Add your first debt"
            onAction={() => router.push('/(app)/debts/new' as Href)}
          />
        </View>
      ) : (
        <FlatList
          data={debts}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                void fetchDebts();
              }}
              tintColor={theme.primary}
            />
          }
          ListFooterComponent={
            pagination && pagination.totalPages > 1 ? (
              <View style={styles.pagination}>
                <Pressable
                  onPress={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={page === 1}
                  style={[styles.pageBtn, { borderColor: theme.border, opacity: page === 1 ? 0.4 : 1 }]}>
                  <Text style={{ color: theme.colors.text }}>Previous</Text>
                </Pressable>
                <Text style={{ color: theme.muted, fontSize: 13 }}>
                  Page {page} of {pagination.totalPages}
                </Text>
                <Pressable
                  onPress={() => setPage((value) => Math.min(pagination.totalPages, value + 1))}
                  disabled={page === pagination.totalPages}
                  style={[
                    styles.pageBtn,
                    { borderColor: theme.border, opacity: page === pagination.totalPages ? 0.4 : 1 },
                  ]}>
                  <Text style={{ color: theme.colors.text }}>Next</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title="Delete debt"
        message="This debt will be permanently deleted. This cannot be undone."
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
