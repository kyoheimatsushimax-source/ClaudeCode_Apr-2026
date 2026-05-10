import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Transaction, Category, TransactionType } from '../types';

interface TransactionFormProps {
  categories: Category[];
  onAdd: (transaction: Transaction) => void;
  onClose: () => void;
}

export default function TransactionForm({ categories, onAdd, onClose }: TransactionFormProps) {
  const today = new Date().toISOString().split('T')[0];
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');

  const filteredCategories = categories.filter((c) => c.type === type);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amountNum = parseInt(amount, 10);
    if (!amountNum || amountNum <= 0) {
      setError('金額を正しく入力してください');
      return;
    }
    if (!categoryId) {
      setError('カテゴリを選択してください');
      return;
    }
    if (!date) {
      setError('日付を選択してください');
      return;
    }

    const now = new Date().toISOString();
    onAdd({
      id: uuidv4(),
      type,
      amount: amountNum,
      categoryId,
      description,
      date,
      createdAt: now,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-800 mb-5">取引を追加</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type toggle */}
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              type="button"
              onClick={() => { setType('expense'); setCategoryId(''); }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                type === 'expense' ? 'bg-red-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              支出
            </button>
            <button
              type="button"
              onClick={() => { setType('income'); setCategoryId(''); }}
              className={`flex-1 py-2 text-sm font-semibold transition-colors ${
                type === 'income' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              収入
            </button>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">金額（円）</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <option value="">カテゴリを選択</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">メモ（任意）</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="メモを入力..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">日付</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700"
            >
              追加する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
