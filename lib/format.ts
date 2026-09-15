import type { CategoryType, DebtStatus, DebtType, ReportPeriod } from './api';

export const TYPE_LABEL: Record<CategoryType, string> = {
  INCOME: 'Income',
  EXPENSE: 'Expense',
  SAVING: 'Saving',
  INVESTMENT: 'Investment',
};

export const TYPE_SHORT: Record<CategoryType, string> = {
  INCOME: 'Inc',
  EXPENSE: 'Exp',
  SAVING: 'Sav',
  INVESTMENT: 'Inv',
};

export const TYPE_COLORS: Record<
  CategoryType,
  { bg: string; text: string; darkBg: string; darkText: string }
> = {
  INCOME: { bg: '#d1fae5', text: '#059669', darkBg: '#064e3b', darkText: '#34d399' },
  EXPENSE: { bg: '#fee2e2', text: '#dc2626', darkBg: '#7f1d1d', darkText: '#f87171' },
  SAVING: { bg: '#dbeafe', text: '#2563eb', darkBg: '#1e3a8a', darkText: '#60a5fa' },
  INVESTMENT: { bg: '#ede9fe', text: '#7c3aed', darkBg: '#4c1d95', darkText: '#a78bfa' },
};

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export function navigateMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const d = new Date(year!, mon! - 1, 1);
  d.setMonth(d.getMonth() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(month: string): string {
  const [year, mon] = month.split('-');
  return new Date(parseInt(year!, 10), parseInt(mon!, 10) - 1, 1).toLocaleString('en-IN', {
    month: 'long',
    year: 'numeric',
  });
}

export function formatCurrency(amount: number, maximumFractionDigits = 2): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits,
  }).format(Math.abs(amount));
}

export function formatAmount(amount: number, type: CategoryType): string {
  const formatted = formatCurrency(amount);
  return type === 'INCOME' ? `+${formatted}` : `-${formatted}`;
}

export const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  TAKEN: 'Debt Taken',
  GIVEN: 'Debt Given',
};

export const DEBT_STATUS_LABEL: Record<DebtStatus, string> = {
  ACTIVE: 'Active',
  SETTLED: 'Settled',
};

export const DEBT_COLORS: Record<
  DebtType,
  { bg: string; text: string; darkBg: string; darkText: string }
> = {
  TAKEN: { bg: '#fee2e2', text: '#dc2626', darkBg: '#7f1d1d', darkText: '#f87171' },
  GIVEN: { bg: '#d1fae5', text: '#059669', darkBg: '#064e3b', darkText: '#34d399' },
};

export const DEBT_STATUS_COLORS: Record<
  DebtStatus,
  { bg: string; text: string; darkBg: string; darkText: string }
> = {
  ACTIVE: { bg: '#dbeafe', text: '#2563eb', darkBg: '#1e3a8a', darkText: '#60a5fa' },
  SETTLED: { bg: '#f4f4f5', text: '#3f3f46', darkBg: '#27272a', darkText: '#a1a1aa' },
};

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatDateOnly(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function typeIcon(type: CategoryType): string {
  return type === 'EXPENSE' ? '↓' : '↑';
}

export function currentYear(): number {
  return new Date().getFullYear();
}

export function defaultDateForPeriod(period: ReportPeriod): Date {
  const now = new Date();
  if (period.kind === 'month') {
    const [year, mon] = period.month.split('-').map(Number);
    if (year === now.getFullYear() && mon === now.getMonth() + 1) return now;
    return new Date(year!, (mon ?? 1) - 1, 1, 12, 0);
  }
  if (period.year === now.getFullYear()) return now;
  return new Date(period.year, 0, 1, 12, 0);
}
