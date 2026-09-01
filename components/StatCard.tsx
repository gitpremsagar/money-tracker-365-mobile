import { StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

type Props = {
  label: string;
  value: string;
  color?: 'green' | 'red' | 'blue' | 'purple' | 'default';
};

const colorMap = {
  green: { bg: '#d1fae5', text: '#059669' },
  red: { bg: '#fee2e2', text: '#dc2626' },
  blue: { bg: '#dbeafe', text: '#2563eb' },
  purple: { bg: '#ede9fe', text: '#7c3aed' },
  default: { bg: '#f4f4f5', text: '#18181b' },
};

export default function StatCard({ label, value, color = 'default' }: Props) {
  const theme = useThemeColors();
  const c = colorMap[color];

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={[styles.icon, { backgroundColor: theme.isDark ? `${c.text}22` : c.bg }]}>
        <View style={[styles.dot, { backgroundColor: c.text }]} />
      </View>
      <Text style={[styles.label, { color: theme.muted }]}>{label.toUpperCase()}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flex: 1,
    minWidth: '45%',
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 20,
    fontWeight: '700',
  },
});
