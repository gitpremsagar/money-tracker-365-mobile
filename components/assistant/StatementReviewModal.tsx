import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  commitStatementImport,
  discardStatementImport,
  getStatementImport,
  type AssistantImportRow,
  type AssistantImportSummary,
  type Category,
} from '@/lib/api';
import { TYPE_COLORS, formatCurrency, formatDateOnly } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import CategoryPickerModal from './CategoryPickerModal';

type EditableRow = AssistantImportRow & {
  include: boolean;
  selectedCategoryId: string | null;
};

function defaultCategoryId(row: AssistantImportRow, categories: Category[]): string | null {
  if (row.categoryId) return row.categoryId;
  if (row.suggestedCategoryName) {
    const match = categories.find(
      (category) => category.name.toLowerCase() === row.suggestedCategoryName?.toLowerCase(),
    );
    if (match) return match.id;
  }
  return categories.find((category) => category.type === row.type)?.id ?? null;
}

export default function StatementReviewModal({
  visible,
  initialImport,
  categories,
  accessToken,
  onClose,
  onCommitted,
}: {
  visible: boolean;
  initialImport: AssistantImportSummary | null;
  categories: Category[];
  accessToken: string;
  onClose: () => void;
  onCommitted: (result: { batchId: string; imported: number; undoUntil: string }) => void;
}) {
  const theme = useThemeColors();
  const [summary, setSummary] = useState<AssistantImportSummary | null>(initialImport);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'review' | 'duplicates'>('all');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [rowTarget, setRowTarget] = useState<string | null>(null);

  useEffect(() => {
    setSummary(initialImport);
    setRows([]);
    setError(null);
    setFilter('all');
  }, [initialImport]);

  const loadAllRows = useCallback(
    async (importId: string) => {
      setLoading(true);
      try {
        const first = await getStatementImport(importId, accessToken, { page: 1, limit: 100 });
        const all = [...first.rows];
        for (let page = 2; page <= first.pagination.totalPages; page += 1) {
          const next = await getStatementImport(importId, accessToken, { page, limit: 100 });
          all.push(...next.rows);
        }

        setSummary(first.import);
        setRows(
          all.map((row) => ({
            ...row,
            include: row.status !== 'DUPLICATE' && row.confidence >= 0.6,
            selectedCategoryId: defaultCategoryId(row, categories),
          })),
        );
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load the statement rows.');
      } finally {
        setLoading(false);
      }
    },
    [accessToken, categories],
  );

  useEffect(() => {
    if (!visible || !summary || summary.status !== 'PROCESSING') return;
    const timer = setInterval(async () => {
      try {
        const detail = await getStatementImport(summary.id, accessToken, { page: 1, limit: 1 });
        setSummary(detail.import);
        if (detail.import.status === 'READY') {
          await loadAllRows(detail.import.id);
        }
      } catch (pollError) {
        setError(pollError instanceof Error ? pollError.message : 'Could not check the import.');
      }
    }, 1_500);
    return () => clearInterval(timer);
  }, [visible, summary, accessToken, loadAllRows]);

  useEffect(() => {
    if (
      visible &&
      summary?.status === 'READY' &&
      rows.length === 0 &&
      !loading
    ) {
      void loadAllRows(summary.id);
    }
  }, [visible, summary, rows.length, loading, loadAllRows]);

  const selected = rows.filter((row) => row.include);

  const visibleRows = useMemo(() => {
    if (filter === 'review') {
      return rows.filter(
        (row) =>
          row.status !== 'DUPLICATE' &&
          (row.confidence < 0.6 || !row.selectedCategoryId),
      );
    }
    if (filter === 'duplicates') return rows.filter((row) => row.status === 'DUPLICATE');
    return rows;
  }, [rows, filter]);

  function toggleRow(rowId: string) {
    setRows((current) =>
      current.map((row) => (row.id === rowId ? { ...row, include: !row.include } : row)) as EditableRow[],
    );
  }

  function selectAll() {
    setRows((current) =>
      current.map((row) => ({
        ...row,
        include: row.status !== 'DUPLICATE' && row.confidence >= 0.6,
      })),
    );
  }

  function applyCategory(category: Category) {
    setRows((current) =>
      current.map((row) =>
        bulkMode
          ? { ...row, selectedCategoryId: category.id }
          : row,
      ),
    );
    setBulkMode(false);
  }

  function handleCategorySelected(category: Category) {
    if (!bulkMode && rowTarget) {
      setRows((current) =>
        current.map((row) =>
          row.id === rowTarget ? { ...row, selectedCategoryId: category.id } : row,
        ),
      );
    } else {
      applyCategory(category);
    }
    setRowTarget(null);
  }

  async function commit() {
    if (!summary) return;
    const missing = selected.find((row) => !row.selectedCategoryId);
    if (missing) {
      Alert.alert('Choose a category', `Pick a category for "${missing.description || 'that row'}" first.`);
      return;
    }
    if (selected.length === 0) {
      Alert.alert('Nothing selected', 'Select at least one transaction to import.');
      return;
    }

    setCommitting(true);
    setError(null);
    try {
      const result = await commitStatementImport(
        summary.id,
        {
          clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          rows: rows.map((row) => ({
            rowId: row.id,
            include: row.include,
            amount: row.amount,
            categoryId: row.selectedCategoryId,
            date: row.date.slice(0, 10),
            note: row.description ?? '',
          })),
        },
        accessToken,
      );
      onCommitted(result);
      onClose();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : 'Could not import the statement.');
    } finally {
      setCommitting(false);
    }
  }

  async function discard() {
    if (!summary) return;
    try {
      await discardStatementImport(summary.id, accessToken);
    } catch {
      // Already gone is fine.
    }
    onClose();
  }

  function close() {
    if (summary?.status === 'PROCESSING') {
      Alert.alert('Still reading', 'Please wait for the statement to finish. It will be ready to review shortly.');
      return;
    }
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <Pressable onPress={close} hitSlop={8}>
            <Ionicons name="close" size={24} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Review import</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }} numberOfLines={1}>
              {summary?.filename ?? 'Bank statement'}
            </Text>
          </View>
        </View>

        {!summary || summary.status === 'PROCESSING' ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={{ color: theme.muted, marginTop: 12 }}>Reading your statement…</Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
              Scanned PDFs can take a little while. Keep this open.
            </Text>
          </View>
        ) : summary.status === 'FAILED' ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={40} color={theme.danger} />
            <Text style={{ color: theme.danger, fontWeight: '700', marginTop: 10 }}>
              That statement could not be read
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
              {summary.error ?? 'Try a CSV export or a clearer PDF.'}
            </Text>
            <Pressable onPress={() => void discard()} style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
              <Text style={styles.primaryButtonText}>Close</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={[styles.summaryBar, { borderBottomColor: theme.border }]}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {summary.rowCount} rows · {summary.duplicateCount} duplicates
              </Text>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(['all', 'review', 'duplicates'] as const).map((value) => (
                  <Pressable
                    key={value}
                    onPress={() => setFilter(value)}
                    style={[
                      styles.filterChip,
                      {
                        borderColor: filter === value ? theme.primary : theme.border,
                        backgroundColor: filter === value ? `${theme.primary}15` : 'transparent',
                      },
                    ]}>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: '600',
                        color: filter === value ? theme.primary : theme.muted,
                      }}>
                      {value === 'all' ? 'All' : value === 'review' ? 'Review' : 'Duplicates'}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={[styles.actionBar, { borderBottomColor: theme.border }]}>
              <Pressable onPress={selectAll}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                  Select non-duplicates
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setRowTarget(null);
                  setBulkMode(true);
                  setPickerOpen(true);
                }}>
                <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600' }}>
                  Category for selected
                </Text>
              </Pressable>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={theme.primary} />
                <Text style={{ color: theme.muted, marginTop: 8 }}>Loading rows…</Text>
              </View>
            ) : (
              <FlatList
                data={visibleRows}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ paddingBottom: 120 }}
                renderItem={({ item }) => {
                  const category = categories.find((entry) => entry.id === item.selectedCategoryId);
                  return (
                    <Pressable
                      onPress={() => toggleRow(item.id)}
                      style={[
                        styles.row,
                        {
                          borderBottomColor: theme.border,
                          backgroundColor:
                            item.status === 'DUPLICATE' ? '#fef2f2' : 'transparent',
                        },
                      ]}>
                      <Ionicons
                        name={item.include ? 'checkbox' : 'square-outline'}
                        size={22}
                        color={item.include ? theme.primary : theme.muted}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                          {item.description || 'Bank transaction'}
                        </Text>
                        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                          {formatDateOnly(item.date)} · {item.status === 'DUPLICATE' ? 'Possible duplicate' : `${Math.round(item.confidence * 100)}% confidence`}
                        </Text>
                        <Pressable
                          onPress={() => {
                            setRowTarget(item.id);
                            setBulkMode(false);
                            setPickerOpen(true);
                          }}
                          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                          <View
                            style={{
                              width: 7,
                              height: 7,
                              borderRadius: 4,
                              backgroundColor: category ? TYPE_COLORS[category.type].text : theme.muted,
                            }}
                          />
                          <Text style={{ color: category ? theme.primary : theme.danger, fontSize: 11 }}>
                            {category?.name ?? 'Choose category'}
                          </Text>
                        </Pressable>
                      </View>
                      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '700' }}>
                        {formatCurrency(item.amount, 0)}
                      </Text>
                    </Pressable>
                  );
                }}
                ListEmptyComponent={
                  <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
                    Nothing in this view.
                  </Text>
                }
              />
            )}

            {error && (
              <Text style={{ color: theme.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 }}>
                {error}
              </Text>
            )}

            <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>
                {selected.length} of {rows.length} selected
              </Text>
              <Pressable
                onPress={() => void commit()}
                disabled={committing || selected.length === 0}
                style={[
                  styles.primaryButton,
                  { backgroundColor: theme.primary, opacity: committing || selected.length === 0 ? 0.5 : 1 },
                ]}>
                <Text style={styles.primaryButtonText}>
                  {committing ? 'Importing…' : `Import ${selected.length}`}
                </Text>
              </Pressable>
            </View>
          </>
        )}

        <CategoryPickerModal
          visible={pickerOpen}
          categories={categories}
          title={bulkMode ? 'Category for selected rows' : 'Choose a category'}
          onClose={() => {
            setPickerOpen(false);
            setRowTarget(null);
            setBulkMode(false);
          }}
          onSelect={handleCategorySelected}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 18, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  actionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  primaryButton: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10, marginTop: 14 },
  primaryButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
