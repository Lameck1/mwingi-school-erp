import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../../components/patterns/PageHeader'
import { formatCurrencyFromCents } from '../../../utils/format';
import { getIPCFailureMessage, isIPCFailure } from '../../../utils/ipc'

import type { ProfitAndLossReport } from '../../../types/electron-api';

const getResultMessage = (value: unknown, fallback: string): string => {
  if (isIPCFailure(value)) {
    return getIPCFailureMessage(value, fallback)
  }
  if (value && typeof value === 'object') {
    const maybe = value as { error?: unknown; message?: unknown }
    if (typeof maybe.error === 'string' && maybe.error.trim()) {
      return maybe.error
    }
    if (typeof maybe.message === 'string' && maybe.message.trim()) {
      return maybe.message
    }
  }
  return fallback
}

const parseProfitAndLossResponse = (value: unknown): ProfitAndLossReport => {
  const fallback = 'Failed to load P&L'
  if (!value || typeof value !== 'object') {
    throw new Error(fallback)
  }
  const result = value as { success?: unknown; data?: unknown }
  if (result.success !== true) {
    throw new Error(getResultMessage(value, fallback))
  }
  if (!result.data || typeof result.data !== 'object') {
    throw new Error('Profit & Loss response did not include data')
  }
  return result.data as ProfitAndLossReport
}


const formatPercentage = (percentage: number): string => `${percentage.toFixed(1)}%`;

export default function ProfitAndLossPage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLossReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadProfitAndLoss = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = parseProfitAndLossResponse(await globalThis.electronAPI.finance.getProfitAndLoss(startDate, endDate))
      setProfitAndLoss(data);
    } catch (err) {
      setProfitAndLoss(null);
      setError(err instanceof Error ? err.message : 'Failed to load P&L');
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void loadProfitAndLoss();
  }, [loadProfitAndLoss]);

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
    <div className="space-y-8 pb-10 h-full flex flex-col">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Profit & Loss Statement"
          subtitle="Income Statement"
          breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Profit & Loss' }]}
        />
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-64" className="text-sm font-medium text-foreground/70">Period:</label>
          <input id="field-64"
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input w-auto"
            aria-label="Start date"
          />
          <span className="text-foreground/50 text-sm">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input w-auto"
            aria-label="End date"
          />
          <button
            onClick={() => { void loadProfitAndLoss() }}
            className="btn btn-primary"
          >
            Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
          <p className="text-red-500">{error}</p>
        </div>
      )}

      {profitAndLoss && (
        <div className="card overflow-hidden">
          <div className="p-4 border-b border-border/20 bg-secondary/30">
            <h3 className="font-semibold text-lg text-foreground">
              {format(new Date(profitAndLoss.period_start), 'MMM dd, yyyy')} - {' '}
              {format(new Date(profitAndLoss.period_end), 'MMM dd, yyyy')}
            </h3>
          </div>

          <div className="p-6">
            {/* Revenue Section */}
            <div className="mb-8">
              <h2 className="text-sm font-bold tracking-widest text-emerald-500 uppercase mb-4">Revenue</h2>
              <div className="space-y-1">
                {profitAndLoss.revenue_by_category.map((item) => (
                  <div key={`${item.category}-${item.amount}`} className="flex justify-between py-2 border-b border-border/10 hover:bg-white/[0.02] px-2 rounded -mx-2">
                    <div className="flex-1">
                      <span className="text-foreground/80">{item.category}</span>
                      <span className="text-foreground/40 text-sm ml-2 font-mono">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-foreground font-mono">
                      {formatCurrencyFromCents(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-border/20 font-bold text-foreground px-2 -mx-2 mt-2">
                  <span>Total Revenue</span>
                  <span className="text-emerald-500 font-mono">{formatCurrencyFromCents(profitAndLoss.total_revenue)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Section */}
            <div className="mb-8">
              <h2 className="text-sm font-bold tracking-widest text-red-500 uppercase mb-4">Expenses</h2>
              <div className="space-y-1">
                {profitAndLoss.expenses_by_category.map((item) => (
                  <div key={`${item.category}-${item.amount}`} className="flex justify-between py-2 border-b border-border/10 hover:bg-white/[0.02] px-2 rounded -mx-2">
                    <div className="flex-1">
                      <span className="text-foreground/80">{item.category}</span>
                      <span className="text-foreground/40 text-sm ml-2 font-mono">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-foreground font-mono">
                      {formatCurrencyFromCents(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-border/20 font-bold text-foreground px-2 -mx-2 mt-2">
                  <span>Total Expenses</span>
                  <span className="text-red-500 font-mono">{formatCurrencyFromCents(profitAndLoss.total_expenses)}</span>
                </div>
              </div>
            </div>

            {/* Net Profit/Loss */}
            <div className={`p-6 rounded-xl border ${profitAndLoss.net_profit >= 0 ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-foreground">
                  {profitAndLoss.net_profit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                </h2>
                <div className={`text-2xl font-bold font-mono ${profitAndLoss.net_profit >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                  {formatCurrencyFromCents(Math.abs(profitAndLoss.net_profit))}
                </div>
              </div>
              {profitAndLoss.total_revenue > 0 && (
                <div className="text-sm text-foreground/50 mt-2 font-mono">
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
