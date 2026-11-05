import ConfirmDialog from '@/components/ConfirmDialog';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  applyAssistantActions,
  confirmAssistantProposals,
  deleteAssistantConversation,
  getAssistantConversation,
  getAssistantPreferences,
  getAssistantUsage,
  isApiError,
  listAssistantConversations,
  listCategories,
  parseAssistantMessage,
  undoAssistantTransactions,
  updateAssistantPreferences,
  type AssistantApplyOperation,
  type AssistantConversationSummary,
  type AssistantDebtPayment,
  type AssistantHistoryMessage,
  type AssistantOperation,
  type AssistantParseResult,
  type AssistantProposal,
  type AssistantQueryResult,
  type AssistantStoredMessage,
  type AssistantUsageStats,
  type Category,
  type CategoryType,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, TYPE_COLORS, TYPE_LABEL } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

type Draft = {
  id: string;
  amount: number;
  type: CategoryType;
  categoryId: string | null;
  categoryName: string | null;
  suggestedCategoryName: string | null;
  date: string;
  note: string;
  confidence: number;
  newCategoryName: string;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  drafts?: Draft[];
  operations?: AssistantOperation[];
  debtPayments?: AssistantDebtPayment[];
  queryResult?: AssistantQueryResult | null;
  clarifications?: string[];
  saved?: boolean;
  savedCount?: number;
  autoSaved?: boolean;
  undone?: boolean;
  applied?: boolean;
  appliedCount?: number;
  error?: string;
  /** The user message that failed, kept so the Retry action can resend it. */
  retryText?: string;
};

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    "Hi! Tell me what you spent, earned, saved, or invested — or ask about your money. I can also edit or delete recent transactions and record debt payments, always for you to review first.",
};

const SUGGESTIONS = [
  'Spent ₹450 on groceries at BigBasket yesterday',
  'How much did I spend on food this month?',
  'Show my last 5 expenses',
  'Change my last cab ride to ₹1,500',
  'Delete my last transaction',
  'Paid Ravi ₹5,000 towards his loan',
];

const TYPE_ORDER: CategoryType[] = ['INCOME', 'EXPENSE', 'SAVING', 'INVESTMENT'];
const UNDO_WINDOW_MS = 10_000;

function newId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

function makeDraft(proposal: AssistantProposal): Draft {
  return {
    id: newId(),
    amount: proposal.amount,
    type: proposal.type,
    categoryId: proposal.categoryId,
    categoryName: proposal.categoryName,
    suggestedCategoryName: proposal.suggestedCategoryName,
    date: proposal.date,
    note: proposal.note ?? '',
    confidence: proposal.confidence,
    newCategoryName: proposal.categoryId ? '' : (proposal.suggestedCategoryName ?? ''),
  };
}

function validateDrafts(drafts: Draft[]): string | null {
  if (drafts.length === 0) return 'There is nothing to save.';
  for (const draft of drafts) {
    if (!draft.amount || draft.amount <= 0) return 'Every transaction needs a positive amount.';
    if (!draft.categoryId && !draft.newCategoryName.trim()) {
      return 'Pick a category or enter a name for a new one.';
    }
  }
  return null;
}

function storedToMessages(stored: AssistantStoredMessage[]): ChatMessage[] {
  const restored: ChatMessage[] = stored.map((message) => {
    if (message.role === 'USER') {
      return { id: message.id, role: 'user', content: message.content };
    }

    const payload = message.payload;
    return {
      id: message.id,
      role: 'assistant',
      content: message.content,
      drafts: payload?.proposals?.map(makeDraft),
      operations: payload?.operations ?? [],
      debtPayments: payload?.debtPayments ?? [],
      queryResult: payload?.queryResult ?? null,
      clarifications: payload?.clarifications ?? [],
      saved: Boolean(payload?.saved),
      savedCount: payload?.transactionIds?.length ?? 0,
      applied: Boolean(payload?.applied),
      appliedCount:
        (payload?.updatedTransactionIds?.length ?? 0) +
        (payload?.deletedTransactionIds?.length ?? 0) +
        (payload?.debtIds?.length ?? 0),
    };
  });

  let savedLater = false;
  let appliedLater = false;

  for (let index = restored.length - 1; index >= 0; index -= 1) {
    const message = restored[index]!;
    if (message.drafts && message.drafts.length > 0 && savedLater) {
      message.saved = true;
      message.savedCount = message.savedCount ?? message.drafts.length;
    }
    if (
      ((message.operations?.length ?? 0) > 0 || (message.debtPayments?.length ?? 0) > 0) &&
      appliedLater
    ) {
      message.applied = true;
    }
    if (message.saved) savedLater = true;
    if (message.applied) appliedLater = true;
  }

  return restored;
}

function toApplyOperation(operation: AssistantOperation): AssistantApplyOperation {
  if (operation.action === 'DELETE') {
    return { action: 'DELETE', transactionId: operation.transactionId };
  }

  const after = operation.after;
  if (!after) {
    return { action: 'UPDATE', transactionId: operation.transactionId };
  }

  return {
    action: 'UPDATE',
    transactionId: operation.transactionId,
    amount: after.amount,
    date: after.date,
    note: after.note,
    ...(after.categoryId ? { categoryId: after.categoryId } : {}),
  };
}

function assistantMessageFromResult(result: AssistantParseResult): ChatMessage {
  const clarifications = [...result.clarifications];
  if (result.categoriesEmpty && result.proposals.length > 0) {
    clarifications.push(
      "You don't have any categories yet. Confirm the suggested names to create them with these transactions.",
    );
  }

  return {
    id: newId(),
    role: 'assistant',
    content: result.reply,
    drafts: result.proposals.map(makeDraft),
    operations: result.operations,
    debtPayments: result.debtPayments,
    queryResult: result.queryResult,
    clarifications,
  };
}

function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const diffMinutes = Math.round((date.getTime() - Date.now()) / 60000);
  const absMinutes = Math.abs(diffMinutes);

  // Intl.RelativeTimeFormat is not available on Hermes (Android), so format manually.
  if (absMinutes < 1) return 'just now';
  if (absMinutes < 60) return diffMinutes < 0 ? `${absMinutes} min ago` : `in ${absMinutes} min`;

  const hours = Math.round(diffMinutes / 60);
  if (Math.abs(hours) < 24) {
    return hours < 0 ? `${Math.abs(hours)} hr ago` : `in ${Math.abs(hours)} hr`;
  }

  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) {
    return days < 0 ? `${Math.abs(days)} d ago` : `in ${Math.abs(days)} d`;
  }

  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Turns transport/HTTP failures into something the user can act on. */
function describeAssistantError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 404) {
      return 'The assistant is not available on this API server. The app is connected to an API deployment that does not include the assistant endpoints yet.';
    }
    if (error.status === 401) {
      return 'Your session expired. Please sign in again.';
    }
    return error.message;
  }
  if (error instanceof TypeError) {
    return 'Could not reach the server. Check your internet connection and try again.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export default function AssistantScreen() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [applyingMessageId, setApplyingMessageId] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState<string | null>(null);

  const [autoSave, setAutoSave] = useState(false);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferenceError, setPreferenceError] = useState<string | null>(null);

  const [picker, setPicker] = useState<{ messageId: string; draftId: string } | null>(null);
  const [pendingAction, setPendingAction] = useState<{ messageId: string } | null>(null);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversations, setConversations] = useState<AssistantConversationSummary[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [usage, setUsage] = useState<AssistantUsageStats | null>(null);

  const [undo, setUndo] = useState<{
    messageId: string;
    transactionIds: string[];
    expiresAt: number;
  } | null>(null);
  const [undoSeconds, setUndoSeconds] = useState(0);
  const [isUndoing, setIsUndoing] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!accessToken) return;

    void (async () => {
      try {
        setCategories(await listCategories(accessToken));
      } catch (error) {
        setCategoriesError(error instanceof Error ? error.message : 'Could not load categories');
      }
    })();

    void (async () => {
      try {
        const preferences = await getAssistantPreferences(accessToken);
        setAutoSave(preferences.autoSave);
      } catch {
        // Optional preference; default to review-before-save.
      } finally {
        setPreferencesReady(true);
      }
    })();
  }, [accessToken]);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
    return () => clearTimeout(timer);
  }, [messages, isSending]);

  useEffect(() => {
    if (!undo) {
      setUndoSeconds(0);
      return;
    }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((undo.expiresAt - Date.now()) / 1000));
      setUndoSeconds(remaining);
      if (remaining <= 0) setUndo(null);
    };

    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [undo]);

  function updateDraft(messageId: string, draftId: string, patch: Partial<Draft>) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? {
              ...message,
              drafts: message.drafts?.map((draft) =>
                draft.id === draftId ? { ...draft, ...patch } : draft,
              ),
            }
          : message,
      ),
    );
  }

  function removeDraft(messageId: string, draftId: string) {
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId
          ? { ...message, drafts: message.drafts?.filter((draft) => draft.id !== draftId) }
          : message,
      ),
    );
  }

  function setMessageError(messageId: string, error: string) {
    setMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, error } : message)),
    );
  }

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput('');
    await sendText(text);
  }

  async function sendText(text: string) {
    if (!text || isSending || !accessToken) return;

    const userMessage: ChatMessage = { id: newId(), role: 'user', content: text };
    const history: AssistantHistoryMessage[] = conversationId
      ? []
      : messages
          .filter((message) => !message.error && message.id !== 'welcome')
          .slice(-8)
          .map((message) => ({ role: message.role, content: message.content }));

    setMessages((current) => [...current, userMessage]);
    setIsSending(true);

    try {
      const result = await parseAssistantMessage(
        {
          message: text,
          ...(history.length > 0 ? { history } : {}),
          ...(conversationId ? { conversationId } : {}),
          timezone: getTimeZone(),
          now: new Date().toISOString(),
        },
        accessToken,
      );

      const resolvedConversationId = result.conversationId ?? conversationId;
      if (result.conversationId) setConversationId(result.conversationId);

      const assistantMessage = assistantMessageFromResult(result);
      setMessages((current) => [...current, assistantMessage]);

      if (
        autoSave &&
        result.intent === 'ADD_TRANSACTIONS' &&
        (assistantMessage.drafts?.length ?? 0) > 0
      ) {
        await saveDrafts(
          assistantMessage.id,
          assistantMessage.drafts!,
          resolvedConversationId,
          true,
        );
      }
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          id: newId(),
          role: 'assistant',
          content: '',
          error: describeAssistantError(error),
          retryText: text,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  async function saveDrafts(
    messageId: string,
    drafts: Draft[],
    targetConversationId: string | null,
    isAuto = false,
  ) {
    if (!accessToken) return;

    const validationError = validateDrafts(drafts);
    if (validationError) {
      setMessageError(messageId, validationError);
      return;
    }

    setSavingMessageId(messageId);
    setMessages((current) =>
      current.map((message) =>
        message.id === messageId ? { ...message, error: undefined } : message,
      ),
    );

    try {
      const transactions = await confirmAssistantProposals(
        {
          requestId: newId(),
          ...(targetConversationId ? { conversationId: targetConversationId } : {}),
          proposals: drafts.map((draft) => ({
            amount: draft.amount,
            ...(draft.categoryId
              ? { categoryId: draft.categoryId }
              : {
                  newCategory: {
                    name: draft.newCategoryName.trim(),
                    type: draft.type,
                  },
                }),
            note: draft.note.trim() || null,
            date: draft.date,
          })),
        },
        accessToken,
      );

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                saved: true,
                savedCount: transactions.length,
                autoSaved: isAuto,
                undone: false,
                error: undefined,
              }
            : message,
        ),
      );

      if (transactions.length > 0) {
        setUndo({
          messageId,
          transactionIds: transactions.map((transaction) => transaction.id),
          expiresAt: Date.now() + UNDO_WINDOW_MS,
        });
      }

      setCategories(await listCategories(accessToken).catch(() => categories));
    } catch (error) {
      setMessageError(messageId, describeAssistantError(error));
    } finally {
      setSavingMessageId(null);
    }
  }

  async function handleUndo() {
    if (!undo || !accessToken || isUndoing) return;
    const current = undo;

    setIsUndoing(true);
    try {
      await undoAssistantTransactions(
        { transactionIds: current.transactionIds, requestId: newId() },
        accessToken,
      );

      setMessages((messages) =>
        messages.map((message) =>
          message.id === current.messageId
            ? { ...message, saved: false, savedCount: 0, undone: true }
            : message,
        ),
      );
      setUndo(null);
    } catch (error) {
      setMessageError(current.messageId, describeAssistantError(error));
    } finally {
      setIsUndoing(false);
    }
  }

  function requestApply(message: ChatMessage) {
    const hasDelete = (message.operations ?? []).some((operation) => operation.action === 'DELETE');
    const hasPayments = (message.debtPayments?.length ?? 0) > 0;

    if (hasDelete || hasPayments) {
      setPendingAction({ messageId: message.id });
      return;
    }

    void applyMessage(message.id);
  }

  async function applyMessage(messageId: string) {
    if (!accessToken) return;
    const message = messages.find((item) => item.id === messageId);
    if (!message) return;

    const operations = message.operations ?? [];
    const debtPayments = message.debtPayments ?? [];
    if (operations.length === 0 && debtPayments.length === 0) return;

    setApplyingMessageId(messageId);
    setMessages((current) =>
      current.map((item) => (item.id === messageId ? { ...item, error: undefined } : item)),
    );

    try {
      await applyAssistantActions(
        {
          requestId: newId(),
          ...(conversationId ? { conversationId } : {}),
          ...(operations.length > 0 ? { operations: operations.map(toApplyOperation) } : {}),
          ...(debtPayments.length > 0
            ? {
                debtPayments: debtPayments.map((payment) => ({
                  debtId: payment.debtId,
                  amount: payment.amount,
                  date: payment.date,
                  note: payment.note,
                })),
              }
            : {}),
        },
        accessToken,
      );

      setMessages((current) =>
        current.map((item) =>
          item.id === messageId
            ? {
                ...item,
                applied: true,
                appliedCount: operations.length + debtPayments.length,
                error: undefined,
              }
            : item,
        ),
      );
    } catch (error) {
      setMessageError(messageId, describeAssistantError(error));
    } finally {
      setApplyingMessageId(null);
    }
  }

  async function toggleAutoSave(next: boolean) {
    if (!accessToken) return;
    const previous = autoSave;

    setAutoSave(next);
    setPreferenceError(null);

    try {
      const result = await updateAssistantPreferences({ autoSave: next }, accessToken);
      setAutoSave(result.autoSave);
    } catch (error) {
      setAutoSave(previous);
      setPreferenceError(
        error instanceof Error ? error.message : 'Could not update the auto-save preference.',
      );
    }
  }

  function resetChat() {
    setMessages([WELCOME]);
    setInput('');
    setConversationId(null);
    setUndo(null);
    setIsSending(false);
    setSavingMessageId(null);
    setApplyingMessageId(null);
    setHistoryOpen(false);
  }

  async function openHistory() {
    if (!accessToken) return;

    setHistoryOpen(true);
    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const [list, usageStats] = await Promise.all([
        listAssistantConversations(accessToken),
        getAssistantUsage(accessToken).catch(() => null),
      ]);
      setConversations(list);
      setUsage(usageStats);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load conversations.');
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function loadConversation(id: string) {
    if (!accessToken) return;

    setIsLoadingHistory(true);
    setHistoryError(null);

    try {
      const detail = await getAssistantConversation(id, accessToken);
      const restored = storedToMessages(detail.messages);
      setConversationId(detail.conversation.id);
      setMessages(restored.length > 0 ? restored : [WELCOME]);
      setHistoryOpen(false);
      setUndo(null);
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'Could not load that conversation.');
    } finally {
      setIsLoadingHistory(false);
    }
  }

  async function removeConversation(id: string) {
    if (!accessToken) return;

    try {
      await deleteAssistantConversation(id, accessToken);
      setConversations((current) => current.filter((item) => item.id !== id));
      if (conversationId === id) resetChat();
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : 'Could not delete that conversation.',
      );
    }
  }

  function chooseCategory(category: Category) {
    if (!picker) return;
    updateDraft(picker.messageId, picker.draftId, {
      categoryId: category.id,
      categoryName: category.name,
      type: category.type,
      newCategoryName: '',
    });
    setPicker(null);
  }

  function chooseNewCategory() {
    if (!picker) return;

    const message = messages.find((item) => item.id === picker.messageId);
    const draft = message?.drafts?.find((item) => item.id === picker.draftId);

    updateDraft(picker.messageId, picker.draftId, {
      categoryId: null,
      categoryName: null,
      newCategoryName: draft?.suggestedCategoryName ?? draft?.newCategoryName ?? '',
    });
    setPicker(null);
  }

  const pendingMessage = pendingAction
    ? messages.find((message) => message.id === pendingAction.messageId)
    : null;
  const pendingDeletes =
    pendingMessage?.operations?.filter((operation) => operation.action === 'DELETE') ?? [];
  const pendingHasPayment = (pendingMessage?.debtPayments?.length ?? 0) > 0;

  const confirmMessage = (() => {
    const parts: string[] = [];
    if (pendingDeletes.length > 0) {
      parts.push(
        pendingDeletes.length === 1
          ? `Delete "${pendingDeletes[0]!.before.note || pendingDeletes[0]!.before.categoryName}" (${formatCurrency(pendingDeletes[0]!.before.amount)})? This cannot be undone.`
          : `Delete ${pendingDeletes.length} transactions? This cannot be undone.`,
      );
    }
    if (pendingHasPayment && pendingMessage?.debtPayments?.[0]) {
      const payment = pendingMessage.debtPayments[0];
      parts.push(
        `Record ${formatCurrency(payment.amount)} for ${payment.partyName}?`,
      );
    }
    return parts.join('\n\n');
  })();

  function renderDraft(message: ChatMessage, draft: Draft) {
    const palette = TYPE_COLORS[draft.type];
    const disabled = Boolean(message.saved) || savingMessageId === message.id;

    return (
      <View
        key={draft.id}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <View style={styles.row}>
            <View
              style={[
                styles.badge,
                { backgroundColor: theme.isDark ? palette.darkBg : palette.bg },
              ]}>
              <Text style={{ color: theme.isDark ? palette.darkText : palette.text, fontSize: 11, fontWeight: '600' }}>
                {TYPE_LABEL[draft.type]}
              </Text>
            </View>
            <Text style={{ color: theme.muted, fontSize: 11 }}>
              {Math.round(draft.confidence * 100)}% confident
            </Text>
          </View>
          <Pressable onPress={() => removeDraft(message.id, draft.id)} disabled={disabled} hitSlop={8}>
            <Ionicons name="close" size={16} color={theme.muted} />
          </Pressable>
        </View>

        <View style={styles.fieldRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.muted }]}>Amount</Text>
            <TextInput
              value={draft.amount ? String(draft.amount) : ''}
              onChangeText={(text) =>
                updateDraft(message.id, draft.id, { amount: Number(text) || 0 })
              }
              editable={!disabled}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={theme.muted}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.border }]}
            />
          </View>

          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: theme.muted }]}>Category</Text>
            <Pressable
              onPress={() => setPicker({ messageId: message.id, draftId: draft.id })}
              disabled={disabled}
              style={[styles.input, styles.pickerButton, { borderColor: theme.border }]}>
              <Text
                numberOfLines={1}
                style={{ color: theme.colors.text, fontSize: 14, flex: 1 }}>
                {draft.categoryName ||
                  (draft.newCategoryName ? `New: ${draft.newCategoryName}` : 'Choose')}
              </Text>
              <Ionicons name="chevron-down" size={14} color={theme.muted} />
            </Pressable>
          </View>
        </View>

        {draft.categoryId === null && (
          <View style={{ marginTop: 8 }}>
            <Text style={[styles.label, { color: theme.muted }]}>New category name</Text>
            <TextInput
              value={draft.newCategoryName}
              onChangeText={(text) => updateDraft(message.id, draft.id, { newCategoryName: text })}
              editable={!disabled}
              placeholder={draft.suggestedCategoryName ?? 'e.g. Groceries'}
              placeholderTextColor={theme.muted}
              style={[styles.input, { color: theme.colors.text, borderColor: theme.border }]}
            />
          </View>
        )}

        <View style={{ marginTop: 8 }}>
          <Text style={[styles.label, { color: theme.muted }]}>Note</Text>
          <TextInput
            value={draft.note}
            onChangeText={(text) => updateDraft(message.id, draft.id, { note: text })}
            editable={!disabled}
            placeholder="Merchant or description"
            placeholderTextColor={theme.muted}
            style={[styles.input, { color: theme.colors.text, borderColor: theme.border }]}
          />
        </View>

        <Text style={{ color: theme.muted, fontSize: 11, marginTop: 8 }}>
          {formatDateTime(draft.date)} · {formatCurrency(draft.amount || 0)}
        </Text>
      </View>
    );
  }

  function renderOperation(message: ChatMessage, operation: AssistantOperation) {
    const isDelete = operation.action === 'DELETE';
    const before = operation.before;
    const after = operation.after;
    const applied = Boolean(message.applied);

    return (
      <View
        key={`${operation.transactionId}-${operation.action}`}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <View
            style={[
              styles.badge,
              {
                backgroundColor: isDelete
                  ? theme.isDark
                    ? '#7f1d1d'
                    : '#fee2e2'
                  : theme.isDark
                    ? '#1e3a8a'
                    : '#dbeafe',
              },
            ]}>
            <Text
              style={{
                color: isDelete
                  ? theme.isDark
                    ? '#fca5a5'
                    : '#b91c1c'
                  : theme.isDark
                    ? '#93c5fd'
                    : '#1d4ed8',
                fontSize: 11,
                fontWeight: '600',
              }}>
              {isDelete ? 'Delete' : 'Edit'}
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 11 }}>
            {Math.round(operation.confidence * 100)}% confident
          </Text>
        </View>

        <Text style={{ color: theme.colors.text, fontSize: 13, marginTop: 8 }}>
          {before.categoryName} · {formatCurrency(before.amount)}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
          {formatDateTime(before.date)}
          {before.note ? ` · ${before.note}` : ''}
        </Text>

        {after && (
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            }}>
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
              {after.categoryName} · {formatCurrency(after.amount)}
            </Text>
            <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
              {formatDateTime(after.date)}
              {after.note ? ` · ${after.note}` : ''}
            </Text>
          </View>
        )}

        {applied ? (
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginTop: 10 }}>
            Applied.
          </Text>
        ) : (
          <Pressable
            onPress={() => requestApply(message)}
            disabled={applyingMessageId === message.id}
            style={[
              styles.primaryButton,
              {
                backgroundColor: isDelete ? theme.danger : theme.primary,
                opacity: applyingMessageId === message.id ? 0.6 : 1,
                marginTop: 10,
              },
            ]}>
            <Text style={styles.primaryButtonText}>
              {applyingMessageId === message.id
                ? 'Applying…'
                : isDelete
                  ? 'Delete transaction'
                  : 'Apply edit'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderDebtPayment(message: ChatMessage, payment: AssistantDebtPayment) {
    const applied = Boolean(message.applied);

    return (
      <View
        key={payment.debtId}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <View style={[styles.badge, { backgroundColor: theme.isDark ? '#78350f' : '#fef3c7' }]}>
            <Text style={{ color: theme.isDark ? '#fcd34d' : '#b45309', fontSize: 11, fontWeight: '600' }}>
              Debt payment
            </Text>
          </View>
          <Text style={{ color: theme.muted, fontSize: 11 }}>
            {Math.round(payment.confidence * 100)}% confident
          </Text>
        </View>

        <Text style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600', marginTop: 8 }}>
          {payment.debtType === 'TAKEN' ? 'Paid to' : 'Received from'} {payment.partyName}
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 18, fontWeight: '700', marginTop: 4 }}>
          {formatCurrency(payment.amount)}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 4 }}>
          Outstanding {formatCurrency(payment.outstandingBefore)} →{' '}
          {formatCurrency(payment.outstandingAfter)}
        </Text>
        <Text style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}>
          {formatDateTime(payment.date)}
          {payment.note ? ` · ${payment.note}` : ''}
        </Text>

        {applied ? (
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: '600', marginTop: 10 }}>
            Payment recorded.
          </Text>
        ) : (
          <Pressable
            onPress={() => requestApply(message)}
            disabled={applyingMessageId === message.id}
            style={[
              styles.primaryButton,
              {
                backgroundColor: theme.primary,
                opacity: applyingMessageId === message.id ? 0.6 : 1,
                marginTop: 10,
              },
            ]}>
            <Text style={styles.primaryButtonText}>
              {applyingMessageId === message.id ? 'Recording…' : 'Record payment'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderQuery(result: AssistantQueryResult) {
    const types = TYPE_ORDER.filter((type) => result.totals[type] > 0);

    return (
      <View
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
            {result.periodLabel}
          </Text>
          <Text style={{ color: theme.muted, fontSize: 11 }}>
            {result.count} transaction{result.count === 1 ? '' : 's'}
          </Text>
        </View>

        {types.length > 0 && (
          <View style={styles.totalsGrid}>
            {types.map((type) => {
              const palette = TYPE_COLORS[type];
              return (
                <View
                  key={type}
                  style={[
                    styles.totalBox,
                    {
                      backgroundColor: theme.isDark ? palette.darkBg : palette.bg,
                    },
                  ]}>
                  <Text
                    style={{
                      color: theme.isDark ? palette.darkText : palette.text,
                      fontSize: 10,
                      fontWeight: '600',
                      textTransform: 'uppercase',
                    }}>
                    {TYPE_LABEL[type]}
                  </Text>
                  <Text
                    style={{
                      color: theme.isDark ? palette.darkText : palette.text,
                      fontSize: 14,
                      fontWeight: '700',
                      marginTop: 2,
                    }}>
                    {formatCurrency(result.totals[type], 0)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {result.metric === 'TOTAL' &&
          result.byCategory.map((category) => (
            <View key={category.id} style={styles.rowBetween}>
              <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {category.name}
              </Text>
              <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
                {formatCurrency(category.total, 0)}
              </Text>
            </View>
          ))}

        {result.metric === 'LIST' &&
          result.transactions.map((transaction) => (
            <View key={transaction.id} style={[styles.rowBetween, { marginTop: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}
                  numberOfLines={1}>
                  {transaction.note || transaction.categoryName}
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11 }}>
                  {formatDateTime(transaction.date)} · {transaction.categoryName}
                </Text>
              </View>
              <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
                {formatCurrency(transaction.amount, 0)}
              </Text>
            </View>
          ))}

        {types.length === 0 && result.transactions.length === 0 && (
          <Text style={{ color: theme.muted, fontSize: 12, marginTop: 6 }}>
            No matching transactions for this period.
          </Text>
        )}

        {(result.metric === 'TOTAL' || result.metric === 'COUNT') && result.count > 0 && (
          <Text
            style={{
              color: theme.muted,
              fontSize: 11,
              marginTop: 10,
              paddingTop: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: theme.border,
            }}>
            Net for the period: {formatCurrency(result.net, 0)}
          </Text>
        )}
      </View>
    );
  }

  function renderMessage(message: ChatMessage) {
    if (message.role === 'user') {
      return (
        <View key={message.id} style={styles.userRow}>
          <View style={[styles.userBubble, { backgroundColor: theme.primary }]}>
            <Text style={{ color: '#fff', fontSize: 14 }}>{message.content}</Text>
          </View>
        </View>
      );
    }

    const drafts = message.drafts ?? [];
    const operations = message.operations ?? [];
    const debtPayments = message.debtPayments ?? [];
    const actionCount = operations.length + debtPayments.length;

    return (
      <View key={message.id} style={{ marginBottom: 16 }}>
        {message.content ? (
          <View
            style={[
              styles.assistantBubble,
              { backgroundColor: theme.isDark ? '#18181b' : '#f4f4f5' },
            ]}>
            <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>
              {message.content}
            </Text>
          </View>
        ) : null}

        {(message.clarifications?.length ?? 0) > 0 && (
          <View
            style={[
              styles.clarification,
              {
                backgroundColor: theme.isDark ? '#451a03' : '#fffbeb',
                borderColor: theme.isDark ? '#78350f' : '#fde68a',
              },
            ]}>
            {message.clarifications!.map((clarification) => (
              <Text
                key={clarification}
                style={{ color: theme.isDark ? '#fcd34d' : '#92400e', fontSize: 12, lineHeight: 18 }}>
                • {clarification}
              </Text>
            ))}
          </View>
        )}

        {message.queryResult && <View style={{ marginTop: 8 }}>{renderQuery(message.queryResult)}</View>}

        {drafts.length > 0 && (
          <View style={{ marginTop: 8, gap: 8 }}>
            {drafts.map((draft) => renderDraft(message, draft))}
          </View>
        )}

        {operations.length > 0 && (
          <View style={{ marginTop: 8, gap: 8 }}>
            {operations.map((operation) => renderOperation(message, operation))}
          </View>
        )}

        {debtPayments.length > 0 && (
          <View style={{ marginTop: 8, gap: 8 }}>
            {debtPayments.map((payment) => renderDebtPayment(message, payment))}
          </View>
        )}

        {actionCount > 1 && !message.applied && (
          <Pressable
            onPress={() => requestApply(message)}
            disabled={applyingMessageId === message.id}
            style={[
              styles.primaryButton,
              {
                backgroundColor: theme.primary,
                marginTop: 8,
                opacity: applyingMessageId === message.id ? 0.6 : 1,
              },
            ]}>
            <Text style={styles.primaryButtonText}>
              {applyingMessageId === message.id ? 'Applying…' : `Apply ${actionCount} changes`}
            </Text>
          </Pressable>
        )}

        {message.error && (
          <View
            style={[
              styles.errorBox,
              {
                backgroundColor: theme.isDark ? '#450a0a' : '#fef2f2',
                borderColor: theme.isDark ? '#7f1d1d' : '#fecaca',
              },
            ]}>
            <Text style={{ color: theme.isDark ? '#fca5a5' : '#b91c1c', fontSize: 12 }}>
              {message.error}
            </Text>

            {message.retryText ? (
              <View style={styles.errorActions}>
                <Pressable
                  onPress={() => {
                    const retryText = message.retryText;
                    if (!retryText || isSending) return;
                    setMessages((current) => current.filter((item) => item.id !== message.id));
                    void sendText(retryText);
                  }}
                  disabled={isSending}
                  style={[styles.errorButton, { borderColor: theme.danger }]}>
                  <Text style={{ color: theme.danger, fontSize: 12, fontWeight: '600' }}>
                    Try again
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => router.push('/transactions/new')}
                  style={[styles.errorButton, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
                    Add manually
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        )}

        {message.saved && (
          <View
            style={[
              styles.successBox,
              {
                backgroundColor: theme.isDark ? '#052e16' : '#ecfdf5',
                borderColor: theme.isDark ? '#065f46' : '#a7f3d0',
              },
            ]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
            <Text style={{ color: theme.isDark ? '#6ee7b7' : '#047857', fontSize: 12, flex: 1 }}>
              {message.autoSaved ? 'Auto-saved' : 'Saved'}{' '}
              {message.savedCount ?? drafts.length} transaction
              {(message.savedCount ?? drafts.length) === 1 ? '' : 's'}.
            </Text>
            {undo?.messageId === message.id && (
              <Pressable onPress={() => void handleUndo()} disabled={isUndoing} hitSlop={6}>
                <Text
                  style={{
                    color: theme.isDark ? '#6ee7b7' : '#047857',
                    fontSize: 12,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}>
                  {isUndoing ? 'Undoing…' : `Undo (${undoSeconds}s)`}
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {message.undone && (
          <View
            style={[
              styles.infoBox,
              { backgroundColor: theme.isDark ? '#18181b' : '#f4f4f5', borderColor: theme.border },
            ]}>
            <Text style={{ color: theme.muted, fontSize: 12 }}>
              Undone — the saved transactions were removed.
            </Text>
          </View>
        )}

        {message.applied && actionCount === 0 && (
          <View
            style={[
              styles.successBox,
              {
                backgroundColor: theme.isDark ? '#052e16' : '#ecfdf5',
                borderColor: theme.isDark ? '#065f46' : '#a7f3d0',
              },
            ]}>
            <Ionicons name="checkmark-circle" size={16} color={theme.primary} />
            <Text style={{ color: theme.isDark ? '#6ee7b7' : '#047857', fontSize: 12 }}>
              Applied {message.appliedCount ?? 0} change
              {(message.appliedCount ?? 0) === 1 ? '' : 's'}.
            </Text>
          </View>
        )}

        {drafts.length > 0 && !message.saved && !message.undone && (
          <Pressable
            onPress={() => {
              if (!accessToken) return;
              void saveDrafts(message.id, drafts, conversationId, false);
            }}
            disabled={savingMessageId === message.id}
            style={[
              styles.primaryButton,
              {
                backgroundColor: theme.primary,
                marginTop: 8,
                opacity: savingMessageId === message.id ? 0.6 : 1,
              },
            ]}>
            <Text style={styles.primaryButtonText}>
              {savingMessageId === message.id
                ? 'Saving…'
                : `Save ${drafts.length} transaction${drafts.length === 1 ? '' : 's'}`}
            </Text>
          </Pressable>
        )}

        {message.undone && drafts.length > 0 && (
          <Pressable
            onPress={() => {
              if (!accessToken) return;
              void saveDrafts(message.id, drafts, conversationId, false);
            }}
            disabled={savingMessageId === message.id}
            style={[
              styles.secondaryButton,
              { borderColor: theme.primary, marginTop: 8 },
            ]}>
            <Text style={{ color: theme.primary, fontWeight: '600', fontSize: 13 }}>
              {savingMessageId === message.id ? 'Saving…' : 'Save again'}
            </Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      <View style={[styles.actionBar, { borderBottomColor: theme.border }]}>
        <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
          {conversationId ? 'Continuing saved chat' : 'New chat'}
        </Text>
        <Pressable onPress={() => void openHistory()} style={styles.actionLink} hitSlop={6}>
          <Ionicons name="time-outline" size={16} color={theme.muted} />
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>Chats</Text>
        </Pressable>
        <Pressable onPress={resetChat} style={styles.actionLink} hitSlop={6}>
          <Ionicons name="add-circle-outline" size={16} color={theme.muted} />
          <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600' }}>New</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
        keyboardShouldPersistTaps="handled">
        {messages.map(renderMessage)}

        {messages.length === 1 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ color: theme.muted, fontSize: 12, fontWeight: '600', marginBottom: 8 }}>
              Try something like
            </Text>
            <View style={{ gap: 8 }}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => setInput(suggestion)}
                  style={[
                    styles.suggestion,
                    { borderColor: theme.border, backgroundColor: theme.card },
                  ]}>
                  <Text style={{ color: theme.colors.text, fontSize: 12 }}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {isSending && (
          <View style={[styles.assistantBubble, { backgroundColor: theme.isDark ? '#18181b' : '#f4f4f5' }]}>
            <ActivityIndicator size="small" color={theme.primary} />
          </View>
        )}
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <View style={styles.rowBetween}>
          <Text style={{ color: theme.muted, fontSize: 11, flex: 1 }}>
            Auto-save new transactions
          </Text>
          <Switch
            value={autoSave}
            onValueChange={(next) => void toggleAutoSave(next)}
            disabled={!preferencesReady}
            trackColor={{ false: theme.border, true: theme.primary }}
          />
        </View>
        <Text style={{ color: theme.muted, fontSize: 10, marginBottom: 8 }}>
          Edits, deletes, and debt payments always need confirmation. Undo is available for 10s.
        </Text>

        {(categoriesError || preferenceError) && (
          <Text style={{ color: theme.danger, fontSize: 11, marginBottom: 6 }}>
            {categoriesError ?? preferenceError}
          </Text>
        )}

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={1000}
            placeholder="Spent ₹450 on groceries yesterday…"
            placeholderTextColor={theme.muted}
            style={[
              styles.chatInput,
              { color: theme.colors.text, borderColor: theme.border, backgroundColor: theme.background },
            ]}
          />
          <Pressable
            onPress={() => void send()}
            disabled={isSending || !input.trim()}
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary, opacity: isSending || !input.trim() ? 0.5 : 1 },
            ]}>
            <Ionicons name="send" size={18} color="#fff" />
          </Pressable>
        </View>
        <Text style={{ color: theme.muted, fontSize: 10, marginTop: 6 }}>
          AI can make mistakes. Review before saving.
        </Text>
      </View>

      <ConfirmDialog
        visible={Boolean(pendingAction)}
        title={pendingHasPayment ? 'Record payment?' : 'Delete transaction?'}
        message={confirmMessage}
        confirmLabel={pendingHasPayment ? 'Record' : 'Delete'}
        onCancel={() => setPendingAction(null)}
        onConfirm={() => {
          if (!pendingAction) return;
          const messageId = pendingAction.messageId;
          setPendingAction(null);
          void applyMessage(messageId);
        }}
      />

      <Modal
        visible={Boolean(picker)}
        transparent
        animationType="fade"
        onRequestClose={() => setPicker(null)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPicker(null)} />
          <View style={[styles.panel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
              Choose category
            </Text>
            <ScrollView style={{ maxHeight: 420 }}>
              <Pressable
                onPress={chooseNewCategory}
                style={[styles.option, { borderColor: theme.border }]}>
                <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
                <Text style={{ color: theme.primary, fontSize: 14, fontWeight: '600' }}>
                  Create new category
                </Text>
              </Pressable>

              {TYPE_ORDER.map((type) => {
                const matching = categories.filter((category) => category.type === type);
                if (matching.length === 0) return null;

                return (
                  <View key={type} style={{ marginTop: 12 }}>
                    <Text
                      style={{
                        color: theme.muted,
                        fontSize: 11,
                        fontWeight: '700',
                        textTransform: 'uppercase',
                      }}>
                      {TYPE_LABEL[type]}
                    </Text>
                    {matching.map((category) => (
                      <Pressable
                        key={category.id}
                        onPress={() => chooseCategory(category)}
                        style={[styles.option, { borderColor: theme.border }]}>
                        <Text style={{ color: theme.colors.text, fontSize: 14 }}>
                          {category.name}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={historyOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setHistoryOpen(false)} />
          <View
            style={[
              styles.panel,
              { backgroundColor: theme.card, borderColor: theme.border, maxHeight: '80%' },
            ]}>
            <View style={styles.rowBetween}>
              <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: '700' }}>
                Recent chats
              </Text>
              <Pressable onPress={() => void openHistory()} hitSlop={8}>
                <Ionicons name="refresh" size={18} color={theme.muted} />
              </Pressable>
            </View>

            {isLoadingHistory && (
              <ActivityIndicator size="small" color={theme.primary} style={{ marginTop: 16 }} />
            )}

            {historyError && (
              <Text style={{ color: theme.danger, fontSize: 12, marginTop: 12 }}>
                {historyError}
              </Text>
            )}

            {!isLoadingHistory && conversations.length === 0 && !historyError && (
              <Text style={{ color: theme.muted, fontSize: 12, marginTop: 16 }}>
                No saved conversations yet.
              </Text>
            )}

            <ScrollView style={{ marginTop: 12 }}>
              {conversations.map((conversation) => (
                <View
                  key={conversation.id}
                  style={[styles.historyRow, { borderColor: theme.border }]}>
                  <Pressable
                    onPress={() => void loadConversation(conversation.id)}
                    style={{ flex: 1 }}>
                    <Text
                      style={{ color: theme.colors.text, fontSize: 14, fontWeight: '600' }}
                      numberOfLines={1}>
                      {conversation.title}
                    </Text>
                    {conversation.preview && (
                      <Text
                        style={{ color: theme.muted, fontSize: 12, marginTop: 2 }}
                        numberOfLines={2}>
                        {conversation.preview}
                      </Text>
                    )}
                    <Text style={{ color: theme.muted, fontSize: 10, marginTop: 4 }}>
                      {formatRelative(conversation.lastMessageAt)}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void removeConversation(conversation.id)}
                    hitSlop={8}
                    style={{ paddingLeft: 12 }}>
                    <Ionicons name="trash-outline" size={18} color={theme.muted} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>

            {usage && (
              <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }}>
                <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
                  Usage this month
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2 }}>
                  {usage.month.messages} messages · {usage.month.totalTokens.toLocaleString()} tokens ·{' '}
                  {usage.month.averageLatencyMs} ms average
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  userRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 16,
  },
  userBubble: {
    maxWidth: '85%',
    borderRadius: 18,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    maxWidth: '95%',
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  clarification: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 2,
  },
  card: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 38,
  },
  primaryButton: {
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  secondaryButton: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  errorBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  errorButton: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  successBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  totalsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  totalBox: {
    flexGrow: 1,
    minWidth: '45%',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  suggestion: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  footer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chatInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
