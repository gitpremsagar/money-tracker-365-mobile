import type { CategoryType } from './api';

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

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function toLocalDatetimeValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function typeIcon(type: CategoryType): string {
  return type === 'EXPENSE' ? '↓' : '↑';
}
