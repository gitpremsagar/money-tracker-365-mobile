import ConfirmDialog from '@/components/ConfirmDialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { deleteDebt, getDebt, type Debt } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import {
  DEBT_COLORS,
  DEBT_STATUS_COLORS,
  DEBT_STATUS_LABEL,
  DEBT_TYPE_LABEL,
  formatCurrency,
  formatDate,
} from '@/lib/format';
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

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.background }} contentContainerStyle={styles.container}>
      <Text style={[styles.amount, { color: theme.isDark ? typeColors.darkText : typeColors.text }]}>
        {formatCurrency(debt.amount)}
      </Text>
      <View
        style={[
          styles.badge,
          { backgroundColor: theme.isDark ? typeColors.darkBg : typeColors.bg },
        ]}>
        <Text style={{ color: theme.isDark ? typeColors.darkText : typeColors.text, fontSize: 12, fontWeight: '600' }}>
          {DEBT_TYPE_LABEL[debt.type]}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
            <Text style={{ color: theme.isDark ? statusColors.darkText : statusColors.text, fontSize: 12, fontWeight: '600' }}>
              {DEBT_STATUS_LABEL[debt.status]}
            </Text>
          </View>
        </View>
        <Row label="Date" value={formatDate(debt.date)} theme={theme} />
        <Row label="Description" value={debt.description?.trim() ? debt.description : '—'} theme={theme} />
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
  amount: { fontSize: 32, fontWeight: '700' },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 16 },
  row: { gap: 2 },
  button: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
});
