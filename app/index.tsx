import { useAuth } from '@/lib/auth-context';
import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

export default function Index() {
  const { user, isLoading } = useAuth();
  const theme = useThemeColors();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  if (user) {
    return <Redirect href="/(app)/(tabs)/dashboard" />;
  }

  return <Redirect href="/(auth)/login" />;
}
