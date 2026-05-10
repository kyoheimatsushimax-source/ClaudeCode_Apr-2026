import { useState } from 'react';
import type { Transaction, Category, Budget, ActiveView } from './types';
import { useLocalStorage } from './hooks/useLocalStorage';
import { DEFAULT_CATEGORIES, DEFAULT_TRANSACTIONS, DEFAULT_BUDGETS } from './store/budgetStore';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import TransactionList from './components/TransactionList';
import CategoryManager from './components/CategoryManager';
import BudgetSettings from './components/BudgetSettings';
import Reports from './components/Reports';
import './index.css';

export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('dashboard');
  const [transactions, setTransactions] = useLocalStorage<Transaction[]>('budget-transactions', DEFAULT_TRANSACTIONS);
  const [categories, setCategories] = useLocalStorage<Category[]>('budget-categories', DEFAULT_CATEGORIES);
  const [budgets, setBudgets] = useLocalStorage<Budget[]>('budget-budgets', DEFAULT_BUDGETS);

  function handleAddTransaction(t: Transaction) {
    setTransactions((prev) => [...prev, t]);
  }

  function handleDeleteTransaction(id: string) {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <Layout activeView={activeView} onViewChange={setActiveView}>
      {activeView === 'dashboard' && (
        <Dashboard
          transactions={transactions}
          categories={categories}
          budgets={budgets}
          onViewChange={setActiveView}
        />
      )}
      {activeView === 'transactions' && (
        <TransactionList
          transactions={transactions}
          categories={categories}
          onAdd={handleAddTransaction}
          onDelete={handleDeleteTransaction}
        />
      )}
      {activeView === 'categories' && (
        <CategoryManager categories={categories} onChange={setCategories} />
      )}
      {activeView === 'budgets' && (
        <BudgetSettings
          budgets={budgets}
          categories={categories}
          transactions={transactions}
          onChange={setBudgets}
        />
      )}
      {activeView === 'reports' && (
        <Reports transactions={transactions} categories={categories} />
      )}
    </Layout>
  );
}
