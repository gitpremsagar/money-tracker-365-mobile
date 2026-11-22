import { useThemeColors } from '@/hooks/use-theme-colors';
import { type Category, type CategoryType } from '@/lib/api';
import { TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

export default function CategoryPickerModal({
  visible,
  categories,
  title = 'Choose a category',
  onSelect,
  onClose,
}: {
  visible: boolean;
  categories: Category[];
  title?: string;
  onSelect: (category: Category) => void;
  onClose: () => void;
}) {
  const theme = useThemeColors();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.muted} />
            </Pressable>
          </View>
          <FlatList
            data={categories}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            style={{ maxHeight: 480 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item);
                  onClose();
                }}
                style={[styles.row, { borderBottomColor: theme.border }]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: TYPE_COLORS[item.type as CategoryType].text ?? theme.primary },
                  ]}
                />
                <Text style={[styles.name, { color: theme.colors.text }]}>{item.name}</Text>
                <Text style={{ color: theme.muted, fontSize: 12 }}>{TYPE_LABEL[item.type]}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={{ color: theme.muted, padding: 16 }}>No categories yet.</Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  title: { fontSize: 16, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { flex: 1, fontSize: 14, fontWeight: '500' },
});
