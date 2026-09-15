import { useAuth } from '@/lib/auth-context';
import { useThemeColors } from '@/hooks/use-theme-colors';
import { Redirect, Stack } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

export default function AppLayout() {
  const { user, isLoading } = useAuth();
  const theme = useThemeColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.card },
        headerTintColor: theme.colors.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="transactions/new"
        options={{ headerShown: true, title: 'Add Transaction' }}
      />
      <Stack.Screen
        name="transactions/[id]"
        options={{ headerShown: true, title: 'Transaction' }}
      />
      <Stack.Screen
        name="transactions/[id]/edit"
        options={{ headerShown: true, title: 'Edit Transaction' }}
      />
      <Stack.Screen
        name="debts/new"
        options={{ headerShown: true, title: 'Add Debt' }}
      />
      <Stack.Screen
        name="debts/[id]"
        options={{ headerShown: true, title: 'Debt' }}
      />
      <Stack.Screen
        name="debts/[id]/edit"
        options={{ headerShown: true, title: 'Edit Debt' }}
      />
    </Stack>
  );
}
