import TransactionForm from '@/components/TransactionForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getTransaction, type Transaction } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function EditTransactionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  if (error || !transaction) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <Text style={{ color: theme.danger }}>{error ?? 'Transaction not found'}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <TransactionForm transaction={transaction} />
    </View>
  );
}
