import ConfirmDialog from '@/components/ConfirmDialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  createTransaction,
  deleteTransaction,
  listCategories,
  updateTransaction,
  type Category,
  type CategoryType,
  type Transaction,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const TYPES: CategoryType[] = ['EXPENSE', 'INCOME', 'SAVING', 'INVESTMENT'];

type Props = {
  transaction?: Transaction;
  initialType?: CategoryType;
  initialDate?: Date;
};

export default function TransactionForm({ transaction, initialType, initialDate }: Props) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [type, setType] = useState<CategoryType>(transaction?.type ?? initialType ?? 'EXPENSE');
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [note, setNote] = useState(transaction?.note ?? '');
  const [date, setDate] = useState(
    transaction ? new Date(transaction.date) : initialDate ?? new Date(),
  );
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCats, setIsLoadingCats] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    void (async () => {
      setIsLoadingCats(true);
      try {
        const cats = await listCategories(accessToken);
        setCategories(cats);
      } catch {
        setCategories([]);
      } finally {
        setIsLoadingCats(false);
      }
    })();
  }, [accessToken]);

  const filteredCategories = categories.filter((c) => c.type === type);
  const categoryIdForType = filteredCategories.some((c) => c.id === categoryId) ? categoryId : '';

  async function handleSubmit() {
    if (!accessToken) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!categoryIdForType) {
      setError('Please select a category');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const isoDate = date.toISOString();

    try {
      if (transaction) {
        await updateTransaction(
          transaction.id,
          { amount: parsedAmount, note: note.trim() || null, categoryId: categoryIdForType, date: isoDate },
          accessToken,
        );
      } else {
        await createTransaction(
          { amount: parsedAmount, note: note.trim() || undefined, categoryId: categoryIdForType, date: isoDate },
          accessToken,
        );
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!accessToken || !transaction) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteTransaction(transaction.id, accessToken);
      router.replace('/(app)/(tabs)/transactions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete transaction');
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  }

  function openDatePicker() {
    if (Platform.OS === 'android') {
      setPickerMode('date');
    }
    setShowDatePicker(true);
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        setPickerMode('date');
        return;
      }

      if (event.type !== 'set' || !selectedDate) {
        return;
      }

      if (pickerMode === 'date') {
        setDate((current) => {
          const next = new Date(current);
          next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
          return next;
        });
        setShowDatePicker(false);
        setTimeout(() => {
          setPickerMode('time');
          setShowDatePicker(true);
        }, 0);
        return;
      }

      setDate((current) => {
        const next = new Date(current);
        next.setHours(selectedDate.getHours(), selectedDate.getMinutes(), 0, 0);
        return next;
      });
      setShowDatePicker(false);
      setPickerMode('date');
      return;
    }

    if (selectedDate) {
      setDate(selectedDate);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.colors.text }]}>Type</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => {
            const colors = TYPE_COLORS[t];
            const selected = type === t;
            return (
              <Pressable
                key={t}
                onPress={() => setType(t)}
                style={[
                  styles.typeButton,
                  {
                    borderColor: selected ? colors.text : theme.border,
                    backgroundColor: selected
                      ? theme.isDark
                        ? `${colors.text}22`
                        : colors.bg
                      : theme.card,
                  },
                ]}>
                <Text
                  style={{
                    color: selected ? (theme.isDark ? colors.darkText : colors.text) : theme.muted,
                    fontWeight: '600',
                    fontSize: 13,
                  }}>
                  {TYPE_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.colors.text }]}>Amount</Text>
        <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.muted, marginRight: 4 }}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.colors.text }]}
          />
        </View>

        <Text style={[styles.label, { color: theme.colors.text }]}>Category</Text>
        {isLoadingCats ? (
          <ActivityIndicator color={theme.primary} />
        ) : filteredCategories.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 14 }}>
            No {type.toLowerCase()} categories found. Create one in Categories tab.
          </Text>
        ) : (
          <View style={styles.categoryList}>
            {filteredCategories.map((cat) => (
              <Pressable
                key={cat.id}
                onPress={() => setCategoryId(cat.id)}
                style={[
                  styles.categoryChip,
                  {
                    borderColor: categoryIdForType === cat.id ? theme.primary : theme.border,
                    backgroundColor:
                      categoryIdForType === cat.id ? `${theme.primary}15` : theme.card,
                  },
                ]}>
                <Text
                  style={{
                    color: categoryIdForType === cat.id ? theme.primary : theme.colors.text,
                    fontWeight: '500',
                  }}>
                  {cat.name}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.label, { color: theme.colors.text }]}>Date & Time</Text>
        <Pressable
          onPress={openDatePicker}
          style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.colors.text }}>
            {date.toLocaleString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Pressable>
        {Platform.OS === 'ios' && showDatePicker && (
          <Modal transparent animationType="slide" visible={showDatePicker}>
            <View style={styles.pickerOverlay}>
              <View style={[styles.pickerSheet, { backgroundColor: theme.card }]}>
                <View style={styles.pickerHeader}>
                  <Pressable onPress={() => setShowDatePicker(false)}>
                    <Text style={{ color: theme.primary, fontWeight: '600' }}>Done</Text>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={date}
                  mode="datetime"
                  display="spinner"
                  onChange={handleDateChange}
                />
              </View>
            </View>
          </Modal>
        )}
        {Platform.OS === 'android' && showDatePicker && (
          <DateTimePicker
            value={date}
            mode={pickerMode}
            display="default"
            onChange={handleDateChange}
          />
        )}

        <Text style={[styles.label, { color: theme.colors.text }]}>
          Note <Text style={{ color: theme.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          numberOfLines={3}
          maxLength={500}
          placeholder="Add a description…"
          placeholderTextColor={theme.muted}
          style={[
            styles.textarea,
            { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text },
          ]}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <View style={styles.actions}>
          <Pressable
            onPress={() => router.back()}
            style={[styles.button, { borderColor: theme.border, borderWidth: 1, flex: 1 }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isSubmitting || isDeleting}
            style={[styles.button, { backgroundColor: theme.primary, flex: 1, opacity: isSubmitting ? 0.6 : 1 }]}>
            <Text style={styles.buttonText}>
              {isSubmitting ? 'Saving…' : transaction ? 'Update' : 'Add Transaction'}
            </Text>
          </Pressable>
        </View>

        {transaction && (
          <Pressable
            onPress={() => setConfirmOpen(true)}
            disabled={isDeleting || isSubmitting}
            style={[styles.deleteButton, { borderColor: theme.danger, opacity: isDeleting ? 0.6 : 1 }]}>
            <Text style={{ color: theme.danger, fontWeight: '600' }}>
              {isDeleting ? 'Deleting…' : 'Delete transaction'}
            </Text>
          </Pressable>
        )}

        <ConfirmDialog
          visible={confirmOpen}
          title="Delete transaction"
          message="This transaction will be permanently deleted. This cannot be undone."
          confirmLabel="Delete"
          isConfirming={isDeleting}
          onConfirm={() => void handleDelete()}
          onCancel={() => {
            if (!isDeleting) setConfirmOpen(false);
          }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    paddingBottom: 40,
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 6,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
  },
  categoryList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  textarea: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  button: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  deleteButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  pickerHeader: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e4e4e7',
  },
});
