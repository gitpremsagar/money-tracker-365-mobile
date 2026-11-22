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
  requestHeaders.set('X-Client', 'mobile');

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
    headers: { 'Content-Type': 'application/json', 'X-Client': 'mobile' },
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

export async function forgotPasswordRequest(email: string): Promise<{
  message: string;
  delivered: boolean;
  devResetUrl?: string;
}> {
  return apiFetch('/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
    skipAuthRetry: true,
  });
}

export async function updateProfileRequest(input: {
  name?: string;
  email?: string;
}): Promise<{ user: AuthUser }> {
  return apiFetch('/auth/me', {
    method: 'PUT',
    body: JSON.stringify(input),
  });
}

export async function changePasswordRequest(input: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ message: string }> {
  return apiFetch('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function logoutAllRequest(): Promise<{ message: string }> {
  return apiFetch('/auth/logout-all', { method: 'POST' });
}

export async function deleteAccountRequest(password: string): Promise<{ message: string }> {
  return apiFetch('/auth/me', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
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

export async function addStarterCategories(
  accessToken: string,
): Promise<{ created: number }> {
  return apiFetch('/categories/starter', {
    method: 'POST',
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

export type BudgetItem = {
  id: string;
  month: string;
  scope: string;
  amount: number;
  spent: number;
  remaining: number;
  percentage: number;
  overBudget: boolean;
  categoryId: string | null;
  categoryName: string;
};

export type BudgetSummary = {
  totalBudget: number | null;
  totalSpent: number;
  remaining: number | null;
  percentage: number | null;
  overBudget: boolean;
};

export type BudgetsResult = {
  month: string;
  budgets: BudgetItem[];
  summary: BudgetSummary;
};

export async function listBudgets(
  month: string,
  accessToken: string,
): Promise<BudgetsResult> {
  return apiFetch<BudgetsResult>(`/budgets?month=${month}`, {
    method: 'GET',
    accessToken,
  });
}

export async function upsertBudget(
  input: { month: string; scope: string; amount: number },
  accessToken: string,
): Promise<{ budget: { id: string } }> {
  return apiFetch<{ budget: { id: string } }>('/budgets', {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function deleteBudget(id: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/budgets/${id}`, {
    method: 'DELETE',
    accessToken,
  });
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
  debtRecovery: number;
};

export type MonthlyReport = {
  month: string;
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  totalDebtRepayment: number;
  totalDebtRecovery: number;
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
  debtRecovery: number;
};

export type AnnualReport = {
  year: number;
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  totalDebtRepayment: number;
  totalDebtRecovery: number;
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
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'QUERY'
  | 'IMPORT'
  | 'CLARIFY'
  | 'UNSUPPORTED';

export type AssistantProposal = {
  proposalId: string;
  amount: number;
  type: CategoryType;
  categoryId: string | null;
  categoryName: string | null;
  suggestedCategoryName: string | null;
  date: string;
  note: string;
  confidence: number;
  source: 'TEXT' | 'IMAGE' | 'AUDIO';
};

export type AssistantTransactionSnapshot = {
  id: string;
  amount: number;
  note: string | null;
  type: CategoryType;
  date: string;
  categoryId: string;
  categoryName: string;
};

export type AssistantOperation = {
  operationId: string;
  kind: 'UPDATE' | 'DELETE';
  targetId: string;
  before: AssistantTransactionSnapshot;
  after: AssistantTransactionSnapshot | null;
  changes: {
    amount?: number;
    categoryId?: string;
    date?: string;
    note?: string | null;
  };
  confidence: number;
};

export type AssistantQueryResult = {
  total: number;
  count: number;
  average: number;
  transactions: Array<{
    id: string;
    date: string;
    amount: number;
    type: CategoryType;
    categoryName: string;
    note: string | null;
  }>;
  groups: Array<{ key: string; total: number; count: number }>;
};

export type AssistantTurn = {
  intent: AssistantIntent;
  reply: string;
  proposals: AssistantProposal[];
  operations: AssistantOperation[];
  query: Record<string, unknown> | null;
  queryResult: AssistantQueryResult | null;
  clarifications: string[];
  savedProposalIds?: string[];
  savedOperationIds?: string[];
  savedBatchId?: string;
};

export type AssistantStatus = {
  enabled: boolean;
  configured: boolean;
  consentRequired: boolean;
  model: string;
  limits: {
    maxTextChars: number;
    maxCreatesPerTurn: number;
    dailyMessages: number;
    dailyImportPages: number;
    maxImportRows: number;
    maxImageMb: number;
    maxAudioMb: number;
    maxStatementMb: number;
  };
};

export type AssistantPreferences = {
  autoSaveCreates: boolean;
  thinkingMode: boolean;
  reasoningEffort: 'low' | 'high' | 'max';
  timezone: string;
  consentAt: string | null;
};

export type AssistantThreadSummary = {
  id: string;
  title: string;
  messageCount: number;
  importCount: number;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AssistantMessageRecord = {
  id: string;
  threadId: string;
  userId: string;
  seq: number;
  role: 'user' | 'assistant' | 'system';
  kind: 'TEXT' | 'IMAGE' | 'AUDIO' | 'STATEMENT' | 'SYSTEM';
  text: string | null;
  transcript: string | null;
  reasoning: string | null;
  attachment: { kind?: string; mime?: string; bytes?: number; filename?: string } | null;
  turn: AssistantTurn | null;
  model: string | null;
  createdAt: string;
};

export type AssistantTurnResponse = {
  threadId: string;
  messageId: string;
  turn: AssistantTurn;
  reasoning: string | null;
  autoSaved: {
    batchId: string;
    created: number;
    updated: number;
    deleted: number;
    transactions: AssistantTransactionSnapshot[];
    undoUntil: string;
  } | null;
  autoSaveError: string | null;
};

export type AssistantImportSummary = {
  id: string;
  filename: string;
  source: 'PDF' | 'CSV' | 'XLSX';
  status: 'PROCESSING' | 'READY' | 'FAILED' | 'COMMITTED';
  pages: number | null;
  rowCount: number;
  duplicateCount: number;
  error: string | null;
  createdAt: string;
  committedAt: string | null;
};

export type AssistantImportRow = {
  id: string;
  importId: string;
  rowIndex: number;
  date: string;
  amount: number;
  type: 'EXPENSE' | 'INCOME';
  description: string | null;
  categoryId: string | null;
  suggestedCategoryName: string | null;
  confidence: number;
  status: 'PENDING' | 'DUPLICATE' | 'IMPORTED' | 'SKIPPED';
  transactionId: string | null;
};

export type AssistantImportDetail = {
  import: AssistantImportSummary;
  rows: AssistantImportRow[];
  counts: Record<string, number>;
  pagination: { total: number; page: number; limit: number; totalPages: number };
};

export type AssistantUsage = {
  today: { day: string; messages: number; importPages: number; costUsd: number };
  limits: {
    dailyMessages: number;
    dailyImportPages: number;
    maxImportRows: number;
    maxCreatesPerTurn: number;
  };
  last30Days: {
    messages: number;
    importPages: number;
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
  };
};

export type LocalFile = {
  uri: string;
  name: string;
  type: string;
  file?: File;
};

export type AssistantConfirmItem =
  | {
      kind: 'CREATE';
      amount: number;
      categoryId?: string | null;
      newCategoryName?: string | null;
      newCategoryType?: CategoryType;
      date: string;
      note?: string;
      source?: 'TEXT' | 'IMAGE' | 'AUDIO' | 'IMPORT';
      proposalId?: string;
    }
  | {
      kind: 'UPDATE';
      targetId: string;
      changes: { amount?: number; categoryId?: string; date?: string; note?: string | null };
      operationId?: string;
    }
  | { kind: 'DELETE'; targetId: string; operationId?: string };

function appendLocalFile(form: FormData, field: string, file: LocalFile): void {
  if (file.file) {
    form.append(field, file.file);
    return;
  }
  form.append(field, {
    uri: file.uri,
    name: file.name,
    type: file.type,
  } as unknown as Blob);
}

async function apiUploadForm<T>(
  path: string,
  form: FormData,
  accessToken: string,
  skipAuthRetry = false,
): Promise<T> {
  const headers = new Headers();
  headers.set('X-Client', 'mobile');
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    body: form,
    headers,
  });

  if (response.status === 401 && !skipAuthRetry) {
    const newAccessToken = await refreshAccessToken();
    if (newAccessToken) {
      return apiUploadForm<T>(path, form, newAccessToken, true);
    }
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'message' in data
        ? String(data.message)
        : `Upload failed (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return data as T;
}

export async function getAssistantStatus(accessToken: string): Promise<AssistantStatus> {
  return apiFetch<AssistantStatus>('/assistant/status', { accessToken });
}

export async function recordAssistantConsent(accessToken: string): Promise<{ consentAt: string }> {
  return apiFetch<{ consentAt: string }>('/assistant/consent', {
    method: 'POST',
    accessToken,
  });
}

export async function getAssistantPreferences(accessToken: string): Promise<AssistantPreferences> {
  return apiFetch<AssistantPreferences>('/assistant/preferences', { accessToken });
}

export async function updateAssistantPreferences(
  input: {
    autoSaveCreates?: boolean;
    thinkingMode?: boolean;
    reasoningEffort?: 'low' | 'high' | 'max';
    timezone?: string;
  },
  accessToken: string,
): Promise<AssistantPreferences> {
  return apiFetch<AssistantPreferences>('/assistant/preferences', {
    method: 'PUT',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function listAssistantThreads(accessToken: string): Promise<AssistantThreadSummary[]> {
  const result = await apiFetch<{ threads: AssistantThreadSummary[] }>('/assistant/threads', {
    accessToken,
  });
  return result.threads;
}

export async function createAssistantThread(
  accessToken: string,
  title?: string,
): Promise<{ id: string; title: string }> {
  const result = await apiFetch<{ thread: { id: string; title: string } }>('/assistant/threads', {
    method: 'POST',
    body: JSON.stringify(title ? { title } : {}),
    accessToken,
  });
  return result.thread;
}

export async function getAssistantThread(
  threadId: string,
  accessToken: string,
): Promise<{
  thread: { id: string; title: string; createdAt: string; updatedAt: string };
  messages: AssistantMessageRecord[];
  imports: AssistantImportSummary[];
}> {
  return apiFetch(`/assistant/threads/${threadId}`, { accessToken });
}

export async function deleteAssistantThread(threadId: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/assistant/threads/${threadId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function sendAssistantMessage(
  threadId: string,
  input: { text: string; timezone?: string },
  accessToken: string,
): Promise<AssistantTurnResponse> {
  return apiFetch<AssistantTurnResponse>(`/assistant/threads/${threadId}/messages`, {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function uploadAssistantAttachment(
  threadId: string,
  input: { file: LocalFile; kind: 'IMAGE' | 'AUDIO'; timezone?: string },
  accessToken: string,
): Promise<AssistantTurnResponse | { transcript: string; durationMs: number | null }> {
  const form = new FormData();
  form.append('kind', input.kind);
  appendLocalFile(form, 'file', input.file);
  if (input.timezone) form.append('timezone', input.timezone);

  return apiUploadForm(`/assistant/threads/${threadId}/attachments`, form, accessToken);
}

export async function confirmAssistantActions(
  input: {
    clientRequestId: string;
    threadId?: string;
    messageId?: string;
    timezone?: string;
    items: AssistantConfirmItem[];
  },
  accessToken: string,
): Promise<{
  batchId: string;
  created: number;
  updated: number;
  deleted: number;
  transactions: AssistantTransactionSnapshot[];
  undoUntil: string;
}> {
  return apiFetch('/assistant/actions/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function undoAssistantBatch(
  batchId: string,
  accessToken: string,
): Promise<{ undone: boolean; restored: number; deleted: number }> {
  return apiFetch(`/assistant/actions/${batchId}/undo`, {
    method: 'POST',
    accessToken,
  });
}

export async function startStatementImport(
  input: { file: LocalFile; threadId?: string; timezone?: string },
  accessToken: string,
): Promise<AssistantImportSummary> {
  const form = new FormData();
  appendLocalFile(form, 'file', input.file);
  if (input.threadId) form.append('threadId', input.threadId);
  if (input.timezone) form.append('timezone', input.timezone);

  const result = await apiUploadForm<{ import: AssistantImportSummary }>(
    '/assistant/imports',
    form,
    accessToken,
  );
  return result.import;
}

export async function getStatementImport(
  importId: string,
  accessToken: string,
  options: { page?: number; status?: string; limit?: number } = {},
): Promise<AssistantImportDetail> {
  const qs = new URLSearchParams();
  if (options.page) qs.set('page', String(options.page));
  if (options.status) qs.set('status', options.status);
  if (options.limit) qs.set('limit', String(options.limit));

  return apiFetch(`/assistant/imports/${importId}?${qs.toString()}`, { accessToken });
}

export async function listStatementImports(
  accessToken: string,
): Promise<AssistantImportSummary[]> {
  const result = await apiFetch<{ imports: AssistantImportSummary[] }>('/assistant/imports', {
    accessToken,
  });
  return result.imports;
}

export async function commitStatementImport(
  importId: string,
  input: {
    clientRequestId: string;
    timezone?: string;
    rows: Array<{
      rowId: string;
      include?: boolean;
      amount?: number;
      categoryId?: string | null;
      newCategoryName?: string | null;
      newCategoryType?: CategoryType;
      date?: string;
      note?: string;
    }>;
  },
  accessToken: string,
): Promise<{ batchId: string; imported: number; skipped: number; undoUntil: string }> {
  return apiFetch(`/assistant/imports/${importId}/commit`, {
    method: 'POST',
    body: JSON.stringify(input),
    accessToken,
  });
}

export async function discardStatementImport(importId: string, accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>(`/assistant/imports/${importId}`, {
    method: 'DELETE',
    accessToken,
  });
}

export async function getAssistantUsage(accessToken: string): Promise<AssistantUsage> {
  return apiFetch<AssistantUsage>('/assistant/usage', { accessToken });
}

export async function eraseAssistantData(accessToken: string): Promise<void> {
  await apiFetch<{ message: string }>('/assistant/data', {
    method: 'DELETE',
    accessToken,
  });
}
