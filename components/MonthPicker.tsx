import { monthLabel, navigateMonth } from '@/lib/format';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useThemeColors } from '@/hooks/use-theme-colors';

type Props = {
  month: string;
  onChange: (month: string) => void;
};

export default function MonthPicker({ month, onChange }: Props) {
  const theme = useThemeColors();

  return (
    <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Pressable onPress={() => onChange(navigateMonth(month, -1))} style={styles.arrow}>
        <Text style={[styles.arrowText, { color: theme.colors.text }]}>‹</Text>
      </Pressable>
      <Text style={[styles.label, { color: theme.colors.text }]}>{monthLabel(month)}</Text>
      <Pressable onPress={() => onChange(navigateMonth(month, 1))} style={styles.arrow}>
        <Text style={[styles.arrowText, { color: theme.colors.text }]}>›</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  arrow: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  arrowText: {
    fontSize: 24,
    fontWeight: '300',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
