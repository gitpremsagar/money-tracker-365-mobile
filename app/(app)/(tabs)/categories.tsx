import EmptyState from '@/components/EmptyState';
import TypeBadge from '@/components/TypeBadge';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
  type Category,
  type CategoryType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

const TYPES: CategoryType[] = ['EXPENSE', 'INCOME', 'SAVING', 'INVESTMENT'];

export default function CategoriesScreen() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [categories, setCategories] = useState<Category[]>([]);
  const [activeType, setActiveType] = useState<CategoryType>('EXPENSE');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    if (!accessToken) return;
    try {
      const data = await listCategories(accessToken);
      setCategories(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load categories');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void (async () => {
      setIsLoading(true);
      await fetchCategories();
    })();
  }, [fetchCategories]);

  const filtered = categories.filter((c) => c.type === activeType);

  async function handleCreate() {
    if (!accessToken || !newName.trim()) return;
    setIsCreating(true);
    setCreateError(null);
    try {
      const cat = await createCategory({ name: newName.trim(), type: activeType }, accessToken);
      setCategories((prev) => [...prev, cat]);
      setNewName('');
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!accessToken || !editName.trim()) return;
    setIsSaving(true);
    try {
      const updated = await updateCategory(id, { name: editName.trim() }, accessToken);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    setDeletingId(id);
    try {
      await deleteCategory(id, accessToken);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={[styles.desc, { color: theme.muted }]}>
          Organize your transactions by creating custom income, expense, saving, and investment categories.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TYPES.map((t) => {
            const colors = TYPE_COLORS[t];
            const active = activeType === t;
            return (
              <Pressable
                key={t}
                onPress={() => setActiveType(t)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active
                      ? theme.isDark
                        ? colors.darkBg
                        : colors.bg
                      : 'transparent',
                  },
                ]}>
                <Text
                  style={{
                    color: active ? (theme.isDark ? colors.darkText : colors.text) : theme.muted,
                    fontWeight: '600',
                    fontSize: 13,
                  }}>
                  {TYPE_LABEL[t]}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.createRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder={`New ${activeType.toLowerCase()} category…`}
            placeholderTextColor={theme.muted}
            maxLength={50}
            style={[styles.input, { borderColor: theme.border, backgroundColor: theme.card, color: theme.colors.text, flex: 1 }]}
          />
          <Pressable
            onPress={() => void handleCreate()}
            disabled={isCreating || !newName.trim()}
            style={[styles.addBtn, { backgroundColor: theme.primary, opacity: isCreating || !newName.trim() ? 0.6 : 1 }]}>
            {isCreating ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Ionicons name="add" size={20} color="#fff" />
            )}
          </Pressable>
        </View>

        {(createError || error) && (
          <Text style={styles.error}>{createError ?? error}</Text>
        )}

        {isLoading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <EmptyState message={`No ${activeType.toLowerCase()} categories yet. Add one above.`} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => { setIsRefreshing(true); void fetchCategories(); }}
                tintColor={theme.primary}
              />
            }
            renderItem={({ item: cat }) => (
              <View style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
                {editingId === cat.id ? (
                  <>
                    <TextInput
                      value={editName}
                      onChangeText={setEditName}
                      maxLength={50}
                      autoFocus
                      style={[styles.editInput, { borderColor: theme.border, color: theme.colors.text, flex: 1 }]}
                    />
                    <Pressable onPress={() => void handleUpdate(cat.id)} disabled={isSaving}>
                      <Text style={{ color: theme.primary, fontWeight: '600' }}>Save</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditingId(null)}>
                      <Text style={{ color: theme.muted }}>Cancel</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <TypeBadge type={cat.type} />
                    <Text style={[styles.catName, { color: theme.colors.text }]}>{cat.name}</Text>
                    <Pressable
                      onPress={() => { setEditingId(cat.id); setEditName(cat.name); }}
                      style={styles.iconBtn}>
                      <Ionicons name="pencil-outline" size={18} color={theme.muted} />
                    </Pressable>
                    <Pressable
                      onPress={() => void handleDelete(cat.id)}
                      disabled={deletingId === cat.id}
                      style={styles.iconBtn}>
                      {deletingId === cat.id ? (
                        <ActivityIndicator size="small" color={theme.danger} />
                      ) : (
                        <Ionicons name="trash-outline" size={18} color={theme.muted} />
                      )}
                    </Pressable>
                  </>
                )}
              </View>
            )}
          />
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  desc: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  tabs: { marginBottom: 16, maxHeight: 40 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  createRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  editInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  iconBtn: { padding: 4 },
});
