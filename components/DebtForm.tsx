import ConfirmDialog from '@/components/ConfirmDialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  createDebt,
  deleteDebt,
  updateDebt,
  type Debt,
  type DebtStatus,
  type DebtType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { DEBT_COLORS, DEBT_STATUS_LABEL, DEBT_TYPE_LABEL } from '@/lib/format';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import {
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

const TYPES: DebtType[] = ['TAKEN', 'GIVEN'];
const STATUSES: DebtStatus[] = ['ACTIVE', 'SETTLED'];

type Props = {
  debt?: Debt;
};

export default function DebtForm({ debt }: Props) {
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [type, setType] = useState<DebtType>(debt?.type ?? 'TAKEN');
  const [partyName, setPartyName] = useState(debt?.partyName ?? '');
  const [amount, setAmount] = useState(debt ? String(debt.amount) : '');
  const [description, setDescription] = useState(debt?.description ?? '');
  const [date, setDate] = useState(debt ? new Date(debt.date) : new Date());
  const [status, setStatus] = useState<DebtStatus>(debt?.status ?? 'ACTIVE');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!accessToken) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!partyName.trim()) {
      setError('Please enter a party name');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const isoDate = date.toISOString();

    try {
      if (debt) {
        await updateDebt(
          debt.id,
          {
            type,
            partyName: partyName.trim(),
            amount: parsedAmount,
            description: description.trim() || null,
            date: isoDate,
            status,
          },
          accessToken,
        );
      } else {
        await createDebt(
          {
            type,
            partyName: partyName.trim(),
            amount: parsedAmount,
            description: description.trim() || undefined,
            date: isoDate,
          },
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
    if (!accessToken || !debt) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteDebt(debt.id, accessToken);
      router.replace('/(app)/(tabs)/debts' as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete debt');
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
          {TYPES.map((item) => {
            const colors = DEBT_COLORS[item];
            const selected = type === item;
            return (
              <Pressable
                key={item}
                onPress={() => setType(item)}
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
                  {DEBT_TYPE_LABEL[item]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.label, { color: theme.colors.text }]}>
          {type === 'TAKEN' ? 'Lender Name' : 'Borrower Name'}
        </Text>
        <TextInput
          value={partyName}
          onChangeText={setPartyName}
          maxLength={200}
          placeholder="Person or Bank name"
          placeholderTextColor={theme.muted}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text }]}
        />

        <Text style={[styles.label, { color: theme.colors.text }]}>Amount</Text>
        <View style={[styles.inputWrap, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.muted, marginRight: 4 }}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={theme.muted}
            style={[styles.amountInput, { color: theme.colors.text }]}
          />
        </View>

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

        {debt ? (
          <>
            <Text style={[styles.label, { color: theme.colors.text }]}>Status</Text>
            <View style={styles.typeGrid}>
              {STATUSES.map((item) => {
                const selected = status === item;
                return (
                  <Pressable
                    key={item}
                    onPress={() => setStatus(item)}
                    style={[
                      styles.typeButton,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? `${theme.primary}15` : theme.card,
                      },
                    ]}>
                    <Text
                      style={{
                        color: selected ? theme.primary : theme.muted,
                        fontWeight: '600',
                        fontSize: 13,
                      }}>
                      {DEBT_STATUS_LABEL[item]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        <Text style={[styles.label, { color: theme.colors.text }]}>
          Description <Text style={{ color: theme.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <TextInput
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={3}
          maxLength={500}
          placeholder="Add details about this debt..."
          placeholderTextColor={theme.muted}
          style={[
            styles.textarea,
            { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text },
          ]}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

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
              {isSubmitting ? 'Saving…' : debt ? 'Update' : 'Add Debt'}
            </Text>
          </Pressable>
        </View>

        {debt ? (
          <Pressable
            onPress={() => setConfirmOpen(true)}
            disabled={isDeleting || isSubmitting}
            style={[styles.deleteButton, { borderColor: theme.danger, opacity: isDeleting ? 0.6 : 1 }]}>
            <Text style={{ color: theme.danger, fontWeight: '600' }}>
              {isDeleting ? 'Deleting…' : 'Delete debt'}
            </Text>
          </Pressable>
        ) : null}

        <ConfirmDialog
          visible={confirmOpen}
          title="Delete debt"
          message="This debt will be permanently deleted. This cannot be undone."
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
    gap: 8,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  amountInput: {
    flex: 1,
    fontSize: 16,
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
