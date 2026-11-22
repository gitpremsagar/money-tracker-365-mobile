import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  type AssistantConfirmItem,
  type AssistantProposal,
  type Category,
  type CategoryType,
} from '@/lib/api';
import { TYPE_COLORS, TYPE_LABEL, formatCurrency } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import CategoryPickerModal from './CategoryPickerModal';

export default function ProposalEditor({
  proposal,
  categories,
  disabled,
  onSave,
}: {
  proposal: AssistantProposal;
  categories: Category[];
  disabled?: boolean;
  onSave: (item: AssistantConfirmItem) => Promise<void>;
}) {
  const theme = useThemeColors();
  const [amount, setAmount] = useState(String(proposal.amount));
  const [date, setDate] = useState(proposal.date);
  const [note, setNote] = useState(proposal.note);
  const [categoryId, setCategoryId] = useState(proposal.categoryId ?? '');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(proposal.suggestedCategoryName ?? '');
  const [newType, setNewType] = useState<CategoryType>(proposal.type);
  const [saving, setSaving] = useState(false);
  const [discarded, setDiscarded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const category = categories.find((item) => item.id === categoryId);
  const type = category?.type ?? newType;
  const suggestionMatch = useMemo(
    () =>
      proposal.suggestedCategoryName
        ? categories.find(
            (item) => item.name.toLowerCase() === proposal.suggestedCategoryName?.toLowerCase(),
          )
        : undefined,
    [categories, proposal.suggestedCategoryName],
  );

  if (discarded) return null;

  async function save() {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (!date) {
      setError('Choose a date.');
      return;
    }
    if (!categoryId && !creating) {
      setError('Choose a category.');
      return;
    }
    if (creating && !newName.trim()) {
      setError('Give the new category a name.');
      return;
    }

    setError(null);
    setSaving(true);
    try {
      await onSave({
        kind: 'CREATE',
        amount: value,
        ...(categoryId ? { categoryId } : {}),
        ...(creating ? { newCategoryName: newName.trim(), newCategoryType: newType } : {}),
        date,
        note: note.trim(),
        source: proposal.source,
        proposalId: proposal.proposalId,
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Could not save that transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <View style={styles.topRow}>
        <View style={[styles.badge, { backgroundColor: TYPE_COLORS[type].bg }]}>
          <Text style={[styles.badgeText, { color: TYPE_COLORS[type].text }]}>{TYPE_LABEL[type]}</Text>
        </View>
        <Text style={{ color: theme.muted, fontSize: 11 }}>
          {Math.round(proposal.confidence * 100)}% confidence
        </Text>
      </View>

      <View style={styles.grid}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.muted }]}>Amount (₹)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            editable={!saving && !disabled}
            style={[styles.input, { borderColor: theme.border, color: theme.colors.text }]}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: theme.muted }]}>Date</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="YYYY-MM-DD"
            editable={!saving && !disabled}
            style={[styles.input, { borderColor: theme.border, color: theme.colors.text }]}
          />
        </View>
      </View>

      <Text style={[styles.label, { color: theme.muted }]}>Category</Text>
      <Pressable
        onPress={() => setPickerOpen(true)}
        disabled={saving || disabled}
        style={[styles.select, { borderColor: theme.border }]}>
        <View style={[styles.dot, { backgroundColor: category ? TYPE_COLORS[type].text : theme.muted }]} />
        <Text style={{ flex: 1, color: theme.colors.text, fontSize: 14 }}>
          {creating ? 'New category' : category?.name ?? 'Choose a category…'}
        </Text>
        <Ionicons name="chevron-down" size={16} color={theme.muted} />
      </Pressable>

      {!categoryId && proposal.suggestedCategoryName && !creating && (
        <View style={styles.suggestion}>
          <Text style={{ flex: 1, color: '#92400e', fontSize: 12 }}>
            Suggested: {proposal.suggestedCategoryName}
          </Text>
          <Pressable
            onPress={() => {
              if (suggestionMatch) setCategoryId(suggestionMatch.id);
              else {
                setCreating(true);
                setNewName(proposal.suggestedCategoryName ?? '');
              }
            }}>
            <Text style={{ color: '#92400e', fontWeight: '700', fontSize: 12 }}>
              {suggestionMatch ? 'Use it' : 'Create it'}
            </Text>
          </Pressable>
        </View>
      )}

      <Pressable
        onPress={() => {
          setCreating(true);
          setCategoryId('');
        }}>
        <Text style={[styles.link, { color: theme.primary }]}>+ Create a new category</Text>
      </Pressable>

      {creating && (
        <View style={{ gap: 8 }}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="New category name"
            editable={!saving && !disabled}
            style={[styles.input, { borderColor: theme.border, color: theme.colors.text }]}
          />
          <View style={styles.typeRow}>
            {(['EXPENSE', 'INCOME', 'SAVING', 'INVESTMENT'] as const).map((option) => (
              <Pressable
                key={option}
                onPress={() => setNewType(option)}
                style={[
                  styles.typeChip,
                  {
                    borderColor: newType === option ? theme.primary : theme.border,
                    backgroundColor: newType === option ? `${theme.primary}15` : 'transparent',
                  },
                ]}>
                <Text
                  style={{
                    color: newType === option ? theme.primary : theme.muted,
                    fontSize: 11,
                    fontWeight: '600',
                  }}>
                  {TYPE_LABEL[option]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <Text style={[styles.label, { color: theme.muted }]}>Note</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What was this for?"
        maxLength={500}
        editable={!saving && !disabled}
        style={[styles.input, { borderColor: theme.border, color: theme.colors.text }]}
      />

      {error && <Text style={{ color: theme.danger, fontSize: 12 }}>{error}</Text>}

      <View style={styles.footer}>
        <Pressable onPress={() => setDiscarded(true)} disabled={saving}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>Discard</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Text style={{ color: theme.muted, fontSize: 12 }}>{formatCurrency(Number(amount) || 0)}</Text>
          <Pressable
            onPress={() => void save()}
            disabled={saving || disabled}
            style={[styles.saveButton, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </View>

      <CategoryPickerModal
        visible={pickerOpen}
        categories={categories}
        onClose={() => setPickerOpen(false)}
        onSelect={(selected) => {
          setCreating(false);
          setCategoryId(selected.id);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8, marginTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  grid: { flexDirection: 'row', gap: 8 },
  label: { fontSize: 11, marginBottom: 2 },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  select: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 8,
  },
  link: { fontSize: 12, fontWeight: '600' },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  saveButton: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 7 },
});
