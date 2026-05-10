import { useMemo, useState } from 'react';
import type { Budget, Category, Transaction } from '../types';
import { formatCurrency, getCurrentMonth, getMonthFromDate } from '../utils/formatters';

interface BudgetSettingsProps {
  budgets: Budget[];
  categories: Category[];
  transactions: Transaction[];
  onChange: (budgets: Budget[]) => void;
}

export default function BudgetSettings({ budgets, categories, transactions, onChange }: BudgetSettingsProps) {
  const currentMonth = getCurrentMonth();
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const expenseCategories = categories.filter((c) => c.type === 'expense');

  const monthlyTransactions = useMemo(
    () => transactions.filter((t) => t.type === 'expense' && getMonthFromDate(t.date) === selectedMonth),
    [transactions, selectedMonth]
  );

  const getBudget = (catId: string) =>
    budgets.find((b) => b.categoryId === catId && b.month === selectedMonth);

  const getSpent = (catId: string) =>
    monthlyTransactions.filter((t) => t.categoryId === catId).reduce((s, t) => s + t.amount, 0);

  function handleAmountChange(catId: string, value: string) {
    const amount = parseInt(value, 10);
    const filtered = budgets.filter((b) => !(b.categoryId === catId && b.month === selectedMonth));
    if (!isNaN(amount) && amount > 0) {
      onChange([...filtered, { categoryId: catId, amount, month: selectedMonth }]);
    } else {
      onChange(filtered);
    }
  }

  const months = useMemo(() => {
    const now = new Date();
    const result: string[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    return result;
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800">予算設定</h2>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {months.map((m) => {
            const [y, mo] = m.split('-');
            return (
              <option key={m} value={m}>
                {y}年{parseInt(mo)}月
              </option>
            );
          })}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {expenseCategories.map((cat) => {
          const budget = getBudget(cat.id);
          const spent = getSpent(cat.id);
          const ratio = budget ? spent / budget.amount : 0;

          return (
            <div key={cat.id} className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <span
                  className="text-xl w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color + '25' }}
                >
                  {cat.icon}
                </span>
                <span className="flex-1 font-medium text-gray-700">{cat.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400">¥</span>
                  <input
                    type="number"
                    value={budget?.amount ?? ''}
                    onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                    placeholder="予算なし"
                    min="0"
                    className="w-32 border border-gray-300 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
              </div>

              {budget && (
                <div className="ml-12">
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>使用済み: {formatCurrency(spent)}</span>
                    <span>残り: {formatCurrency(Math.max(0, budget.amount - spent))}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        ratio > 1 ? 'bg-red-500' : ratio >= 0.8 ? 'bg-orange-400' : 'bg-emerald-400'
                      }`}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                  {ratio > 1 && (
                    <p className="text-xs text-red-500 mt-1 font-medium">
                      ⚠️ 予算を {formatCurrency(spent - budget.amount)} 超過しています
                    </p>
                  )}
                  {ratio >= 0.8 && ratio <= 1 && (
                    <p className="text-xs text-orange-500 mt-1 font-medium">
                      予算の {Math.round(ratio * 100)}% を使用しています
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
