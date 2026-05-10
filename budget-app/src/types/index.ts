export type TransactionType = 'income' | 'expense';

export interface Category {
  id: string;
  name: string;
  type: TransactionType;
  color: string;
  icon: string;
}

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  categoryId: string;
  description: string;
  date: string; // ISO date string
  createdAt: string;
}

export interface Budget {
  categoryId: string;
  amount: number;
  month: string; // YYYY-MM format
}

export interface MonthlyStats {
  month: string;
  totalIncome: number;
  totalExpense: number;
  balance: number;
}

export type ActiveView = 'dashboard' | 'transactions' | 'categories' | 'budgets' | 'reports';
