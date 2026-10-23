import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  addDebtPayment,
  updateDebtPayment,
  type Debt,
  type DebtPayment,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDate } from '@/lib/format';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

export function paymentLabels(debt: Debt) {
  return debt.type === 'TAKEN'
    ? { verb: 'Paid', add: 'Record payment', edit: 'Edit payment' }
    : { verb: 'Received', add: 'Record amount received', edit: 'Edit amount received' };
}

type FormProps = {
  debt: Debt;
  payment?: DebtPayment;
  onSaved: (debt: Debt) => void;
  onCancel: () => void;
};

export default function DebtPaymentForm({ debt, payment, onSaved, onCancel }: FormProps) {
  const { accessToken } = useAuth();
  const theme = useThemeColors();
  const maxAmount = Math.round((debt.outstanding + (payment?.amount ?? 0)) * 100) / 100;

  const [amount, setAmount] = useState(String(payment ? payment.amount : maxAmount));
  const [date, setDate] = useState(payment ? new Date(payment.date) : new Date());
  const [note, setNote] = useState(payment?.note ?? '');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerMode, setPickerMode] = useState<'date' | 'time'>('date');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!accessToken) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (parsedAmount > maxAmount + 0.005) {
      setError(`Amount cannot exceed ${formatCurrency(maxAmount)}`);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    const isoDate = date.toISOString();

    try {
      const updated = payment
        ? await updateDebtPayment(
            debt.id,
            payment.id,
            { amount: parsedAmount, date: isoDate, note: note.trim() || null },
            accessToken,
          )
        : await addDebtPayment(
            debt.id,
            { amount: parsedAmount, date: isoDate, note: note.trim() || undefined },
            accessToken,
          );
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  function openDatePicker() {
    if (Platform.OS === 'android') setPickerMode('date');
    setShowDatePicker(true);
  }

  function handleDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    if (Platform.OS === 'android') {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        setPickerMode('date');
        return;
      }
      if (event.type !== 'set' || !selectedDate) return;

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

    if (selectedDate) setDate(selectedDate);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: theme.muted }]}>Amount</Text>
        <View style={[styles.amountRow, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.muted, fontSize: 16 }}>₹</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            style={[styles.amountInput, { color: theme.colors.text }]}
            placeholder="0.00"
            placeholderTextColor={theme.muted}
          />
        </View>
        <Text style={{ color: theme.muted, fontSize: 12, marginBottom: 16 }}>
          Up to {formatCurrency(maxAmount)}
        </Text>

        <Text style={[styles.label, { color: theme.muted }]}>Date & Time</Text>
        <Pressable
          onPress={openDatePicker}
          style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={{ color: theme.colors.text }}>{formatDate(date.toISOString())}</Text>
        </Pressable>

        {showDatePicker && (
          <DateTimePicker
            value={date}
            mode={Platform.OS === 'ios' ? 'datetime' : pickerMode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={handleDateChange}
          />
        )}
        {Platform.OS === 'ios' && showDatePicker ? (
          <Pressable onPress={() => setShowDatePicker(false)} style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.primary, fontWeight: '600' }}>Done</Text>
          </Pressable>
        ) : null}

        <Text style={[styles.label, { color: theme.muted }]}>Note (optional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="e.g. Paid via UPI"
          placeholderTextColor={theme.muted}
          style={[
            styles.input,
            styles.noteInput,
            { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text },
          ]}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Pressable
            onPress={onCancel}
            style={[styles.button, { borderColor: theme.border, borderWidth: 1, flex: 1 }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => void handleSubmit()}
            disabled={isSubmitting}
            style={[styles.button, { backgroundColor: theme.primary, flex: 1, opacity: isSubmitting ? 0.6 : 1 }]}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>
              {isSubmitting ? 'Saving…' : payment ? 'Update' : 'Save'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

type SheetProps = {
  debt: Debt;
  payment?: DebtPayment;
  onClose: () => void;
  onSaved: (debt: Debt) => void;
};

export function DebtPaymentSheet({ debt, payment, onClose, onSaved }: SheetProps) {
  const theme = useThemeColors();
  const labels = paymentLabels(debt);

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: theme.background }]}>
        <View style={[styles.sheetHeader, { borderBottomColor: theme.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>
              {debt.partyName}
            </Text>
            <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>
              {payment ? labels.edit : labels.add}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={{ color: theme.muted, fontSize: 22 }}>×</Text>
          </Pressable>
        </View>
        <DebtPaymentForm
          key={payment?.id ?? 'new'}
          debt={debt}
          payment={payment}
          onSaved={onSaved}
          onCancel={onClose}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, paddingBottom: 32 },
  label: { fontSize: 13, fontWeight: '500', marginBottom: 6 },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  amountInput: { flex: 1, fontSize: 18, fontWeight: '600', padding: 0 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 16,
  },
  noteInput: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  sheet: { flex: 1 },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
});
