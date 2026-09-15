import DebtForm from '@/components/DebtForm';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { View } from 'react-native';

export default function NewDebtScreen() {
  const theme = useThemeColors();

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <DebtForm />
    </View>
  );
}
