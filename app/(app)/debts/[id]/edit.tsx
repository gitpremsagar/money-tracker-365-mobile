import DebtForm from '@/components/DebtForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { getDebt, type Debt } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

export default function EditDebtScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [debt, setDebt] = useState<Debt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !id) return;
    void (async () => {
      setIsLoading(true);
      try {
        const data = await getDebt(id, accessToken);
        setDebt(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load debt');
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

  if (error || !debt) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <Text style={{ color: theme.danger }}>{error ?? 'Debt not found'}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <DebtForm debt={debt} />
    </View>
  );
}
