import ConfirmDialog from '@/components/ConfirmDialog';
import { DebtPaymentSheet, paymentLabels } from '@/components/DebtPaymentForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { deleteDebt, deleteDebtPayment, getDebt, type Debt, type DebtPayment } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  DEBT_COLORS,
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABEL,
  DEBT_TYPE_LABEL,
  formatCurrency,
  formatDate,
} from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function DebtDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [paymentSheet, setPaymentSheet] = useState<{ payment?: DebtPayment } | null>(null);
  const [pendingDeletePaymentId, setPendingDeletePaymentId] = useState<string | null>(null);
  const [isDeletingPayment, setIsDeletingPayment] = useState(false);

  const loadDebt = useCallback(async () => {
    if (!accessToken || !id) return;
    setIsLoading(true);
    try {
      const data = await getDebt(id, accessToken);
      setDebt(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load debt');
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, id]);

  useFocusEffect(
    useCallback(() => {
      void loadDebt();
    }, [loadDebt]),
  );

  async function handleDelete() {
    if (!accessToken || !id) return;
    setIsDeleting(true);
    try {
      await deleteDebt(id, accessToken);
      router.replace('/(app)/(tabs)/debts' as Href);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  }

  async function handleDeletePayment(paymentId: string) {
    if (!accessToken || !debt) return;
    setIsDeletingPayment(true);
    try {
      setDebt(await deleteDebtPayment(debt.id, paymentId, accessToken));
      setPendingDeletePaymentId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete payment');
    } finally {
      setIsDeletingPayment(false);
    }
  }

  if (isLoading && !debt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (error || !debt) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.danger }}>{error ?? 'Debt not found'}</Text>
      </View>
    );
  }

  const typeColors = DEBT_COLORS[debt.type];
  const statusColors = DEBT_STATUS_COLORS[debt.status];
  const labels = paymentLabels(debt);
  const paidPct = debt.amount > 0 ? Math.min(100, (debt.paidAmount / debt.amount) * 100) : 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase' }}>
          Outstanding
        </Text>
        <Text style={[styles.amount, { color: theme.isDark ? typeColors.darkText : typeColors.text }]}>
          {formatCurrency(debt.outstanding)}
        </Text>

        <View style={[styles.progressTrack, { backgroundColor: theme.isDark ? '#27272a' : '#e4e4e7' }]}>
          <View style={[styles.progressFill, { width: `${paidPct}%`, backgroundColor: theme.primary }]} />
        </View>

        <View style={styles.totalsRow}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>Total</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: 2 }}>
              {formatCurrency(debt.amount)}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>{labels.verb}</Text>
            <Text style={{ color: theme.colors.text, fontWeight: '600', marginTop: 2 }}>
              {formatCurrency(debt.paidAmount)}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.row}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>Type</Text>
          <View
            style={[
              styles.badge,
              { marginTop: 6, backgroundColor: theme.isDark ? typeColors.darkBg : typeColors.bg },
            ]}>
            <Text style={{ color: theme.isDark ? typeColors.darkText : typeColors.text, fontSize: 12, fontWeight: '600' }}>
              {DEBT_TYPE_LABEL[debt.type]}
            </Text>
          </View>
        </View>

        <Row
          label={debt.type === 'TAKEN' ? 'Lender Name' : 'Borrower Name'}
          value={debt.partyName}
          theme={theme}
        />

        <View style={styles.row}>
          <Text style={{ color: theme.muted, fontSize: 13 }}>Status</Text>
          <View
            style={[
              styles.badge,
              { marginTop: 6, backgroundColor: theme.isDark ? statusColors.darkBg : statusColors.bg },
            ]}>
            <Text
              style={{
                color: theme.isDark ? statusColors.darkText : statusColors.text,
                fontSize: 12,
                fontWeight: '600',
              }}>
              {DEBT_STATUS_LABEL[debt.status]}
            </Text>
          </View>
        </View>

        <Row label="Date" value={formatDate(debt.date)} theme={theme} />
        <Row label="Description" value={debt.description?.trim() ? debt.description : '—'} theme={theme} />
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.paymentsHeader}>
          <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '600' }}>
            {debt.type === 'TAKEN' ? 'Payments made' : 'Payments received'}
          </Text>
          {debt.outstanding > 0 ? (
            <Pressable
              onPress={() => setPaymentSheet({})}
              style={[styles.addPaymentBtn, { backgroundColor: theme.primary }]}>
              <Ionicons name="add" size={14} color="#fff" />
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{labels.add}</Text>
            </Pressable>
          ) : null}
        </View>

        {!debt.payments || debt.payments.length === 0 ? (
          <Text style={{ color: theme.muted, fontSize: 14 }}>
            {debt.type === 'TAKEN' ? 'No payments made yet.' : 'Nothing received yet.'}
          </Text>
        ) : (
          debt.payments.map((payment) => (
            <View key={payment.id} style={[styles.paymentRow, { borderTopColor: theme.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: '600' }}>
                  {formatCurrency(payment.amount)}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }} numberOfLines={2}>
                  {formatDate(payment.date)}
                  {payment.note ? ` · ${payment.note}` : ''}
                </Text>
              </View>
              <Pressable onPress={() => setPaymentSheet({ payment })} hitSlop={8}>
                <Ionicons name="pencil-outline" size={18} color={theme.muted} />
              </Pressable>
              <Pressable onPress={() => setPendingDeletePaymentId(payment.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={theme.muted} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Pressable
        onPress={() => router.push(`/(app)/debts/${id}/edit` as Href)}
        style={[styles.button, { backgroundColor: theme.primary }]}>
        <Text style={styles.buttonText}>Edit</Text>
      </Pressable>

      <Pressable
        onPress={() => setConfirmOpen(true)}
        disabled={isDeleting}
        style={[styles.button, { borderColor: theme.danger, borderWidth: 1, opacity: isDeleting ? 0.6 : 1 }]}>
        <Text style={{ color: theme.danger, fontWeight: '600' }}>
          {isDeleting ? 'Deleting…' : 'Delete'}
        </Text>
      </Pressable>

      {paymentSheet ? (
        <DebtPaymentSheet
          debt={debt}
          payment={paymentSheet.payment}
          onClose={() => setPaymentSheet(null)}
          onSaved={(updated) => {
            setDebt(updated);
            setPaymentSheet(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        visible={pendingDeletePaymentId !== null}
        title="Delete payment"
        message="This payment will be permanently deleted and the outstanding amount will go back up."
        confirmLabel="Delete"
        isConfirming={isDeletingPayment}
        onConfirm={() => {
          if (pendingDeletePaymentId) void handleDeletePayment(pendingDeletePaymentId);
        }}
        onCancel={() => {
          if (!isDeletingPayment) setPendingDeletePaymentId(null);
        }}
      />

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
  );
}

function Row({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: theme.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: '500', marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  container: { padding: 16, paddingBottom: 32, gap: 16 },
  amount: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  progressTrack: { height: 8, borderRadius: 999, overflow: 'hidden', marginTop: 4 },
  progressFill: { height: '100%', borderRadius: 999 },
  totalsRow: { flexDirection: 'row', gap: 12 },
  row: { gap: 2 },
  paymentsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  addPaymentBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
