import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../../components/patterns/PageHeader'
import { formatCurrencyFromCents } from '../../../utils/format';
import { getIPCFailureMessage, isIPCFailure } from '../../../utils/ipc'

import type { BalanceSheetReport } from '../../../types/electron-api';

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

const parseBalanceSheetResponse = (value: unknown): BalanceSheetReport => {
  const fallback = 'Failed to load balance sheet'
  if (!value || typeof value !== 'object') {
    throw new Error(fallback)
  }
  const result = value as { success?: unknown; data?: unknown }
  if (result.success !== true) {
    throw new Error(getResultMessage(value, fallback))
  }
  if (!result.data || typeof result.data !== 'object') {
    throw new Error('Balance sheet response did not include data')
  }
  return result.data as BalanceSheetReport
}


export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadBalanceSheet = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = parseBalanceSheetResponse(await globalThis.electronAPI.finance.getBalanceSheet(asOfDate))
      setBalanceSheet(data);
    } catch (err) {
      setBalanceSheet(null);
      setError(err instanceof Error ? err.message : 'Failed to load balance sheet');
    } finally {
      setLoading(false);
    }
  }, [asOfDate]);

  useEffect(() => {
    void loadBalanceSheet();
  }, [loadBalanceSheet]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading balance sheet...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 h-full flex flex-col">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Balance Sheet"
          subtitle="Statement of Financial Position"
          breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Balance Sheet' }]}
        />
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-57" className="text-sm font-medium text-foreground/70">As of Date:</label>
          <input id="field-57"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="input w-auto"
            aria-label="As of date"
          />
          <button
            onClick={() => { void loadBalanceSheet() }}
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

      {balanceSheet && (
        <div className="card overflow-hidden">
          <div className={`p-4 border-b border-border/20 ${balanceSheet.is_balanced ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
            <h3 className="font-semibold">
              {balanceSheet.is_balanced ? '✓ Balanced' : '✗ Out of Balance'}
            </h3>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            <div>
              <h2 className="text-xl font-bold mb-4 text-foreground">ASSETS</h2>
              {balanceSheet.assets.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2 text-foreground/80 hover:bg-white/[0.02] px-2 rounded -mx-2">
                  <span>{account.account_name}</span>
                  <span className="font-mono">{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between py-3 border-t-2 border-border/40 font-bold text-foreground px-2 -mx-2 mt-2">
                <span>Total Assets</span>
                <span className="font-mono">{formatCurrencyFromCents(balanceSheet.total_assets)}</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4 text-foreground">LIABILITIES & EQUITY</h2>
              {balanceSheet.liabilities.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2 text-foreground/80 hover:bg-white/[0.02] px-2 rounded -mx-2">
                  <span>{account.account_name}</span>
                  <span className="font-mono">{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              {balanceSheet.equity.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2 text-foreground/80 hover:bg-white/[0.02] px-2 rounded -mx-2">
                  <span>{account.account_name}</span>
                  <span className="font-mono">{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 italic text-foreground/50 px-2 -mx-2">
                <span>Current Year Net Income</span>
                <span className="font-mono">{formatCurrencyFromCents(balanceSheet.net_income)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 border-border/40 font-bold text-foreground px-2 -mx-2 mt-2">
                <span>Total</span>
                <span className="font-mono">{formatCurrencyFromCents(balanceSheet.total_liabilities + balanceSheet.total_equity + balanceSheet.net_income)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

