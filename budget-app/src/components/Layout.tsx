import type { ActiveView } from '../types';

interface NavItem {
  id: ActiveView;
  label: string;
  icon: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'ダッシュボード', icon: '📊' },
  { id: 'transactions', label: '収支記録', icon: '📝' },
  { id: 'categories', label: 'カテゴリ', icon: '🏷️' },
  { id: 'budgets', label: '予算設定', icon: '🎯' },
  { id: 'reports', label: 'レポート', icon: '📈' },
];

interface LayoutProps {
  activeView: ActiveView;
  onViewChange: (view: ActiveView) => void;
  children: React.ReactNode;
}

export default function Layout({ activeView, onViewChange, children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-2xl">💴</span>
          <h1 className="text-xl font-bold text-gray-800">家計管理ツール</h1>
        </div>
      </header>
      <div className="flex flex-1">
        <nav className="w-56 bg-white border-r border-gray-200 py-4 flex-shrink-0">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm font-medium transition-colors ${
                activeView === item.id
                  ? 'bg-blue-50 text-blue-700 border-r-2 border-blue-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
