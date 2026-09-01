import { StyleSheet, useColorScheme } from 'react-native';
import { Colors } from '@/constants/theme';

export function useThemeColors() {
  const scheme = useColorScheme() ?? 'light';
  const colors = Colors[scheme];

  return {
    scheme,
    colors,
    isDark: scheme === 'dark',
    card: scheme === 'dark' ? '#18181b' : '#ffffff',
    border: scheme === 'dark' ? '#27272a' : '#e4e4e7',
    muted: scheme === 'dark' ? '#a1a1aa' : '#71717a',
    background: scheme === 'dark' ? '#09090b' : '#fafafa',
    primary: '#059669',
    primaryDark: '#047857',
    danger: '#dc2626',
  };
}

export const sharedStyles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  error: {
    color: '#dc2626',
    fontSize: 14,
    marginTop: 8,
  },
});
