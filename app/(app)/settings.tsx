import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  changePasswordRequest,
  deleteAccountRequest,
  logoutAllRequest,
  updateProfileRequest,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
}) {
  const theme = useThemeColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        autoCapitalize="none"
        style={[styles.input, { color: theme.colors.text, borderColor: theme.border, backgroundColor: theme.card }]}
      />
    </View>
  );
}

export default function SettingsScreen() {
  const { user, refreshUser, logout } = useAuth();
  const theme = useThemeColors();
  const router = useRouter();

  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  async function saveProfile() {
    setIsBusy(true);
    try {
      await updateProfileRequest({ name: name.trim(), email: email.trim() });
      await refreshUser();
      Alert.alert('Profile updated');
    } catch (error) {
      Alert.alert('Could not update profile', error instanceof Error ? error.message : 'Try again');
    } finally {
      setIsBusy(false);
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      Alert.alert('Passwords do not match');
      return;
    }
    setIsBusy(true);
    try {
      await changePasswordRequest({ currentPassword, newPassword });
      await logout();
      router.replace('/(auth)/login');
    } catch (error) {
      Alert.alert('Could not change password', error instanceof Error ? error.message : 'Try again');
    } finally {
      setIsBusy(false);
    }
  }

  function signOutEverywhere() {
    Alert.alert('Sign out of all devices?', 'You will need to sign in again here too.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await logoutAllRequest();
            } catch {
              // Local cleanup still happens.
            }
            await logout();
            router.replace('/(auth)/login');
          })();
        },
      },
    ]);
  }

  function confirmDelete() {
    if (!deletePassword) {
      Alert.alert('Password required', 'Enter your password to delete the account.');
      return;
    }
    Alert.alert(
      'Delete account?',
      'All transactions, categories, budgets, debts and payments will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                await deleteAccountRequest(deletePassword);
                await logout();
                router.replace('/(auth)/login');
              } catch (error) {
                Alert.alert(
                  'Could not delete account',
                  error instanceof Error ? error.message : 'Try again',
                );
              }
            })();
          },
        },
      ],
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Profile</Text>
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Email" value={email} onChangeText={setEmail} />
          <Pressable
            onPress={() => void saveProfile()}
            disabled={isBusy}
            style={[styles.primary, { backgroundColor: theme.primary, opacity: isBusy ? 0.6 : 1 }]}>
            <Text style={styles.primaryText}>Save profile</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Password</Text>
          <Field label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry />
          <Field label="New password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
          <Field label="Confirm new password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
          <Pressable
            onPress={() => void changePassword()}
            disabled={isBusy}
            style={[styles.secondary, { borderColor: theme.border, opacity: isBusy ? 0.6 : 1 }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Change password</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.colors.text }]}>Sessions</Text>
          <Pressable
            onPress={signOutEverywhere}
            style={[styles.secondary, { borderColor: theme.border }]}>
            <Text style={{ color: theme.colors.text, fontWeight: '600' }}>Sign out of all devices</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.danger }]}>
          <Text style={[styles.title, { color: theme.danger }]}>Danger zone</Text>
          <Text style={{ color: theme.muted, fontSize: 12 }}>
            Permanently delete your account and all data. This cannot be undone.
          </Text>
          <Field label="Password" value={deletePassword} onChangeText={setDeletePassword} secureTextEntry />
          <Pressable
            onPress={confirmDelete}
            style={[styles.danger, { backgroundColor: theme.danger }]}>
            <Text style={styles.primaryText}>Delete my account</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 40 },
  card: { borderWidth: 1, borderRadius: 14, padding: 16, gap: 12 },
  title: { fontSize: 15, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14 },
  primary: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondary: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  danger: { borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
});
