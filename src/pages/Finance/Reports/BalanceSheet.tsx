import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
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
      const data = parseBalanceSheetResponse(await globalThis.electronAPI.getBalanceSheet(asOfDate))
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
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Balance Sheet' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">Balance Sheet</h1>
        <p className="text-muted-foreground mt-1">Statement of Financial Position</p>
      </div>

      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-57" className="text-sm font-medium text-foreground/70">As of Date:</label>
          <input id="field-57"
            type="date"
            value={asOfDate}
            onChange={(e) => setAsOfDate(e.target.value)}
            className="px-3 py-2 border border-border rounded-md bg-input text-foreground"
            aria-label="As of date"
          />
          <button
            onClick={() => { void loadBalanceSheet() }}
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

      {balanceSheet && (
        <div className="bg-card rounded-lg shadow">
          <div className={`p-4 border-b ${balanceSheet.is_balanced ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <h3 className="font-semibold">
              {balanceSheet.is_balanced ? '✓ Balanced' : '✗ Out of Balance'}
            </h3>
          </div>

          <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
            <div>
              <h2 className="text-xl font-bold mb-4">ASSETS</h2>
              {balanceSheet.assets.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2">
                  <span>{account.account_name}</span>
                  <span>{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>Total Assets</span>
                <span>{formatCurrencyFromCents(balanceSheet.total_assets)}</span>
              </div>
            </div>

            <div>
              <h2 className="text-xl font-bold mb-4">LIABILITIES & EQUITY</h2>
              {balanceSheet.liabilities.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2">
                  <span>{account.account_name}</span>
                  <span>{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              {balanceSheet.equity.map((account) => (
                <div key={account.account_code} className="flex justify-between py-2">
                  <span>{account.account_name}</span>
                  <span>{formatCurrencyFromCents(account.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 italic text-muted-foreground">
                <span>Current Year Net Income</span>
                <span>{formatCurrencyFromCents(balanceSheet.net_income)}</span>
              </div>
              <div className="flex justify-between py-3 border-t-2 font-bold">
                <span>Total</span>
                <span>{formatCurrencyFromCents(balanceSheet.total_liabilities + balanceSheet.total_equity + balanceSheet.net_income)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

