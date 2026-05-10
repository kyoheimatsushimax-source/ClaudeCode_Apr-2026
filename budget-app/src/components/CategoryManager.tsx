import { useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Category, TransactionType } from '../types';

const COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6',
  '#8b5cf6', '#ec4899', '#06b6d4', '#14b8a6', '#6366f1', '#6b7280',
];

const ICONS = ['🍽️', '🚃', '🏠', '💡', '🎮', '🏥', '👗', '📚', '📦', '💼', '💰', '🛒', '✈️', '🐾', '🎁', '💊', '🎵', '📱', '⛽', '🏋️'];

interface CategoryManagerProps {
  categories: Category[];
  onChange: (categories: Category[]) => void;
}

export default function CategoryManager({ categories, onChange }: CategoryManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [color, setColor] = useState(COLORS[0]);
  const [icon, setIcon] = useState(ICONS[0]);

  function openAdd() {
    setEditId(null);
    setName('');
    setType('expense');
    setColor(COLORS[0]);
    setIcon(ICONS[0]);
    setShowForm(true);
  }

  function openEdit(cat: Category) {
    setEditId(cat.id);
    setName(cat.name);
    setType(cat.type);
    setColor(cat.color);
    setIcon(cat.icon);
    setShowForm(true);
  }

  function handleSave() {
    if (!name.trim()) return;
    if (editId) {
      onChange(categories.map((c) => c.id === editId ? { ...c, name, type, color, icon } : c));
    } else {
      onChange([...categories, { id: uuidv4(), name: name.trim(), type, color, icon }]);
    }
    setShowForm(false);
  }

  function handleDelete(id: string) {
    onChange(categories.filter((c) => c.id !== id));
  }

  const incomeCategories = categories.filter((c) => c.type === 'income');
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">カテゴリ管理</h2>
        <button
          onClick={openAdd}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700"
        >
          ＋ カテゴリ追加
        </button>
      </div>

      <CategoryGroup title="収入カテゴリ" categories={incomeCategories} onEdit={openEdit} onDelete={handleDelete} />
      <CategoryGroup title="支出カテゴリ" categories={expenseCategories} onEdit={openEdit} onDelete={handleDelete} />

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-800 mb-4">{editId ? 'カテゴリを編集' : 'カテゴリを追加'}</h3>
            <div className="space-y-4">
              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-white text-gray-600'}`}
                >
                  支出
                </button>
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 py-2 text-sm font-semibold transition-colors ${type === 'income' ? 'bg-emerald-500 text-white' : 'bg-white text-gray-600'}`}
                >
                  収入
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">カテゴリ名</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="カテゴリ名"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">アイコン</label>
                <div className="flex flex-wrap gap-2">
                  {ICONS.map((ic) => (
                    <button
                      key={ic}
                      type="button"
                      onClick={() => setIcon(ic)}
                      className={`text-xl w-9 h-9 rounded-lg flex items-center justify-center border-2 transition-colors ${icon === ic ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
                    >
                      {ic}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">カラー</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-white'}`}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 bg-blue-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryGroup({
  title,
  categories,
  onEdit,
  onDelete,
}: {
  title: string;
  categories: Category[];
  onEdit: (c: Category) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-base font-semibold text-gray-600 mb-3">{title}</h3>
      {categories.length === 0 ? (
        <p className="text-gray-400 text-sm">カテゴリがありません</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {categories.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-2 p-3 rounded-lg border border-gray-100 hover:bg-gray-50"
            >
              <span
                className="text-xl w-9 h-9 flex items-center justify-center rounded-full flex-shrink-0"
                style={{ backgroundColor: c.color + '25' }}
              >
                {c.icon}
              </span>
              <span className="flex-1 text-sm font-medium text-gray-700 truncate">{c.name}</span>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onEdit(c)}
                  className="text-gray-400 hover:text-blue-500 text-xs px-1"
                  title="編集"
                >
                  ✏️
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="text-gray-400 hover:text-red-400 text-xs px-1"
                  title="削除"
                >
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
