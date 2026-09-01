import ConfirmDialog from '@/components/ConfirmDialog';
import TypeBadge from '@/components/TypeBadge';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { deleteTransaction, getTransaction, type Transaction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatAmount, formatDate } from '@/lib/format';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function TransactionDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    if (!accessToken || !id) return;
    void (async () => {
      setIsLoading(true);
      try {
        const tx = await getTransaction(id, accessToken);
        setTransaction(tx);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load transaction');
      } finally {
        setIsLoading(false);
      }
    })();
  }, [accessToken, id]);

  async function handleDelete() {
    if (!accessToken || !id) return;
    setIsDeleting(true);
    try {
      await deleteTransaction(id, accessToken);
      router.replace('/(app)/(tabs)/transactions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setIsDeleting(false);
      setConfirmOpen(false);
    }
  }

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (error || !transaction) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.danger }}>{error ?? 'Transaction not found'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.amount, { color: theme.colors.text }]}>
        {formatAmount(transaction.amount, transaction.type)}
      </Text>
      <TypeBadge type={transaction.type} />

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Row label="Category" value={transaction.category.name} theme={theme} />
        <Row label="Date" value={formatDate(transaction.date)} theme={theme} />
        {transaction.note && <Row label="Note" value={transaction.note} theme={theme} />}
      </View>

      <Pressable
        onPress={() => router.push(`/(app)/transactions/${id}/edit`)}
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

      <ConfirmDialog
        visible={confirmOpen}
        title="Delete transaction"
        message="This transaction will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={() => void handleDelete()}
        onCancel={() => { if (!isDeleting) setConfirmOpen(false); }}
      />
    </ScrollView>
  );
}

function Row({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useThemeColors> }) {
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
  amount: { fontSize: 32, fontWeight: '700' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  row: { gap: 2 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
