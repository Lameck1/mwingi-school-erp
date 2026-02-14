import { format } from 'date-fns';
import { useState, useEffect } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
import { formatCurrencyFromCents } from '../../../utils/format';

import type { ProfitAndLossReport } from '../../../types/electron-api';


const formatPercentage = (percentage: number): string => `${percentage.toFixed(1)}%`;

export default function ProfitAndLossPage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLossReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProfitAndLoss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadProfitAndLoss = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await globalThis.electronAPI.getProfitAndLoss(startDate, endDate) as { success: boolean; data: ProfitAndLossReport; message?: string };

      if (result.success) {
        setProfitAndLoss(result.data);
      } else {
        setError(result.message || 'Failed to load P&L');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading Profit & Loss statement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
            <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Profit & Loss' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">Profit & Loss Statement</h1>
        <p className="text-muted-foreground mt-1">Income Statement</p>
      </div>

      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-64" className="text-sm font-medium text-foreground/70">Period:</label>
          <input id="field-64"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
            aria-label="Start date"
          />
          <span className="text-muted-foreground">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
            aria-label="End date"
          />
          <button
            onClick={loadProfitAndLoss}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/80"
          >
            Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mb-6">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {profitAndLoss && (
        <div className="bg-card rounded-lg shadow">
          <div className="p-4 border-b bg-secondary">
            <h3 className="font-semibold text-lg">
              {format(new Date(profitAndLoss.period_start), 'MMM dd, yyyy')} - {' '}
              {format(new Date(profitAndLoss.period_end), 'MMM dd, yyyy')}
            </h3>
          </div>

          <div className="p-6">
            {/* Revenue Section */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-green-600 dark:text-green-400">REVENUE</h2>
              <div className="space-y-2">
                {profitAndLoss.revenue_by_category.map((item) => (
                  <div key={`${item.category}-${item.amount}`} className="flex justify-between py-2 border-b border-border/30">
                    <div className="flex-1">
                      <span className="text-foreground">{item.category}</span>
                      <span className="text-muted-foreground text-sm ml-2">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-foreground font-medium">
                      {formatCurrencyFromCents(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-foreground font-bold">
                  <span>Total Revenue</span>
                  <span className="text-green-600 dark:text-green-400">{formatCurrencyFromCents(profitAndLoss.total_revenue)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Section */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-red-600 dark:text-red-400">EXPENSES</h2>
              <div className="space-y-2">
                {profitAndLoss.expenses_by_category.map((item) => (
                  <div key={`${item.category}-${item.amount}`} className="flex justify-between py-2 border-b border-border/30">
                    <div className="flex-1">
                      <span className="text-foreground">{item.category}</span>
                      <span className="text-muted-foreground text-sm ml-2">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-foreground font-medium">
                      {formatCurrencyFromCents(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-foreground font-bold">
                  <span>Total Expenses</span>
                  <span className="text-red-600 dark:text-red-400">{formatCurrencyFromCents(profitAndLoss.total_expenses)}</span>
                </div>
              </div>
            </div>

            {/* Net Profit/Loss */}
            <div className={`p-4 rounded-lg ${profitAndLoss.net_profit >= 0 ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">
                  {profitAndLoss.net_profit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                </h2>
                <div className={`text-2xl font-bold ${profitAndLoss.net_profit >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {formatCurrencyFromCents(Math.abs(profitAndLoss.net_profit))}
                </div>
              </div>
              {profitAndLoss.total_revenue > 0 && (
                <div className="text-sm text-muted-foreground mt-2">
                  Profit Margin: {formatPercentage((profitAndLoss.net_profit / profitAndLoss.total_revenue) * 100)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
