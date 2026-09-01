import { useThemeColors } from '@/hooks/use-theme-colors';
import { useAuth } from '@/lib/auth-context';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SignupScreen() {
  const { signup } = useAuth();
  const router = useRouter();
  const theme = useThemeColors();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSignup() {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    if (!email.trim()) {
      setError('Email is required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await signup({ name: name.trim(), email: email.trim(), password });
      router.replace('/(app)/(tabs)/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: theme.colors.text }]}>Create account</Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>Start tracking your expenses</Text>

          <Text style={[styles.label, { color: theme.colors.text }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            autoComplete="name"
            placeholder="Your name"
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text }]}
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>Email</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            placeholder="you@example.com"
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text }]}
          />

          <Text style={[styles.label, { color: theme.colors.text }]}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            placeholder="At least 8 characters"
            placeholderTextColor={theme.muted}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text }]}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={() => void handleSignup()}
            disabled={isSubmitting}
            style={[styles.button, { backgroundColor: theme.primary, opacity: isSubmitting ? 0.6 : 1 }]}>
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </Pressable>

          <View style={styles.footer}>
            <Text style={{ color: theme.muted }}>Already have an account? </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text style={{ color: theme.primary, fontWeight: '600' }}>Sign in</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 16, marginBottom: 32 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16 },
  error: { color: '#dc2626', fontSize: 14, marginTop: 12 },
  button: { marginTop: 24, paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: 24 },
});
