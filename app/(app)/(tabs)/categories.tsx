import ConfirmDialog from '@/components/ConfirmDialog';
import EmptyState from '@/components/EmptyState';
import TypeBadge from '@/components/TypeBadge';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  createCategory,
  createCategoryGroup,
  deleteCategory,
  deleteCategoryGroup,
  listCategories,
  listCategoryGroups,
  updateCategory,
  updateCategoryGroup,
  type Category,
  type CategoryGroup,
  type CategoryType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [activeType, setActiveType] = useState<CategoryType>('EXPENSE');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [newName, setNewName] = useState('');
  const [newGroupId, setNewGroupId] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const [newGroupName, setNewGroupName] = useState('');
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState('');
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [categoryData, groupData] = await Promise.all([
        listCategories(accessToken),
        listCategoryGroups(accessToken),
      ]);
      setCategories(categoryData);
      setGroups(groupData);
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
      await fetchData();
    })();
  }, [fetchData]);

  function changeType(type: CategoryType) {
    setActiveType(type);
    setNewGroupId('');
    setEditingId(null);
    setEditingGroupId(null);
  }

  const filtered = categories.filter((c) => c.type === activeType);
  const typeGroups = groups.filter((g) => g.type === activeType);
  const sections: { id: string | null; name: string; items: Category[] }[] = [
    ...typeGroups.map((g) => ({
      id: g.id,
      name: g.name,
      items: filtered.filter((c) => c.groupId === g.id),
    })),
    {
      id: null,
      name: 'Ungrouped',
      items: filtered.filter((c) => !c.groupId || !typeGroups.some((g) => g.id === c.groupId)),
    },
  ].filter((s) => s.id !== null || s.items.length > 0 || typeGroups.length === 0);

  async function handleCreate() {
    if (!accessToken || !newName.trim()) return;
    setIsCreating(true);
    setActionError(null);
    try {
      const cat = await createCategory(
        { name: newName.trim(), type: activeType, groupId: newGroupId || null },
        accessToken,
      );
      setCategories((prev) => [...prev, cat]);
      setNewName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleUpdate(id: string) {
    if (!accessToken || !editName.trim()) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const updated = await updateCategory(id, { name: editName.trim() }, accessToken);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
      setEditingId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to update category');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMove(id: string, groupId: string | null) {
    if (!accessToken) return;
    setMovingId(id);
    setActionError(null);
    try {
      const updated = await updateCategory(id, { groupId }, accessToken);
      setCategories((prev) => prev.map((c) => (c.id === id ? updated : c)));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to move category');
    } finally {
      setMovingId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!accessToken) return;
    setDeletingId(id);
    setActionError(null);
    try {
      await deleteCategory(id, accessToken);
      setCategories((prev) => prev.filter((c) => c.id !== id));
      setPendingDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete category');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleCreateGroup() {
    if (!accessToken || !newGroupName.trim()) return;
    setIsCreatingGroup(true);
    setActionError(null);
    try {
      const group = await createCategoryGroup({ name: newGroupName.trim(), type: activeType }, accessToken);
      setGroups((prev) => [...prev, group].sort((a, b) => a.name.localeCompare(b.name)));
      setNewGroupName('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setIsCreatingGroup(false);
    }
  }

  async function handleUpdateGroup(id: string) {
    if (!accessToken || !editGroupName.trim()) return;
    setActionError(null);
    try {
      const updated = await updateCategoryGroup(id, { name: editGroupName.trim() }, accessToken);
      setGroups((prev) =>
        prev.map((g) => (g.id === id ? { ...g, ...updated } : g)).sort((a, b) => a.name.localeCompare(b.name)),
      );
      setEditingGroupId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to rename group');
    }
  }

  async function handleDeleteGroup(id: string) {
    if (!accessToken) return;
    setDeletingGroupId(id);
    setActionError(null);
    try {
      await deleteCategoryGroup(id, accessToken);
      setGroups((prev) => prev.filter((g) => g.id !== id));
      setCategories((prev) => prev.map((c) => (c.groupId === id ? { ...c, groupId: null } : c)));
      if (newGroupId === id) setNewGroupId('');
      setPendingDeleteGroupId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to delete group');
    } finally {
      setDeletingGroupId(null);
    }
  }

  function renderCategoryRow(cat: Category) {
    return (
      <View key={cat.id} style={[styles.row, { backgroundColor: theme.card, borderColor: theme.border }]}>
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
          <View style={{ flex: 1, gap: 8 }}>
            <View style={styles.rowMain}>
              <TypeBadge type={cat.type} />
              <Text style={[styles.catName, { color: theme.colors.text }]}>{cat.name}</Text>
              <Pressable
                onPress={() => {
                  setEditingId(cat.id);
                  setEditName(cat.name);
                }}
                style={styles.iconBtn}>
                <Ionicons name="pencil-outline" size={18} color={theme.muted} />
              </Pressable>
              <Pressable onPress={() => setPendingDeleteId(cat.id)} disabled={deletingId === cat.id} style={styles.iconBtn}>
                {deletingId === cat.id ? (
                  <ActivityIndicator size="small" color={theme.danger} />
                ) : (
                  <Ionicons name="trash-outline" size={18} color={theme.muted} />
                )}
              </Pressable>
            </View>
            {typeGroups.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable
                  onPress={() => void handleMove(cat.id, null)}
                  disabled={movingId === cat.id}
                  style={[
                    styles.groupChip,
                    {
                      borderColor: !cat.groupId ? theme.primary : theme.border,
                      backgroundColor: !cat.groupId ? `${theme.primary}15` : theme.background,
                    },
                  ]}>
                  <Text style={{ color: !cat.groupId ? theme.primary : theme.muted, fontSize: 11 }}>No group</Text>
                </Pressable>
                {typeGroups.map((g) => {
                  const active = cat.groupId === g.id;
                  return (
                    <Pressable
                      key={g.id}
                      onPress={() => void handleMove(cat.id, g.id)}
                      disabled={movingId === cat.id}
                      style={[
                        styles.groupChip,
                        {
                          borderColor: active ? theme.primary : theme.border,
                          backgroundColor: active ? `${theme.primary}15` : theme.background,
                        },
                      ]}>
                      <Text style={{ color: active ? theme.primary : theme.muted, fontSize: 11 }}>{g.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              setIsRefreshing(true);
              void fetchData();
            }}
            tintColor={theme.primary}
          />
        }>
        <Text style={[styles.desc, { color: theme.muted }]}>
          Organize transactions with categories. Put related categories into groups to see totals per group in
          reports.
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TYPES.map((t) => {
            const colors = TYPE_COLORS[t];
            const active = activeType === t;
            return (
              <Pressable
                key={t}
                onPress={() => changeType(t)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: active ? (theme.isDark ? colors.darkBg : colors.bg) : 'transparent',
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

        <View style={[styles.groupSection, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.colors.text, fontWeight: '600', fontSize: 14 }}>
            {TYPE_LABEL[activeType]} groups
          </Text>
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2, marginBottom: 12 }}>
            e.g. &quot;Household&quot; for Grocery, Milk, Eggs.
          </Text>

          <View style={styles.createRow}>
            <TextInput
              value={newGroupName}
              onChangeText={setNewGroupName}
              placeholder="New group name…"
              placeholderTextColor={theme.muted}
              maxLength={50}
              style={[
                styles.input,
                { borderColor: theme.border, backgroundColor: theme.background, color: theme.colors.text, flex: 1 },
              ]}
            />
            <Pressable
              onPress={() => void handleCreateGroup()}
              disabled={isCreatingGroup || !newGroupName.trim()}
              style={[
                styles.outlineBtn,
                {
                  borderColor: theme.primary,
                  opacity: isCreatingGroup || !newGroupName.trim() ? 0.6 : 1,
                },
              ]}>
              {isCreatingGroup ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>Add group</Text>
              )}
            </Pressable>
          </View>

          {typeGroups.length > 0 ? (
            <View style={styles.groupList}>
              {typeGroups.map((g) => {
                const count = filtered.filter((c) => c.groupId === g.id).length;
                return (
                  <View
                    key={g.id}
                    style={[styles.groupPill, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    {editingGroupId === g.id ? (
                      <>
                        <TextInput
                          value={editGroupName}
                          onChangeText={setEditGroupName}
                          maxLength={50}
                          autoFocus
                          style={[styles.editInput, { borderColor: theme.border, color: theme.colors.text, width: 120 }]}
                        />
                        <Pressable onPress={() => void handleUpdateGroup(g.id)}>
                          <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 12 }}>Save</Text>
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Text style={{ color: theme.colors.text, fontWeight: '500', fontSize: 13 }}>{g.name}</Text>
                        <Text style={{ color: theme.muted, fontSize: 11 }}>{count}</Text>
                        <Pressable
                          onPress={() => {
                            setEditingGroupId(g.id);
                            setEditGroupName(g.name);
                          }}>
                          <Ionicons name="pencil-outline" size={14} color={theme.muted} />
                        </Pressable>
                        <Pressable onPress={() => setPendingDeleteGroupId(g.id)} disabled={deletingGroupId === g.id}>
                          {deletingGroupId === g.id ? (
                            <ActivityIndicator size="small" color={theme.danger} />
                          ) : (
                            <Ionicons name="trash-outline" size={14} color={theme.muted} />
                          )}
                        </Pressable>
                      </>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={{ color: theme.muted, fontSize: 12 }}>No groups yet.</Text>
          )}
        </View>

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
            {isCreating ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="add" size={20} color="#fff" />}
          </Pressable>
        </View>

        {typeGroups.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12, maxHeight: 40 }}>
            <Pressable
              onPress={() => setNewGroupId('')}
              style={[
                styles.groupChip,
                {
                  borderColor: !newGroupId ? theme.primary : theme.border,
                  backgroundColor: !newGroupId ? `${theme.primary}15` : theme.card,
                },
              ]}>
              <Text style={{ color: !newGroupId ? theme.primary : theme.muted, fontSize: 12 }}>No group</Text>
            </Pressable>
            {typeGroups.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => setNewGroupId(g.id)}
                style={[
                  styles.groupChip,
                  {
                    borderColor: newGroupId === g.id ? theme.primary : theme.border,
                    backgroundColor: newGroupId === g.id ? `${theme.primary}15` : theme.card,
                  },
                ]}>
                <Text style={{ color: newGroupId === g.id ? theme.primary : theme.muted, fontSize: 12 }}>{g.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {(actionError || error) && <Text style={styles.error}>{actionError ?? error}</Text>}

        {isLoading ? (
          <ActivityIndicator color={theme.primary} style={{ marginTop: 24 }} />
        ) : filtered.length === 0 ? (
          <EmptyState message={`No ${activeType.toLowerCase()} categories yet. Add one above.`} />
        ) : typeGroups.length === 0 ? (
          <View>{filtered.map(renderCategoryRow)}</View>
        ) : (
          <View style={{ gap: 20 }}>
            {sections.map((section) => (
              <View key={section.id ?? 'ungrouped'}>
                <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8 }}>
                  {section.name}{' '}
                  <Text style={{ fontWeight: '400', textTransform: 'none' }}>
                    {section.items.length} {section.items.length === 1 ? 'category' : 'categories'}
                  </Text>
                </Text>
                {section.items.length > 0 ? (
                  section.items.map(renderCategoryRow)
                ) : (
                  <Text
                    style={[
                      styles.emptyGroup,
                      { color: theme.muted, borderColor: theme.border },
                    ]}>
                    No categories in this group yet. Tap a group chip on a category to move it here.
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <ConfirmDialog
        visible={pendingDeleteId !== null}
        title="Delete category"
        message="This category will be permanently deleted. This cannot be undone."
        confirmLabel="Delete"
        isConfirming={deletingId !== null}
        onConfirm={() => {
          if (pendingDeleteId) void handleDelete(pendingDeleteId);
        }}
        onCancel={() => {
          if (deletingId === null) setPendingDeleteId(null);
        }}
      />

      <ConfirmDialog
        visible={pendingDeleteGroupId !== null}
        title="Delete group"
        message="The group will be deleted. Categories in it will be kept and become ungrouped."
        confirmLabel="Delete"
        isConfirming={deletingGroupId !== null}
        onConfirm={() => {
          if (pendingDeleteGroupId) void handleDeleteGroup(pendingDeleteGroupId);
        }}
        onCancel={() => {
          if (deletingGroupId === null) setPendingDeleteGroupId(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 32 },
  desc: { fontSize: 14, marginBottom: 16, lineHeight: 20 },
  tabs: { marginBottom: 16, maxHeight: 40 },
  tab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999, marginRight: 8 },
  groupSection: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 16 },
  createRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12, fontSize: 15 },
  addBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outlineBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  groupList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  groupChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
  },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12 },
  row: { borderRadius: 14, borderWidth: 1, marginBottom: 8, padding: 14 },
  rowMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catName: { flex: 1, fontSize: 14, fontWeight: '500' },
  editInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 14 },
  iconBtn: { padding: 4 },
  emptyGroup: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 12,
    padding: 12,
    fontSize: 12,
  },
});
