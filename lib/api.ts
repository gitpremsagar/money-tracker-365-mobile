import * as tokenStore from './token-store';

const DEFAULT_API_URL = 'https://api.moneytracker365.com';

/**
 * The base URL comes from EXPO_PUBLIC_API_URL (see .env) so the app can point at
 * a local API during development, and falls back to production when it is unset.
 */
function resolveApiUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL?.trim();
  const url = configured && configured.length > 0 ? configured : DEFAULT_API_URL;
  return url.replace(/\/+$/, '');
}

const API_URL = resolveApiUrl();

/** Error thrown for non-2xx responses, carrying the HTTP status code. */
export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  userType: 'ADMIN' | 'CUSTOMER';
};

export type AuthResponse = {
  accessToken: string;
  refreshToken?: string;
  user: AuthUser;
};

type ApiRequestInit = RequestInit & {
  accessToken?: string | null;
  skipAuthRetry?: boolean;
};

let refreshPromise: Promise<string | null> | null = null;
let accessTokenGetter: (() => string | null) | null = null;
let onAccessTokenRefreshed: ((token: string | null) => void) | null = null;
let onRefreshTokenRefreshed: ((token: string | null) => void) | null = null;

export function registerAccessTokenHandlers(handlers: {
  getAccessToken: () => string | null;
  onAccessTokenRefreshed: (token: string | null) => void;
  onRefreshTokenRefreshed?: (token: string | null) => void;
}): void {
  accessTokenGetter = handlers.getAccessToken;
  onAccessTokenRefreshed = handlers.onAccessTokenRefreshed;
  onRefreshTokenRefreshed = handlers.onRefreshTokenRefreshed ?? null;
}

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await tokenStore.getRefreshToken();
      if (!refreshToken) {
        onAccessTokenRefreshed?.(null);
        onRefreshTokenRefreshed?.(null);
        return null;
      }

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        await tokenStore.clearTokens();
        onAccessTokenRefreshed?.(null);
        onRefreshTokenRefreshed?.(null);
        return null;
      }

      const data = (await response.json()) as AuthResponse;
      if (data.accessToken) {
        await tokenStore.setTokens(data.accessToken, data.refreshToken);
      }
      onAccessTokenRefreshed?.(data.accessToken);
      onRefreshTokenRefreshed?.(data.refreshToken ?? null);
      return data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function apiFetch<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { accessToken, skipAuthRetry, headers, ...rest } = init;

  const requestHeaders = new Headers(headers);

  const token = accessToken ?? accessTokenGetter?.() ?? null;

  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`);
  }

  if (!requestHeaders.has('Content-Type') && rest.body) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: requestHeaders,
  });

  if (response.status === 401 && token && !skipAuthRetry) {
    const newAccessToken = await refreshAccessToken();

    if (newAccessToken) {
      return apiFetch<T>(path, {
        ...init,
        accessToken: newAccessToken,
        skipAuthRetry: true,
      });
    }
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : `Request failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function signupRequest(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify(input),
    skipAuthRetry: true,
  });
  await tokenStore.setTokens(result.accessToken, result.refreshToken);
  return result;
}

export async function loginRequest(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  const result = await apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
    skipAuthRetry: true,
  });
  await tokenStore.setTokens(result.accessToken, result.refreshToken);
  return result;
}

export async function logoutRequest(accessToken: string | null): Promise<void> {
  const refreshToken = await tokenStore.getRefreshToken();
  await apiFetch<{ message: string }>('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refreshToken }),
    accessToken,
    skipAuthRetry: true,
  });
  await tokenStore.clearTokens();
}

export async function getCurrentUser(accessToken: string): Promise<{ user: AuthUser }> {
  return apiFetch<{ user: AuthUser }>('/auth/me', {
    method: 'GET',
    accessToken,
  });
}

export async function refreshSession(): Promise<AuthResponse | null> {
  const refreshToken = await tokenStore.getRefreshToken();
  if (!refreshToken) return null;

  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await tokenStore.clearTokens();
    return null;
  }

  const data = (await response.json()) as AuthResponse;
  if (!data.accessToken) {
    return null;
  }
  await tokenStore.setTokens(data.accessToken, data.refreshToken);
  return data;
}

export type CategoryType = 'INCOME' | 'EXPENSE' | 'SAVING' | 'INVESTMENT';

export type Category = {
  id: string;
  name: string;
  type: CategoryType;
  groupId: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export async function createCategory(
  input: { name: string; type: CategoryType; groupId?: string | null },
  accessToken: string,
): Promise<Category> {
  const res = await apiFetch<{ category: Category }>('/categories', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.category;
}

export async function listCategories(
  accessToken: string,
  type?: CategoryType,
): Promise<Category[]> {
  const params = type ? `?type=${type}` : '';
  const res = await apiFetch<{ categories: Category[] }>(`/categories${params}`, {
    method: 'GET',
    accessToken,
  });
  return res.categories;
}

export async function updateCategory(
  id: string,
  input: { name?: string; groupId?: string | null },
  accessToken: string,
): Promise<Category> {
  const res = await apiFetch<{ category: Category }>(`/categories/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.category;
}

export async function deleteCategory(id: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/categories/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}

export type CategoryGroup = {
  id: string;
  name: string;
  type: CategoryType;
  userId: string;
  categories?: { id: string; name: string }[];
  createdAt: string;
  updatedAt: string;
};

export async function listCategoryGroups(
  accessToken: string,
  type?: CategoryType,
): Promise<CategoryGroup[]> {
  const params = type ? `?type=${type}` : '';
  const res = await apiFetch<{ groups: CategoryGroup[] }>(`/category-groups${params}`, {
    method: 'GET',
    accessToken,
  });
  return res.groups;
}

export async function createCategoryGroup(
  input: { name: string; type: CategoryType },
  accessToken: string,
): Promise<CategoryGroup> {
  const res = await apiFetch<{ group: CategoryGroup }>('/category-groups', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.group;
}

export async function updateCategoryGroup(
  id: string,
  input: { name: string },
  accessToken: string,
): Promise<CategoryGroup> {
  const res = await apiFetch<{ group: CategoryGroup }>(`/category-groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.group;
}

export async function deleteCategoryGroup(id: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/category-groups/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}

export type Transaction = {
  id: string;
  amount: number;
  note: string | null;
  type: CategoryType;
  date: string;
  categoryId: string;
  category: { id: string; name: string; type: CategoryType };
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type TransactionPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ListTransactionsResult = {
  transactions: Transaction[];
  pagination: TransactionPagination;
};

export type ListTransactionsParams = {
  month?: string;
  year?: number;
  from?: string;
  to?: string;
  type?: CategoryType;
  categoryId?: string;
  page?: number;
  limit?: number;
};

export async function createTransaction(
  input: { amount: number; note?: string; categoryId: string; date?: string },
  accessToken: string,
): Promise<Transaction> {
  const res = await apiFetch<{ transaction: Transaction }>('/transactions', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.transaction;
}

export async function listTransactions(
  params: ListTransactionsParams,
  accessToken: string,
): Promise<ListTransactionsResult> {
  const qs = new URLSearchParams();
  if (params.month) qs.set('month', params.month);
  if (params.year) qs.set('year', String(params.year));
  if (params.from) qs.set('from', params.from);
  if (params.to) qs.set('to', params.to);
  if (params.type) qs.set('type', params.type);
  if (params.categoryId) qs.set('categoryId', params.categoryId);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ListTransactionsResult>(`/transactions${query}`, {
    method: 'GET',
    accessToken,
  });
}

export async function getTransaction(id: string, accessToken: string): Promise<Transaction> {
  const res = await apiFetch<{ transaction: Transaction }>(`/transactions/${id}`, {
    method: 'GET',
    accessToken,
  });
  return res.transaction;
}

export async function updateTransaction(
  id: string,
  input: { amount?: number; note?: string | null; categoryId?: string; date?: string },
  accessToken: string,
): Promise<Transaction> {
  const res = await apiFetch<{ transaction: Transaction }>(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.transaction;
}

export async function deleteTransaction(id: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/transactions/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}

export type DebtType = 'TAKEN' | 'GIVEN';
export type DebtStatus = 'ACTIVE' | 'SETTLED';

export type DebtPayment = {
  id: string;
  amount: number;
  date: string;
  note: string | null;
  debtId: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export type Debt = {
  id: string;
  type: DebtType;
  partyName: string;
  amount: number;
  description: string | null;
  date: string;
  status: DebtStatus;
  userId: string;
  createdAt: string;
  updatedAt: string;
  paidAmount: number;
  outstanding: number;
  payments?: DebtPayment[];
};

export type DebtPagination = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type ListDebtsResult = {
  debts: Debt[];
  pagination: DebtPagination;
};

export type ListDebtsParams = {
  type?: DebtType;
  status?: DebtStatus;
  page?: number;
  limit?: number;
};

export async function createDebt(
  input: { type: DebtType; partyName: string; amount: number; description?: string; date?: string },
  accessToken: string,
): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>('/debts', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.debt;
}

export async function listDebts(
  params: ListDebtsParams,
  accessToken: string,
): Promise<ListDebtsResult> {
  const qs = new URLSearchParams();
  if (params.type) qs.set('type', params.type);
  if (params.status) qs.set('status', params.status);
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  const query = qs.toString() ? `?${qs.toString()}` : '';
  return apiFetch<ListDebtsResult>(`/debts${query}`, {
    method: 'GET',
    accessToken,
  });
}

export async function getDebt(id: string, accessToken: string): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>(`/debts/${id}`, {
    method: 'GET',
    accessToken,
  });
  return res.debt;
}

export async function updateDebt(
  id: string,
  input: {
    type?: DebtType;
    partyName?: string;
    amount?: number;
    description?: string | null;
    date?: string;
    status?: DebtStatus;
  },
  accessToken: string,
): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>(`/debts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.debt;
}

export async function deleteDebt(id: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/debts/${id}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function addDebtPayment(
  debtId: string,
  input: { amount: number; date?: string; note?: string },
  accessToken: string,
): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>(`/debts/${debtId}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.debt;
}

export async function updateDebtPayment(
  debtId: string,
  paymentId: string,
  input: { amount?: number; date?: string; note?: string | null },
  accessToken: string,
): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>(`/debts/${debtId}/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.debt;
}

export async function deleteDebtPayment(
  debtId: string,
  paymentId: string,
  accessToken: string,
): Promise<Debt> {
  const res = await apiFetch<{ debt: Debt }>(`/debts/${debtId}/payments/${paymentId}`, {
    method: 'DELETE',
    accessToken,
  });
  return res.debt;
}

export type CategoryBreakdownItem = {
  id: string;
  name: string;
  type: CategoryType;
  groupId: string | null;
  groupName: string | null;
  total: number;
  percentage: number;
};

export type GroupBreakdownItem = {
  id: string | null;
  name: string;
  type: CategoryType;
  total: number;
  percentage: number;
  categories: { id: string; name: string; total: number; percentage: number }[];
};

export type DailyTotalItem = {
  date: string;
  income: number;
  expense: number;
  saving: number;
  investment: number;
  debtRepayment: number;
};

export type MonthlyReport = {
  month: string;
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  totalDebtRepayment: number;
  netBalance: number;
  categoryBreakdown: CategoryBreakdownItem[];
  groupBreakdown: GroupBreakdownItem[];
  dailyTotals: DailyTotalItem[];
};

export async function getMonthlyReport(month: string, accessToken: string): Promise<MonthlyReport> {
  const res = await apiFetch<{ report: MonthlyReport }>(`/reports/monthly?month=${month}`, {
    method: 'GET',
    accessToken,
  });
  return res.report;
}

export type MonthlyTotalItem = {
  month: string;
  income: number;
  expense: number;
  saving: number;
  investment: number;
  debtRepayment: number;
};

export type AnnualReport = {
  year: number;
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  totalDebtRepayment: number;
  netBalance: number;
  categoryBreakdown: CategoryBreakdownItem[];
  groupBreakdown: GroupBreakdownItem[];
  monthlyTotals: MonthlyTotalItem[];
};

export async function getAnnualReport(year: number, accessToken: string): Promise<AnnualReport> {
  const res = await apiFetch<{ report: AnnualReport }>(`/reports/annual?year=${year}`, {
    method: 'GET',
    accessToken,
  });
  return res.report;
}

export type ReportPeriod = { kind: 'month'; month: string } | { kind: 'year'; year: number };

// ─── Assistant ────────────────────────────────────────────────────────────────

export type AssistantIntent =
  | 'ADD_TRANSACTIONS'
  | 'CLARIFY'
  | 'UNSUPPORTED'
  | 'QUERY'
  | 'EDIT_TRANSACTIONS'
  | 'DELETE_TRANSACTIONS'
  | 'DEBT_PAYMENT';

export type AssistantProposal = {
  amount: number;
  type: CategoryType;
  categoryId: string | null;
  categoryName: string | null;
  suggestedCategoryName: string | null;
  date: string;
  note: string | null;
  confidence: number;
};

export type AssistantTransactionSnapshot = {
  id: string;
  amount: number;
  type: CategoryType;
  categoryId: string;
  categoryName: string;
  date: string;
  note: string | null;
};

export type AssistantOperation = {
  action: 'UPDATE' | 'DELETE';
  transactionId: string;
  before: AssistantTransactionSnapshot;
  after: AssistantTransactionSnapshot | null;
  confidence: number;
};

export type AssistantDebtPayment = {
  debtId: string;
  partyName: string;
  debtType: DebtType;
  amount: number;
  date: string;
  note: string | null;
  outstandingBefore: number;
  outstandingAfter: number;
  confidence: number;
};

export type AssistantQueryTransaction = {
  id: string;
  amount: number;
  type: CategoryType;
  date: string;
  note: string | null;
  categoryName: string;
};

export type AssistantQueryResult = {
  metric: 'TOTAL' | 'COUNT' | 'LIST';
  from: string;
  to: string;
  periodLabel: string;
  count: number;
  totals: Record<CategoryType, number>;
  net: number;
  byCategory: {
    id: string;
    name: string;
    type: CategoryType;
    total: number;
    count: number;
  }[];
  transactions: AssistantQueryTransaction[];
  answer: string;
};

export type AssistantParseResult = {
  conversationId: string | null;
  messageId: string | null;
  intent: AssistantIntent;
  reply: string;
  proposals: AssistantProposal[];
  operations: AssistantOperation[];
  debtPayments: AssistantDebtPayment[];
  queryResult: AssistantQueryResult | null;
  clarifications: string[];
  categoriesEmpty: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    model?: string;
  };
};

export type AssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantConfirmProposal = {
  amount: number;
  categoryId?: string | null;
  newCategory?: { name: string; type: CategoryType } | null;
  note?: string | null;
  date?: string;
};

export type AssistantApplyOperation = {
  action: 'UPDATE' | 'DELETE';
  transactionId: string;
  amount?: number;
  categoryId?: string | null;
  newCategory?: { name: string; type: CategoryType } | null;
  date?: string;
  note?: string | null;
};

export type AssistantApplyResult = {
  transactions: Transaction[];
  deletedTransactionIds: string[];
  debts: Debt[];
};

export type AssistantPreferences = {
  autoSave: boolean;
};

export type AssistantConversationSummary = {
  id: string;
  title: string;
  lastMessageAt: string;
  preview: string | null;
};

export type AssistantMessagePayload = {
  intent?: AssistantIntent;
  proposals?: AssistantProposal[];
  operations?: AssistantOperation[];
  debtPayments?: AssistantDebtPayment[];
  queryResult?: AssistantQueryResult | null;
  clarifications?: string[];
  categoriesEmpty?: boolean;
  saved?: boolean;
  transactionIds?: string[];
  applied?: boolean;
  updatedTransactionIds?: string[];
  deletedTransactionIds?: string[];
  debtIds?: string[];
};

export type AssistantStoredMessage = {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  payload: AssistantMessagePayload | null;
  createdAt: string;
};

export type AssistantConversationDetail = {
  conversation: {
    id: string;
    title: string;
    lastMessageAt: string;
  };
  messages: AssistantStoredMessage[];
};

export type AssistantUsageStats = {
  month: {
    messages: number;
    totalTokens: number;
    averageLatencyMs: number;
  };
  recent: {
    id: string;
    model: string;
    intent: string | null;
    proposalCount: number;
    totalTokens: number | null;
    latencyMs: number;
    createdAt: string;
  }[];
};

export async function parseAssistantMessage(
  input: {
    message: string;
    history?: AssistantHistoryMessage[];
    timezone?: string;
    now?: string;
    conversationId?: string;
  },
  accessToken: string,
): Promise<AssistantParseResult> {
  return apiFetch<AssistantParseResult>('/assistant/parse', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function confirmAssistantProposals(
  input: {
    proposals: AssistantConfirmProposal[];
    requestId?: string;
    conversationId?: string;
  },
  accessToken: string,
): Promise<Transaction[]> {
  const res = await apiFetch<{ transactions: Transaction[] }>('/assistant/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
  return res.transactions;
}

export async function applyAssistantActions(
  input: {
    operations?: AssistantApplyOperation[];
    debtPayments?: { debtId: string; amount: number; date?: string; note?: string | null }[];
    requestId?: string;
    conversationId?: string;
  },
  accessToken: string,
): Promise<AssistantApplyResult> {
  return apiFetch<AssistantApplyResult>('/assistant/apply', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function undoAssistantTransactions(
  input: { transactionIds: string[]; requestId?: string },
  accessToken: string,
): Promise<{ deleted: number }> {
  return apiFetch<{ deleted: number }>('/assistant/undo', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function getAssistantPreferences(
  accessToken: string,
): Promise<AssistantPreferences> {
  return apiFetch<AssistantPreferences>('/assistant/preferences', { accessToken });
}

export async function updateAssistantPreferences(
  input: AssistantPreferences,
  accessToken: string,
): Promise<AssistantPreferences> {
  return apiFetch<AssistantPreferences>('/assistant/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function listAssistantConversations(
  accessToken: string,
  limit = 20,
): Promise<AssistantConversationSummary[]> {
  const res = await apiFetch<{ conversations: AssistantConversationSummary[] }>(
    `/assistant/conversations?limit=${limit}`,
    { accessToken },
  );
  return res.conversations;
}

export async function getAssistantConversation(
  conversationId: string,
  accessToken: string,
): Promise<AssistantConversationDetail> {
  return apiFetch<AssistantConversationDetail>(
    `/assistant/conversations/${encodeURIComponent(conversationId)}`,
    { accessToken },
  );
}

export async function deleteAssistantConversation(
  conversationId: string,
  accessToken: string,
): Promise<void> {
  await apiFetch<null>(`/assistant/conversations/${encodeURIComponent(conversationId)}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function getAssistantUsage(accessToken: string): Promise<AssistantUsageStats> {
  return apiFetch<AssistantUsageStats>('/assistant/usage', { accessToken });
}
