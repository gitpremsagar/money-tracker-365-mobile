import * as tokenStore from './token-store';

// const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3710';
const API_URL = "https://expense-tracker-api-gules-five.vercel.app";

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
        : 'Request failed';
    throw new Error(message);
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
  userId: string;
  createdAt: string;
  updatedAt: string;
};

export async function createCategory(
  input: { name: string; type: CategoryType },
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
  input: { name: string },
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

export type CategoryBreakdownItem = {
  id: string;
  name: string;
  type: CategoryType;
  total: number;
  percentage: number;
};

export type DailyTotalItem = {
  date: string;
  income: number;
  expense: number;
  saving: number;
  investment: number;
};

export type MonthlyReport = {
  month: string;
  totalIncome: number;
  totalExpense: number;
  totalSaving: number;
  totalInvestment: number;
  netBalance: number;
  categoryBreakdown: CategoryBreakdownItem[];
  dailyTotals: DailyTotalItem[];
};

export async function getMonthlyReport(month: string, accessToken: string): Promise<MonthlyReport> {
  const res = await apiFetch<{ report: MonthlyReport }>(`/reports/monthly?month=${month}`, {
    method: 'GET',
    accessToken,
  });
  return res.report;
}
