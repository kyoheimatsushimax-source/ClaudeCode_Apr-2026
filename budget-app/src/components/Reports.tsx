import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
} from 'recharts';
import type { Transaction, Category } from '../types';
import { formatCurrency, formatMonthLabel, getLast6Months, getMonthFromDate } from '../utils/formatters';

interface ReportsProps {
  transactions: Transaction[];
  categories: Category[];
}

export default function Reports({ transactions, categories }: ReportsProps) {
  const last6Months = getLast6Months();

  const monthlyData = useMemo(() => {
    return last6Months.map((month) => {
      const monthTx = transactions.filter((t) => getMonthFromDate(t.date) === month);
      const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      return { month: formatMonthLabel(month), income, expense, balance: income - expense };
    });
  }, [transactions, last6Months]);

  const currentMonth = last6Months[last6Months.length - 1];

  const pieData = useMemo(() => {
    const expenseCats = categories.filter((c) => c.type === 'expense');
    return expenseCats
      .map((cat) => {
        const amount = transactions
          .filter((t) => t.type === 'expense' && t.categoryId === cat.id && getMonthFromDate(t.date) === currentMonth)
          .reduce((s, t) => s + t.amount, 0);
        return { name: cat.name, value: amount, color: cat.color, icon: cat.icon };
      })
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [transactions, categories, currentMonth]);

  const totalExpenseThisMonth = pieData.reduce((s, d) => s + d.value, 0);

  const formatYAxis = (value: number) => {
    if (value >= 10000) return `${(value / 10000).toFixed(0)}万`;
    return `${value}`;
  };

  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow p-3 text-sm">
          <p className="font-semibold text-gray-700 mb-1">{label}</p>
          {payload.map((p) => (
            <p key={p.name} style={{ color: p.fill }}>
              {p.name}: {formatCurrency(p.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">レポート</h2>

      {/* Bar chart - monthly income vs expense */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">月次収支（過去6ヶ月）</h3>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 12 }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 13 }} />
            <Bar dataKey="income" name="収入" fill="#10b981" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" name="支出" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Pie chart - this month expenses by category */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          今月の支出カテゴリ内訳 {totalExpenseThisMonth > 0 && `（合計 ${formatCurrency(totalExpenseThisMonth)}）`}
        </h3>
        {pieData.length === 0 ? (
          <p className="text-gray-400 text-center py-8">今月の支出データがありません</p>
        ) : (
          <div className="flex gap-6 flex-wrap">
            <ResponsiveContainer width={240} height={240}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: d.color }}
                  />
                  <span className="text-sm text-gray-600 flex-1 truncate">
                    {d.icon} {d.name}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{formatCurrency(d.value)}</span>
                  <span className="text-xs text-gray-400 w-10 text-right">
                    {Math.round((d.value / totalExpenseThisMonth) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Balance summary table */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">月次サマリー</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="text-left py-2 text-gray-500 font-medium">月</th>
                <th className="text-right py-2 text-gray-500 font-medium">収入</th>
                <th className="text-right py-2 text-gray-500 font-medium">支出</th>
                <th className="text-right py-2 text-gray-500 font-medium">収支</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {monthlyData.map((row) => (
                <tr key={row.month}>
                  <td className="py-2 text-gray-700">{row.month}</td>
                  <td className="py-2 text-right text-emerald-600 font-medium">{formatCurrency(row.income)}</td>
                  <td className="py-2 text-right text-red-500 font-medium">{formatCurrency(row.expense)}</td>
                  <td
                    className={`py-2 text-right font-bold ${
                      row.balance >= 0 ? 'text-blue-600' : 'text-red-600'
                    }`}
                  >
                    {row.balance >= 0 ? '+' : ''}{formatCurrency(row.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
