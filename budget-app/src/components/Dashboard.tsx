import { useMemo } from 'react';
import type { Transaction, Category, Budget, ActiveView } from '../types';
import { formatCurrency, formatDate, getCurrentMonth, getMonthFromDate } from '../utils/formatters';

interface DashboardProps {
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  onViewChange: (view: ActiveView) => void;
}

export default function Dashboard({ transactions, categories, budgets, onViewChange }: DashboardProps) {
  const currentMonth = getCurrentMonth();

  const monthlyTransactions = useMemo(
    () => transactions.filter((t) => getMonthFromDate(t.date) === currentMonth),
    [transactions, currentMonth]
  );

  const totalIncome = useMemo(
    () => monthlyTransactions.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
    [monthlyTransactions]
  );

  const totalExpense = useMemo(
    () => monthlyTransactions.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
    [monthlyTransactions]
  );

  const balance = totalIncome - totalExpense;

  const budgetAlerts = useMemo(() => {
    return budgets
      .filter((b) => b.month === currentMonth)
      .map((budget) => {
        const spent = monthlyTransactions
          .filter((t) => t.type === 'expense' && t.categoryId === budget.categoryId)
          .reduce((s, t) => s + t.amount, 0);
        const category = categories.find((c) => c.id === budget.categoryId);
        const ratio = spent / budget.amount;
        return { budget, spent, category, ratio };
      })
      .filter((a) => a.ratio >= 0.8)
      .sort((a, b) => b.ratio - a.ratio);
  }, [budgets, monthlyTransactions, categories, currentMonth]);

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [transactions]
  );

  const getCategoryById = (id: string) => categories.find((c) => c.id === id);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">ダッシュボード</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="今月の収入" amount={totalIncome} color="text-emerald-600" bg="bg-emerald-50" />
        <SummaryCard label="今月の支出" amount={totalExpense} color="text-red-600" bg="bg-red-50" />
        <SummaryCard
          label="収支バランス"
          amount={balance}
          color={balance >= 0 ? 'text-blue-600' : 'text-red-600'}
          bg={balance >= 0 ? 'bg-blue-50' : 'bg-red-50'}
        />
      </div>

      {/* Budget Alerts */}
      {budgetAlerts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">⚠️ 予算アラート</h3>
          <div className="space-y-3">
            {budgetAlerts.map(({ budget, spent, category, ratio }) => (
              <div key={budget.categoryId} className="flex items-center gap-3">
                <span className="text-xl">{category?.icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{category?.name}</span>
                    <span className={ratio > 1 ? 'text-red-600 font-bold' : 'text-orange-500 font-medium'}>
                      {formatCurrency(spent)} / {formatCurrency(budget.amount)}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${ratio > 1 ? 'bg-red-500' : 'bg-orange-400'}`}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                </div>
                <span className={`text-xs font-bold ${ratio > 1 ? 'text-red-600' : 'text-orange-500'}`}>
                  {Math.round(ratio * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-700">最近の取引</h3>
          <button
            onClick={() => onViewChange('transactions')}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            すべて見る →
          </button>
        </div>
        {recentTransactions.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-4">取引がまだありません</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {recentTransactions.map((t) => {
              const cat = getCategoryById(t.categoryId);
              return (
                <div key={t.id} className="flex items-center gap-3 py-3">
                  <span className="text-xl w-8 text-center">{cat?.icon ?? '📦'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.description || cat?.name}</p>
                    <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                  </div>
                  <span
                    className={`text-sm font-semibold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}
                  >
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  amount,
  color,
  bg,
}: {
  label: string;
  amount: number;
  color: string;
  bg: string;
}) {
  return (
    <div className={`${bg} rounded-xl p-5 border border-gray-100`}>
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{formatCurrency(amount)}</p>
    </div>
  );
}
