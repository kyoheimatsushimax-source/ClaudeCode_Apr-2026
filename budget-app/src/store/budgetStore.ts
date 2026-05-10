import type { Category, Transaction, Budget } from '../types';

export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'cat-salary', name: '給与', type: 'income', color: '#10b981', icon: '💼' },
  { id: 'cat-other-income', name: 'その他収入', type: 'income', color: '#3b82f6', icon: '💰' },
  { id: 'cat-food', name: '食費', type: 'expense', color: '#ef4444', icon: '🍽️' },
  { id: 'cat-transport', name: '交通費', type: 'expense', color: '#f97316', icon: '🚃' },
  { id: 'cat-housing', name: '住居費', type: 'expense', color: '#8b5cf6', icon: '🏠' },
  { id: 'cat-utilities', name: '光熱費', type: 'expense', color: '#06b6d4', icon: '💡' },
  { id: 'cat-entertainment', name: '娯楽費', type: 'expense', color: '#ec4899', icon: '🎮' },
  { id: 'cat-health', name: '医療費', type: 'expense', color: '#14b8a6', icon: '🏥' },
  { id: 'cat-clothing', name: '衣類', type: 'expense', color: '#f59e0b', icon: '👗' },
  { id: 'cat-education', name: '教育費', type: 'expense', color: '#6366f1', icon: '📚' },
  { id: 'cat-misc', name: 'その他支出', type: 'expense', color: '#6b7280', icon: '📦' },
];

export const DEFAULT_TRANSACTIONS: Transaction[] = [];
export const DEFAULT_BUDGETS: Budget[] = [];
