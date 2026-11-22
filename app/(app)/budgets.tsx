import MonthPicker from '@/components/MonthPicker';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  deleteBudget,
  listBudgets,
  listCategories,
  upsertBudget,
  type BudgetItem,
  type BudgetsResult,
  type Category,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { currentMonth, formatCurrency } from '@/lib/format';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function progressColor(percentage: number, primary: string) {
  if (percentage >= 100) return '#ef4444';
  if (percentage >= 80) return '#f59e0b';
  return primary;
}

export default function BudgetsScreen() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<BudgetsResult | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [totalInput, setTotalInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [editing, setEditing] = useState<BudgetItem | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    if (!accessToken) return;
    setIsLoading(true);
    try {
      const [budgets, cats] = await Promise.all([
        listBudgets(month, accessToken),
        listCategories(accessToken, 'EXPENSE'),
      ]);
      setData(budgets);
      setCategories(cats);
      setTotalInput(budgets.summary.totalBudget ? String(budgets.summary.totalBudget) : '');
    } catch (error) {
      Alert.alert('Could not load budgets', error instanceof Error ? error.message : 'Try again');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, month]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveTotal() {
    if (!accessToken) return;
    const amount = Number(totalInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a monthly budget greater than zero.');
      return;
    }
    setIsSaving(true);
    try {
      await upsertBudget({ month, scope: 'TOTAL', amount }, accessToken);
      await load();
    } catch (error) {
      Alert.alert('Could not save budget', error instanceof Error ? error.message : 'Try again');
    } finally {
      setIsSaving(false);
    }
  }

  async function saveCategory() {
    if (!accessToken || !selectedCategory) {
      Alert.alert('Choose a category', 'Pick an expense category first.');
      return;
    }
    const amount = Number(amountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a budget greater than zero.');
      return;
    }
    setIsSaving(true);
    try {
      await upsertBudget({ month, scope: selectedCategory, amount }, accessToken);
      setSelectedCategory('');
      setAmountInput('');
      setEditing(null);
      await load();
    } catch (error) {
      Alert.alert('Could not save budget', error instanceof Error ? error.message : 'Try again');
    } finally {
      setIsSaving(false);
    }
  }

  function remove(item: BudgetItem) {
    Alert.alert('Remove budget?', `Remove the ${item.categoryName} budget for this month?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          if (!accessToken) return;
          void deleteBudget(item.id, accessToken)
            .then(load)
            .catch((error) =>
              Alert.alert(
                'Could not remove budget',
                error instanceof Error ? error.message : 'Try again',
              ),
            );
        },
      },
    ]);
  }

  function startEdit(item: BudgetItem) {
    setEditing(item);
    setSelectedCategory(item.scope);
    setAmountInput(String(item.amount));
  }

  const budgeted = new Set((data?.budgets ?? []).map((budget) => budget.scope));
  const available = categories.filter((category) => !budgeted.has(category.id));
  const summary = data?.summary;
  const percentage = summary?.percentage ?? 0;
  const totalWidth = `${Math.min(100, Math.max(0, percentage))}%` as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={styles.container}>
      <MonthPicker
        month={month}
        onChange={setMonth}
        disableFuture
      />

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      ) : (
        <>
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardTitle, { color: theme.colors.text }]}>Monthly budget</Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
                  {summary?.totalBudget != null
                    ? `${formatCurrency(summary.totalSpent)} of ${formatCurrency(summary.totalBudget)}`
                    : 'No limit set yet'}
                </Text>
              </View>
              {summary?.totalBudget != null ? (
                <Text
                  style={{
                    color: summary.overBudget ? theme.danger : theme.primary,
                    fontSize: 13,
                    fontWeight: '700',
                  }}>
                  {summary.percentage}%
                </Text>
              ) : null}
            </View>

            {summary?.totalBudget != null ? (
              <>
                <Text
                  style={{
                    color: summary.overBudget ? theme.danger : theme.colors.text,
                    fontSize: 26,
                    fontWeight: '700',
                    marginTop: 12,
                  }}>
                  {summary.overBudget
                    ? `${formatCurrency(Math.abs(summary.remaining ?? 0))} over`
                    : `${formatCurrency(summary.remaining ?? 0)} left`}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
                  <View
                    style={{
                      width: totalWidth,
                      height: '100%',
                      borderRadius: 999,
                      backgroundColor: progressColor(percentage, theme.primary),
                    }}
                  />
                </View>
              </>
            ) : null}

            <View style={styles.inlineForm}>
              <TextInput
                value={totalInput}
                onChangeText={setTotalInput}
                keyboardType="decimal-pad"
                placeholder="e.g. 30000"
                placeholderTextColor={theme.muted}
                style={[styles.input, { color: theme.colors.text, borderColor: theme.border }]}
              />
              <Pressable
                onPress={() => void saveTotal()}
                disabled={isSaving}
                style={[styles.saveButton, { backgroundColor: theme.primary, opacity: isSaving ? 0.6 : 1 }]}>
                <Text style={styles.saveButtonText}>
                  {summary?.totalBudget != null ? 'Update' : 'Set budget'}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>Category budgets</Text>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{data?.budgets.length ?? 0}</Text>
          </View>

          {data?.budgets.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={{ color: theme.muted, fontSize: 13 }}>No category budgets yet.</Text>
            </View>
          ) : (
            data?.budgets.map((item) => {
              const width = `${Math.min(100, Math.max(0, item.percentage))}%` as const;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => startEdit(item)}
                  style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.rowBetween}>
                    <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>
                      {item.categoryName}
                    </Text>
                    <Text
                      style={{
                        color: item.overBudget ? theme.danger : theme.colors.text,
                        fontSize: 13,
                        fontWeight: '600',
                      }}>
                      {item.overBudget
                        ? `${formatCurrency(Math.abs(item.remaining))} over`
                        : `${formatCurrency(item.remaining)} left`}
                    </Text>
                  </View>
                  <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                    {formatCurrency(item.spent)} spent of {formatCurrency(item.amount)}
                  </Text>
                  <View style={[styles.barTrack, { backgroundColor: theme.isDark ? '#27272a' : '#f4f4f5' }]}>
                    <View
                      style={{
                        width,
                        height: '100%',
                        borderRadius: 999,
                        backgroundColor: progressColor(item.percentage, theme.primary),
                      }}
                    />
                  </View>
                  <View style={styles.rowBetween}>
                    <Text style={{ color: theme.primary, fontSize: 11, fontWeight: '600' }}>Tap to edit</Text>
                    <Pressable onPress={() => remove(item)} hitSlop={8}>
                      <Text style={{ color: theme.muted, fontSize: 11 }}>Remove</Text>
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}

          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.cardTitle, { color: theme.colors.text }]}>
              {editing ? `Edit ${editing.categoryName}` : 'Add a category budget'}
            </Text>

            {!editing && (
              <View style={styles.chips}>
                {available.map((category) => {
                  const selected = selectedCategory === category.id;
                  return (
                    <Pressable
                      key={category.id}
                      onPress={() => setSelectedCategory(category.id)}
                      style={[
                        styles.chip,
                        {
                          borderColor: selected ? theme.primary : theme.border,
                          backgroundColor: selected ? `${theme.primary}15` : 'transparent',
                        },
                      ]}>
                      <Text style={{ color: selected ? theme.primary : theme.muted, fontSize: 12 }}>
                        {category.name}
                      </Text>
                    </Pressable>
                  );
                })}
                {available.length === 0 ? (
                  <Text style={{ color: theme.muted, fontSize: 12 }}>
                    Every expense category already has a budget.
                  </Text>
                ) : null}
              </View>
            )}

            <View style={styles.inlineForm}>
              <TextInput
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="decimal-pad"
                placeholder="Amount"
                placeholderTextColor={theme.muted}
                style={[styles.input, { color: theme.colors.text, borderColor: theme.border }]}
              />
              <Pressable
                onPress={() => void saveCategory()}
                disabled={isSaving}
                style={[
                  styles.saveButton,
                  { borderColor: theme.primary, backgroundColor: 'transparent', opacity: isSaving ? 0.6 : 1 },
                ]}>
                <Text style={[styles.saveButtonText, { color: theme.primary }]}>
                  {editing ? 'Update' : 'Add budget'}
                </Text>
              </Pressable>
            </View>

            {editing ? (
              <Pressable
                onPress={() => {
                  setEditing(null);
                  setSelectedCategory('');
                  setAmountInput('');
                }}>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 8 }}>Cancel edit</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32, gap: 12 },
  center: { paddingVertical: 40, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 14, padding: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '700' },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 20, alignItems: 'center' },
  barTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 10, marginBottom: 8 },
  inlineForm: { flexDirection: 'row', gap: 8, marginTop: 12 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
  },
  saveButton: { borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  saveButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
