import ProposalEditor from '@/components/assistant/ProposalEditor';
import StatementReviewModal from '@/components/assistant/StatementReviewModal';
import { useThemeColors } from '@/hooks/use-theme-colors';
import {
  confirmAssistantActions,
  createAssistantThread,
  deleteAssistantThread,
  getAssistantPreferences,
  getAssistantStatus,
  getAssistantThread,
  getAssistantUsage,
  listAssistantThreads,
  listCategories,
  recordAssistantConsent,
  sendAssistantMessage,
  startStatementImport,
  undoAssistantBatch,
  updateAssistantPreferences,
  uploadAssistantAttachment,
  type AssistantConfirmItem,
  type AssistantImportSummary,
  type AssistantMessageRecord,
  type AssistantOperation,
  type AssistantPreferences,
  type AssistantQueryResult,
  type AssistantStatus,
  type AssistantThreadSummary,
  type AssistantTurnResponse,
  type AssistantUsage,
  type Category,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency, formatDateOnly } from '@/lib/format';
import { Ionicons } from '@expo/vector-icons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

const SUGGESTIONS = [
  'Spent 450 on groceries yesterday',
  'Got salary 85,000 today',
  'How much did I spend on food this month?',
];

const EFFORT_LABEL: Record<'low' | 'high' | 'max', string> = {
  low: 'Low',
  high: 'High',
  max: 'Max',
};

function ReasoningBlock({ reasoning }: { reasoning: string }) {
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <View style={[styles.reasoningBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Pressable onPress={() => setOpen((value) => !value)} style={styles.reasoningHeader}>
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color={theme.muted} />
        <Text style={{ color: theme.muted, fontSize: 11, fontWeight: '600' }}>
          {open ? 'Hide thinking' : 'Show thinking'}
        </Text>
      </Pressable>
      {open && (
        <ScrollView style={{ maxHeight: 220 }}>
          <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 17, padding: 10 }}>
            {reasoning}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function QueryResultCard({ result }: { result: AssistantQueryResult }) {
  const theme = useThemeColors();
  return (
    <View style={[styles.queryCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
      <Text style={{ color: theme.muted, fontSize: 11, textTransform: 'uppercase' }}>
        {result.count} transaction{result.count === 1 ? '' : 's'}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 22, fontWeight: '800', marginTop: 2 }}>
        {formatCurrency(result.total, 0)}
      </Text>
      {result.groups.slice(0, 4).map((group) => (
        <View key={group.key} style={styles.groupRow}>
          <Text style={{ color: theme.muted, fontSize: 12, flex: 1 }} numberOfLines={1}>
            {group.key}
          </Text>
          <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: '600' }}>
            {formatCurrency(group.total, 0)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OperationRow({
  operation,
  disabled,
  onConfirm,
}: {
  operation: AssistantOperation;
  disabled?: boolean;
  onConfirm: (item: AssistantConfirmItem) => Promise<void>;
}) {
  const theme = useThemeColors();
  const [working, setWorking] = useState(false);
  const isDelete = operation.kind === 'DELETE';

  async function confirm() {
    setWorking(true);
    try {
      await onConfirm(
        isDelete
          ? { kind: 'DELETE', targetId: operation.targetId, operationId: operation.operationId }
          : {
              kind: 'UPDATE',
              targetId: operation.targetId,
              changes: operation.changes,
              operationId: operation.operationId,
            },
      );
    } catch (error) {
      Alert.alert('Could not apply change', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setWorking(false);
    }
  }

  return (
    <View
      style={[
        styles.operationCard,
        {
          borderColor: isDelete ? '#fecaca' : '#fde68a',
          backgroundColor: isDelete ? '#fef2f2' : '#fffbeb',
        },
      ]}>
      <Text style={{ color: isDelete ? theme.danger : '#92400e', fontSize: 11, fontWeight: '800' }}>
        {isDelete ? 'DELETE' : 'EDIT'}
      </Text>
      <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
        {operation.before.categoryName} · {formatCurrency(operation.before.amount)} ·{' '}
        {formatDateOnly(operation.before.date)}
      </Text>
      {operation.before.note ? (
        <Text style={{ color: theme.muted, fontSize: 12 }}>“{operation.before.note}”</Text>
      ) : null}
      {!isDelete && operation.after ? (
        <Text style={{ color: theme.colors.text, fontSize: 12, marginTop: 6 }}>
          → {operation.after.categoryName} · {formatCurrency(operation.after.amount)}
        </Text>
      ) : null}
      <View style={styles.operationActions}>
        <Pressable
          onPress={() =>
            Alert.alert(
              isDelete ? 'Delete transaction?' : 'Apply this change?',
              isDelete ? 'You can undo it for 10 seconds.' : 'The transaction will be updated.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: isDelete ? 'Delete' : 'Confirm',
                  style: isDelete ? 'destructive' : 'default',
                  onPress: () => void confirm(),
                },
              ],
            )
          }
          disabled={working || disabled}
          style={[
            styles.operationButton,
            { backgroundColor: isDelete ? theme.danger : '#d97706', opacity: working ? 0.6 : 1 },
          ]}>
          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
            {working ? 'Working…' : isDelete ? 'Delete' : 'Review change'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function MessageBubble({
  message,
  categories,
  disabled,
  onConfirm,
}: {
  message: AssistantMessageRecord;
  categories: Category[];
  disabled?: boolean;
  onConfirm: (items: AssistantConfirmItem[], messageId: string) => Promise<void>;
}) {
  const theme = useThemeColors();
  const isUser = message.role === 'user';
  const turn = message.turn;

  if (isUser) {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Text style={{ color: '#fff', fontSize: 14 }}>
            {message.kind === 'IMAGE'
              ? `Bill photo${message.attachment?.filename ? ` · ${message.attachment.filename}` : ''}`
              : message.text ?? 'Voice note'}
          </Text>
        </View>
      </View>
    );
  }

  const savedProposals = new Set(turn?.savedProposalIds ?? []);
  const savedOperations = new Set(turn?.savedOperationIds ?? []);
  const proposals = turn?.proposals.filter((p) => !savedProposals.has(p.proposalId)) ?? [];
  const operations = turn?.operations.filter((o) => !savedOperations.has(o.operationId)) ?? [];

  return (
    <View style={styles.assistantRow}>
      <View style={{ maxWidth: '94%', gap: 6 }}>
        <View style={[styles.assistantBubble, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={{ color: theme.colors.text, fontSize: 14, lineHeight: 20 }}>
            {turn?.reply || message.text || '…'}
          </Text>
        </View>
        {message.reasoning ? <ReasoningBlock reasoning={message.reasoning} /> : null}
        {turn?.clarifications?.map((clarification) => (
          <View key={clarification} style={styles.clarification}>
            <Text style={{ color: '#92400e', fontSize: 11 }}>{clarification}</Text>
          </View>
        ))}
        {proposals.map((proposal) => (
          <ProposalEditor
            key={proposal.proposalId}
            proposal={proposal}
            categories={categories}
            disabled={disabled}
            onSave={(item) => onConfirm([item], message.id)}
          />
        ))}
        {operations.map((operation) => (
          <OperationRow
            key={operation.operationId}
            operation={operation}
            disabled={disabled}
            onConfirm={(item) => onConfirm([item], message.id)}
          />
        ))}
        {turn?.queryResult ? <QueryResultCard result={turn.queryResult} /> : null}
      </View>
    </View>
  );
}

export default function AssistantScreen() {
  const { accessToken } = useAuth();
  const theme = useThemeColors();

  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [preferences, setPreferences] = useState<AssistantPreferences | null>(null);
  const [threads, setThreads] = useState<AssistantThreadSummary[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessageRecord[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [uploadLabel, setUploadLabel] = useState<string | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [statementOpen, setStatementOpen] = useState(false);
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const [statementImport, setStatementImport] = useState<AssistantImportSummary | null>(null);
  const [consentDismissed, setConsentDismissed] = useState(false);

  const scrollRef = useRef<ScrollView>(null);
  const stopRecordingRef = useRef<() => Promise<void>>(async () => {});
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [voiceBusy, setVoiceBusy] = useState(false);

  const refreshThreads = useCallback(async () => {
    if (!accessToken) return;
    try {
      setThreads(await listAssistantThreads(accessToken));
    } catch {
      // Non-fatal.
    }
  }, [accessToken]);

  const loadThread = useCallback(
    async (id: string) => {
      if (!accessToken) return;
      const detail = await getAssistantThread(id, accessToken);
      setThreadId(id);
      setMessages(detail.messages);
    },
    [accessToken],
  );

  useEffect(() => {
    if (!accessToken) return;
    let mounted = true;

    async function load() {
      try {
        const [nextStatus, prefs, cats, nextThreads, nextUsage] = await Promise.all([
          getAssistantStatus(accessToken!),
          getAssistantPreferences(accessToken!),
          listCategories(accessToken!),
          listAssistantThreads(accessToken!),
          getAssistantUsage(accessToken!),
        ]);
        if (!mounted) return;
        setStatus(nextStatus);
        setPreferences(prefs);
        setCategories(cats);
        setThreads(nextThreads);
        setUsage(nextUsage);
        if (nextThreads[0]) await loadThread(nextThreads[0].id);
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : 'Could not load the assistant.');
      } finally {
        if (mounted) setIsLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= 118_000) {
      void stopRecordingRef.current();
    }
  }, [recorderState.durationMillis, recorderState.isRecording]);

  const consentRequired = Boolean(status?.enabled) && (status?.consentRequired ?? false);
  const disabled = isSending || voiceBusy || !status?.enabled || consentRequired;

  async function ensureThread(): Promise<string> {
    if (!accessToken) throw new Error('Please sign in again.');
    if (threadId) return threadId;
    const thread = await createAssistantThread(accessToken);
    setThreadId(thread.id);
    await refreshThreads();
    return thread.id;
  }

  async function reload(id: string) {
    await loadThread(id);
    await refreshThreads();
    if (accessToken) {
      getAssistantUsage(accessToken).then(setUsage).catch(() => {});
    }
  }

  function afterTurn(response: AssistantTurnResponse) {
    if (response.autoSaved) {
      Alert.alert(
        'Saved',
        `${response.autoSaved.created} transaction${response.autoSaved.created === 1 ? '' : 's'} saved.`,
        [
          { text: 'OK' },
          {
            text: 'Undo',
            onPress: () => void undo(response.autoSaved!.batchId),
          },
        ],
      );
    }
    if (response.autoSaveError) Alert.alert('Could not auto-save', response.autoSaveError);
  }

  async function send(text?: string) {
    const value = (text ?? input).trim();
    if (!value || disabled || !accessToken) return;
    if (consentRequired) {
      Alert.alert('One-time notice', 'Please accept the assistant privacy notice first.');
      return;
    }

    setIsSending(true);
    setError(null);
    setInput('');
    setPendingText(value);

    try {
      const id = await ensureThread();
      const response = await sendAssistantMessage(
        id,
        { text: value, ...(preferences?.timezone ? { timezone: preferences.timezone } : {}) },
        accessToken,
      );
      await reload(id);
      afterTurn(response);
    } catch (sendError) {
      setInput(value);
      const message = sendError instanceof Error ? sendError.message : 'Could not send that message.';
      setError(message);
      Alert.alert('Assistant', message);
    } finally {
      setPendingText(null);
      setIsSending(false);
    }
  }

  async function confirm(items: AssistantConfirmItem[], messageId: string) {
    if (!accessToken) throw new Error('Please sign in again.');
    const result = await confirmAssistantActions(
      {
        clientRequestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ...(threadId ? { threadId } : {}),
        messageId,
        ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
        items,
      },
      accessToken,
    );
    if (threadId) await reload(threadId);
    const count = result.created + result.updated + result.deleted;
    Alert.alert('Saved', `${count} change${count === 1 ? '' : 's'} saved.`, [
      { text: 'OK' },
      {
        text: 'Undo',
        onPress: () => void undo(result.batchId),
      },
    ]);
  }

  async function undo(batchId: string) {
    if (!accessToken) return;
    try {
      await undoAssistantBatch(batchId, accessToken);
      if (threadId) await reload(threadId);
    } catch (undoError) {
      Alert.alert('Could not undo', undoError instanceof Error ? undoError.message : 'Please try again.');
    }
  }

  async function pickImage(source: 'camera' | 'library') {
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Camera permission needed', 'Allow camera access to photograph a bill.');
          return;
        }
      } else {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Photo permission needed', 'Allow photo access to choose a bill.');
          return;
        }
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.7,
              preferredAssetRepresentationMode:
                ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
            });

      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setUploadLabel('Reading your bill…');
      setIsSending(true);
      const id = await ensureThread();
      const response = await uploadAssistantAttachment(
        id,
        {
          file: {
            uri: asset.uri,
            name: asset.fileName ?? 'bill.jpg',
            type: asset.mimeType ?? 'image/jpeg',
            ...(asset.file ? { file: asset.file } : {}),
          },
          kind: 'IMAGE',
          ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
        },
        accessToken!,
      );
      await reload(id);
      if ('turn' in response) afterTurn(response);
    } catch (pickError) {
      Alert.alert('Bill photo', pickError instanceof Error ? pickError.message : 'Could not read that bill.');
    } finally {
      setUploadLabel(null);
      setIsSending(false);
    }
  }

  async function startRecording() {
    if (!accessToken || disabled) return;
    try {
      const permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Microphone permission needed', 'Allow microphone access to record a voice note.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch (recordError) {
      Alert.alert('Voice note', recordError instanceof Error ? recordError.message : 'Could not start recording.');
    }
  }

  async function stopRecording() {
    if (voiceBusy) return;
    setVoiceBusy(true);
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri || !accessToken) return;

      setUploadLabel('Transcribing your voice note…');
      setIsSending(true);
      const id = await ensureThread();
      const response = await uploadAssistantAttachment(
        id,
        {
          file: { uri, name: 'voice-note.m4a', type: 'audio/m4a' },
          kind: 'AUDIO',
        },
        accessToken,
      );
      if ('transcript' in response) {
        setInput((current) => (current ? `${current} ${response.transcript}` : response.transcript));
        Alert.alert('Transcript ready', 'Check it in the message box, then send.');
      }
    } catch (voiceError) {
      Alert.alert('Voice note', voiceError instanceof Error ? voiceError.message : 'Could not transcribe that note.');
    } finally {
      setUploadLabel(null);
      setIsSending(false);
      setVoiceBusy(false);
      setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    }
  }

  stopRecordingRef.current = stopRecording;

  async function pickStatement() {
    if (!accessToken || disabled) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'text/csv',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];

      setUploadLabel('Uploading your statement…');
      setIsSending(true);
      const id = await ensureThread();
      const summary = await startStatementImport(
        {
          file: {
            uri: asset.uri,
            name: asset.name,
            type: asset.mimeType ?? 'application/pdf',
            ...(asset.file ? { file: asset.file } : {}),
          },
          threadId: id,
          ...(preferences?.timezone ? { timezone: preferences.timezone } : {}),
        },
        accessToken,
      );
      setStatementImport(summary);
      setStatementOpen(true);
    } catch (statementError) {
      Alert.alert(
        'Statement',
        statementError instanceof Error ? statementError.message : 'Could not upload that statement.',
      );
    } finally {
      setUploadLabel(null);
      setIsSending(false);
    }
  }

  async function acceptConsent() {
    if (!accessToken) return;
    try {
      await recordAssistantConsent(accessToken);
      setStatus((current) => (current ? { ...current, consentRequired: false } : current));
      setPreferences((current) => (current ? { ...current, consentAt: new Date().toISOString() } : current));
      setConsentDismissed(false);
    } catch (consentError) {
      Alert.alert('Could not save', consentError instanceof Error ? consentError.message : 'Please try again.');
    }
  }

  async function savePreferences(patch: {
    autoSaveCreates?: boolean;
    thinkingMode?: boolean;
    reasoningEffort?: 'low' | 'high' | 'max';
  }) {
    if (!accessToken) return false;
    const previous = preferences;
    setPreferences((current) => (current ? { ...current, ...patch } : current));
    try {
      setPreferences(await updateAssistantPreferences(patch, accessToken));
      return true;
    } catch (toggleError) {
      setPreferences(previous);
      Alert.alert('Setting', toggleError instanceof Error ? toggleError.message : 'Could not change that setting.');
      return false;
    }
  }

  async function toggleAutoSave(value: boolean) {
    await savePreferences({ autoSaveCreates: value });
  }

  function newChat() {
    setThreadId(null);
    setMessages([]);
    setInput('');
    setError(null);
    setHistoryOpen(false);
  }

  function openHistory() {
    void refreshThreads();
    setHistoryOpen(true);
  }

  async function removeThread(id: string) {
    if (!accessToken) return;
    Alert.alert('Delete conversation?', 'Saved transactions stay in your account.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAssistantThread(id, accessToken);
            if (threadId === id) newChat();
            await refreshThreads();
          } catch (deleteError) {
            Alert.alert('Could not delete', deleteError instanceof Error ? deleteError.message : 'Please try again.');
          }
        },
      },
    ]);
  }

  const usageText = useMemo(() => {
    if (!usage) return null;
    return `${usage.today.messages}/${usage.limits.dailyMessages} messages today`;
  }, [usage]);

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} />
      </View>
    );
  }

  const hasMessages = messages.length > 0 || pendingText !== null;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Assistant</Text>
          <Text style={{ color: theme.muted, fontSize: 11 }}>Nothing saves until you confirm.</Text>
        </View>
        <View style={styles.autoSave}>
          <Text style={{ color: theme.muted, fontSize: 11 }}>Auto-save</Text>
          <Switch
            value={preferences?.autoSaveCreates ?? false}
            onValueChange={(value) => void toggleAutoSave(value)}
            disabled={!status?.enabled || consentRequired}
            trackColor={{ true: theme.primary, false: theme.border }}
          />
        </View>
        <Pressable
          onPress={() => setThinkingOpen(true)}
          hitSlop={8}
          accessibilityLabel="Thinking settings"
          style={{ marginLeft: 10, alignItems: 'center' }}>
          <Ionicons
            name={preferences?.thinkingMode ? 'bulb' : 'bulb-outline'}
            size={21}
            color={preferences?.thinkingMode ? '#b45309' : theme.colors.text}
          />
          <Text style={{ color: theme.muted, fontSize: 8 }}>
            {preferences?.thinkingMode ? EFFORT_LABEL[preferences.reasoningEffort] : 'Think'}
          </Text>
        </Pressable>
        <Pressable onPress={openHistory} hitSlop={8} style={{ marginLeft: 10 }}>
          <Ionicons name="time-outline" size={22} color={theme.colors.text} />
        </Pressable>
        <Pressable onPress={newChat} hitSlop={8} style={{ marginLeft: 12 }}>
          <Ionicons name="create-outline" size={22} color={theme.colors.text} />
        </Pressable>
      </View>

      {!status?.enabled && (
        <View style={styles.notice}>
          <Text style={{ color: '#92400e', fontSize: 12 }}>
            {status?.configured
              ? 'The assistant is turned off by the server.'
              : 'Add DEEPSEEK_API_KEY to the API environment to enable the assistant.'}
          </Text>
        </View>
      )}

      {consentRequired && (
        <Pressable onPress={() => setConsentDismissed(false)} style={styles.consentBanner}>
          <Text style={{ color: '#065f46', fontSize: 12, fontWeight: '600' }}>
            Tap to read the DeepSeek privacy notice and start using the assistant.
          </Text>
        </Pressable>
      )}

      {error && (
        <Text style={{ color: theme.danger, fontSize: 12, paddingHorizontal: 16, paddingTop: 8 }}>
          {error}
        </Text>
      )}

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, gap: 14 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled">
        {!hasMessages ? (
          <View style={styles.welcome}>
            <Text style={{ fontSize: 36 }}>✦</Text>
            <Text style={[styles.welcomeTitle, { color: theme.colors.text }]}>
              What did you spend or receive?
            </Text>
            <Text style={{ color: theme.muted, fontSize: 13, textAlign: 'center' }}>
              Type it, snap a bill, record a voice note, or import a statement.
            </Text>
            <View style={styles.suggestions}>
              {SUGGESTIONS.map((suggestion) => (
                <Pressable
                  key={suggestion}
                  onPress={() => void send(suggestion)}
                  disabled={disabled}
                  style={[styles.suggestionChip, { borderColor: theme.border }]}>
                  <Text style={{ color: theme.colors.text, fontSize: 12 }}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              categories={categories}
              disabled={disabled}
              onConfirm={confirm}
            />
          ))
        )}

        {pendingText && (
          <View style={styles.userRow}>
            <View style={styles.userBubble}>
              <Text style={{ color: '#fff', fontSize: 14 }}>{pendingText}</Text>
            </View>
          </View>
        )}

        {isSending && (
          <View style={[styles.assistantBubble, { backgroundColor: theme.card, borderColor: theme.border, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <ActivityIndicator size="small" color={theme.primary} />
            <Text style={{ color: theme.muted, fontSize: 12 }}>{uploadLabel ?? 'Thinking…'}</Text>
          </View>
        )}
      </ScrollView>

      {usageText && (
        <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', paddingBottom: 2 }}>
          {usageText}
        </Text>
      )}

      <View style={[styles.composer, { borderTopColor: theme.border, backgroundColor: theme.card }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Spent 250 on lunch today…"
          placeholderTextColor={theme.muted}
          multiline
          editable={!disabled}
          maxLength={status?.limits.maxTextChars ?? 2000}
          style={[styles.composerInput, { color: theme.colors.text, borderColor: theme.border }]}
        />
        <View style={styles.composerActions}>
          <Pressable
            onPress={() =>
              Alert.alert('Bill photo', 'Choose a source', [
                { text: 'Camera', onPress: () => void pickImage('camera') },
                { text: 'Photo library', onPress: () => void pickImage('library') },
                { text: 'Cancel', style: 'cancel' },
              ])
            }
            disabled={disabled}
            style={styles.iconButton}>
            <Ionicons name="camera-outline" size={22} color={disabled ? theme.muted : theme.colors.text} />
          </Pressable>

          <Pressable
            onPress={() => (recorderState.isRecording ? void stopRecording() : void startRecording())}
            disabled={disabled && !recorderState.isRecording}
            style={[
              styles.iconButton,
              recorderState.isRecording && { backgroundColor: '#fee2e2', borderRadius: 20 },
            ]}>
            <Ionicons
              name={recorderState.isRecording ? 'stop-circle' : 'mic-outline'}
              size={22}
              color={recorderState.isRecording ? theme.danger : disabled ? theme.muted : theme.colors.text}
            />
            {recorderState.isRecording && (
              <Text style={{ color: theme.danger, fontSize: 10, marginLeft: 4 }}>
                {Math.floor(recorderState.durationMillis / 1000)}s
              </Text>
            )}
          </Pressable>

          <Pressable onPress={() => void pickStatement()} disabled={disabled} style={styles.iconButton}>
            <Ionicons name="document-text-outline" size={22} color={disabled ? theme.muted : theme.colors.text} />
          </Pressable>

          <Pressable
            onPress={() => void send()}
            disabled={disabled || !input.trim()}
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary, opacity: disabled || !input.trim() ? 0.5 : 1 },
            ]}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </View>

      <Modal visible={historyOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setHistoryOpen(false)}>
        <View style={[styles.screen, { backgroundColor: theme.background }]}>
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Conversations</Text>
            <Pressable onPress={() => setHistoryOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={theme.colors.text} />
            </Pressable>
          </View>
          <FlatList
            data={threads}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={
              <Text style={{ color: theme.muted, textAlign: 'center', marginTop: 40 }}>
                No conversations yet.
              </Text>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  void loadThread(item.id);
                  setHistoryOpen(false);
                }}
                onLongPress={() => void removeThread(item.id)}
                style={[styles.threadRow, { borderBottomColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: theme.muted, fontSize: 11 }} numberOfLines={1}>
                    {item.preview ?? 'No messages yet'} · {item.messageCount}
                  </Text>
                </View>
                {threadId === item.id && <Ionicons name="checkmark" size={18} color={theme.primary} />}
                <Pressable onPress={() => void removeThread(item.id)} hitSlop={8} style={{ marginLeft: 12 }}>
                  <Ionicons name="trash-outline" size={18} color={theme.muted} />
                </Pressable>
              </Pressable>
            )}
          />
          <Pressable
            onPress={newChat}
            style={[styles.newChatButton, { backgroundColor: theme.primary }]}>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Start a new conversation</Text>
          </Pressable>
          {usageText && (
            <Text style={{ color: theme.muted, fontSize: 10, textAlign: 'center', paddingBottom: 16 }}>
              {usageText}
            </Text>
          )}
        </View>
      </Modal>

      <Modal
        visible={thinkingOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setThinkingOpen(false)}>
        <View style={styles.consentOverlay}>
          <View style={[styles.consentCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Thinking</Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: '600' }}>
                  Thinking mode
                </Text>
                <Text style={{ color: theme.muted, fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                  Let the model reason before it answers. Slower and uses more tokens.
                </Text>
              </View>
              <Switch
                value={preferences?.thinkingMode ?? false}
                onValueChange={(value) => void savePreferences({ thinkingMode: value })}
                disabled={!status?.enabled || consentRequired}
                trackColor={{ true: '#d97706', false: theme.border }}
              />
            </View>

            <Text style={{ color: theme.muted, fontSize: 11, marginTop: 16, marginBottom: 6 }}>
              Effort
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['low', 'high', 'max'] as const).map((level) => {
                const selected = preferences?.reasoningEffort === level;
                return (
                  <Pressable
                    key={level}
                    onPress={() => void savePreferences({ reasoningEffort: level })}
                    disabled={!preferences?.thinkingMode}
                    style={[
                      styles.effortChip,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? `${theme.primary}15` : 'transparent',
                        opacity: preferences?.thinkingMode ? 1 : 0.4,
                      },
                    ]}>
                    <Text
                      style={{
                        color: selected ? theme.primary : theme.muted,
                        fontSize: 12,
                        fontWeight: '600',
                      }}>
                      {EFFORT_LABEL[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: theme.muted, fontSize: 11, lineHeight: 16, marginTop: 14 }}>
              Applies to chat and bill analysis. Statements always use fast extraction. The
              reasoning is saved with each reply; tap “Show thinking” on an answer to read it.
            </Text>

            <Pressable
              onPress={() => setThinkingOpen(false)}
              style={[styles.consentButton, { backgroundColor: theme.primary, marginTop: 18 }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={consentRequired && !consentDismissed} animationType="fade" transparent onRequestClose={() => setConsentDismissed(true)}>
        <View style={styles.consentOverlay}>
          <View style={[styles.consentCard, { backgroundColor: theme.card }]}>
            <Text style={[styles.title, { color: theme.colors.text }]}>Before you use the assistant</Text>
            <Text style={{ color: theme.muted, fontSize: 13, lineHeight: 19, marginTop: 10 }}>
              Messages, bill photos, voice notes and statement pages are sent to DeepSeek for
              processing. Money Tracker 365 does not store the original files; only the transactions
              you confirm are saved. DeepSeek’s privacy policy governs its handling of requests.
            </Text>
            <Pressable
              onPress={() => void acceptConsent()}
              style={[styles.consentButton, { backgroundColor: theme.primary }]}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>I understand</Text>
            </Pressable>
            <Pressable onPress={() => setConsentDismissed(true)} style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Text style={{ color: theme.muted, fontSize: 12 }}>Not now</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <StatementReviewModal
        visible={statementOpen}
        initialImport={statementImport}
        categories={categories}
        accessToken={accessToken ?? ''}
        onClose={() => setStatementOpen(false)}
        onCommitted={(result) => {
          Alert.alert('Imported', `${result.imported} transactions imported.`, [
            { text: 'OK' },
            { text: 'Undo', onPress: () => void undo(result.batchId) },
          ]);
          if (threadId) void reload(threadId);
          setStatementOpen(false);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  screenTitle: { fontSize: 19, fontWeight: '800' },
  autoSave: { alignItems: 'center', gap: 1 },
  notice: {
    backgroundColor: '#fffbeb',
    borderColor: '#fde68a',
    borderWidth: 1,
    margin: 12,
    borderRadius: 10,
    padding: 10,
  },
  consentBanner: {
    backgroundColor: '#ecfdf5',
    borderColor: '#a7f3d0',
    borderWidth: 1,
    margin: 12,
    borderRadius: 10,
    padding: 10,
  },
  welcome: { alignItems: 'center', paddingTop: 32, gap: 10 },
  welcomeTitle: { fontSize: 18, fontWeight: '700' },
  suggestions: { gap: 8, marginTop: 8, width: '100%' },
  suggestionChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: '#047857',
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 9,
    maxWidth: '85%',
  },
  assistantRow: { alignItems: 'flex-start' },
  assistantBubble: { borderWidth: 1, borderRadius: 16, borderBottomLeftRadius: 4, paddingHorizontal: 12, paddingVertical: 9 },
  clarification: { backgroundColor: '#fef3c7', borderRadius: 8, padding: 7 },
  operationCard: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 4 },
  operationActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  operationButton: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  queryCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 3 },
  groupRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  composer: { borderTopWidth: 1, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  composerInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    maxHeight: 120,
    minHeight: 42,
  },
  composerActions: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  iconButton: { flexDirection: 'row', alignItems: 'center', padding: 7 },
  sendButton: { marginLeft: 'auto', width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  title: { fontSize: 18, fontWeight: '700' },
  threadRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  newChatButton: { margin: 16, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  consentOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  consentCard: { borderRadius: 18, padding: 20 },
  consentButton: { marginTop: 16, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 10 },
  reasoningBox: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  reasoningHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 8 },
  settingRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  effortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 },
});
