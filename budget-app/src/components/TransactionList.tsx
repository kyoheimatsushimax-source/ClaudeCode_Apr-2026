import { useMemo, useState } from 'react';
import type { Transaction, Category, TransactionType } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import TransactionForm from './TransactionForm';

interface TransactionListProps {
  transactions: Transaction[];
  categories: Category[];
  onAdd: (t: Transaction) => void;
  onDelete: (id: string) => void;
}

export default function TransactionList({ transactions, categories, onAdd, onDelete }: TransactionListProps) {
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<TransactionType | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMonth, setFilterMonth] = useState('all');

  const months = useMemo(() => {
    const set = new Set(transactions.map((t) => t.date.slice(0, 7)));
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => {
        if (filterType !== 'all' && t.type !== filterType) return false;
        if (filterCategory !== 'all' && t.categoryId !== filterCategory) return false;
        if (filterMonth !== 'all' && t.date.slice(0, 7) !== filterMonth) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [transactions, filterType, filterCategory, filterMonth]);

  const getCat = (id: string) => categories.find((c) => c.id === id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">収支記録</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          ＋ 追加
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3">
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as TransactionType | 'all')}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">すべての種類</option>
          <option value="income">収入</option>
          <option value="expense">支出</option>
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">すべてのカテゴリ</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
          ))}
        </select>

        <select
          value={filterMonth}
          onChange={(e) => setFilterMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          <option value="all">すべての月</option>
          {months.map((m) => {
            const [y, mo] = m.split('-');
            return <option key={m} value={m}>{y}年{parseInt(mo)}月</option>;
          })}
        </select>
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-gray-400 text-center py-12">取引がありません</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((t) => {
              const cat = getCat(t.categoryId);
              return (
                <div key={t.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50">
                  <span
                    className="text-xl w-10 h-10 flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ backgroundColor: (cat?.color ?? '#6b7280') + '20' }}
                  >
                    {cat?.icon ?? '📦'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{t.description || cat?.name}</p>
                    <p className="text-xs text-gray-400">
                      {cat?.name} · {formatDate(t.date)}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-red-500'}`}
                  >
                    {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                  </span>
                  <button
                    onClick={() => onDelete(t.id)}
                    className="text-gray-300 hover:text-red-400 ml-2 text-lg leading-none"
                    title="削除"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <TransactionForm
          categories={categories}
          onAdd={onAdd}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
}
