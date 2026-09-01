import TransactionForm from '@/components/TransactionForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { View } from 'react-native';

export default function NewTransactionScreen() {
  const theme = useThemeColors();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <TransactionForm />
    </View>
  );
}
