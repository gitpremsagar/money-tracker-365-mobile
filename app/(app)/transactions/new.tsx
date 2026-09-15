import TransactionForm from '@/components/TransactionForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import type { CategoryType } from '@/lib/api';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

const TYPES: CategoryType[] = ['INCOME', 'EXPENSE', 'SAVING', 'INVESTMENT'];

function isCategoryType(value: string | undefined): value is CategoryType {
  return TYPES.includes(value as CategoryType);
}

export default function NewTransactionScreen() {
  const theme = useThemeColors();
  const { type, date } = useLocalSearchParams<{ type?: string; date?: string }>();
  const parsedDate = date ? new Date(date) : undefined;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <TransactionForm
        key={`${type ?? ''}-${date ?? ''}`}
        initialType={isCategoryType(type) ? type : undefined}
        initialDate={parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate : undefined}
      />
    </View>
  );
}
