import { useThemeColors } from '@/hooks/use-theme-colors';
import { currentMonth, monthLabel, navigateMonth } from '@/lib/format';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  month: string;
  onChange: (month: string) => void;
  disableFuture?: boolean;
};

function monthToDate(month: string): Date {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year!, (mon ?? 1) - 1, 1);
}

function dateToMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default function MonthPicker({ month, onChange, disableFuture = false }: Props) {
  const theme = useThemeColors();
  const [showPicker, setShowPicker] = useState(false);
  const [draftDate, setDraftDate] = useState(() => monthToDate(month));
  const nextDisabled = disableFuture && month >= currentMonth();
  const maxDate = disableFuture ? new Date() : undefined;

  function applyMonth(next: string) {
    if (disableFuture && next > currentMonth()) {
      onChange(currentMonth());
      return;
    }
    onChange(next);
  }

  function openPicker() {
    setDraftDate(monthToDate(month));
    setShowPicker(true);
  }

  function handleAndroidChange(event: DateTimePickerEvent, selected?: Date) {
    setShowPicker(false);
    if (event.type === 'dismissed' || !selected) {
      return;
    }
    applyMonth(dateToMonth(selected));
  }

  return (
    <View>
      <View style={[styles.container, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <Pressable onPress={() => applyMonth(navigateMonth(month, -1))} style={styles.arrow}>
          <Text style={[styles.arrowText, { color: theme.colors.text }]}>‹</Text>
        </Pressable>
        <Pressable onPress={openPicker} style={styles.labelButton}>
          <Text style={[styles.label, { color: theme.colors.text }]}>{monthLabel(month)}</Text>
        </Pressable>
        <Pressable
          disabled={nextDisabled}
          onPress={() => applyMonth(navigateMonth(month, 1))}
          style={[styles.arrow, { opacity: nextDisabled ? 0.4 : 1 }]}>
          <Text style={[styles.arrowText, { color: theme.colors.text }]}>›</Text>
        </Pressable>
      </View>

      {Platform.OS === 'android' && showPicker && (
        <DateTimePicker
          value={monthToDate(month)}
          mode="date"
          display="default"
          maximumDate={maxDate}
          onChange={handleAndroidChange}
        />
      )}

      {Platform.OS === 'ios' && (
        <Modal transparent animationType="slide" visible={showPicker} onRequestClose={() => setShowPicker(false)}>
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerSheet, { backgroundColor: theme.card }]}>
              <View style={[styles.pickerHeader, { borderBottomColor: theme.border }]}>
                <Pressable onPress={() => setShowPicker(false)}>
                  <Text style={{ color: theme.muted, fontWeight: '600' }}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    applyMonth(dateToMonth(draftDate));
                    setShowPicker(false);
                  }}>
                  <Text style={{ color: theme.primary, fontWeight: '600' }}>Done</Text>
                </Pressable>
              </View>
              <DateTimePicker
                value={draftDate}
                mode="date"
                display="spinner"
                maximumDate={maxDate}
                onChange={(_, selected) => {
                  if (selected) setDraftDate(selected);
                }}
              />
            </View>
          </View>
        </Modal>
      )}
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
  labelButton: {
    flex: 1,
    alignItems: 'center',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickerSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
