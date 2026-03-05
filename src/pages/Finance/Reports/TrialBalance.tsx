import { format } from 'date-fns';
import { useCallback, useEffect, useState } from 'react';

import { PageHeader } from '../../../components/patterns/PageHeader'
import { formatCurrencyFromCents } from '../../../utils/format';
import { getIPCFailureMessage, isIPCFailure } from '../../../utils/ipc'

import type { TrialBalanceReport } from '../../../types/electron-api';

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

const parseTrialBalanceResponse = (value: unknown): TrialBalanceReport => {
  const fallback = 'Failed to load trial balance'
  if (!value || typeof value !== 'object') {
    throw new Error(fallback)
  }
  const result = value as { success?: unknown; data?: unknown }
  if (result.success !== true) {
    throw new Error(getResultMessage(value, fallback))
  }
  if (!result.data || typeof result.data !== 'object') {
    throw new Error('Trial balance response did not include data')
  }
  return result.data as TrialBalanceReport
}


export default function TrialBalancePage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadTrialBalance = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = parseTrialBalanceResponse(await globalThis.electronAPI.finance.getTrialBalance(startDate, endDate))
      setTrialBalance(data);
    } catch (err) {
      setTrialBalance(null);
      setError(err instanceof Error ? err.message : 'Failed to load trial balance');
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate]);

  useEffect(() => {
    void loadTrialBalance();
  }, [loadTrialBalance]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-muted-foreground">Loading trial balance...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-10 h-full flex flex-col">
      <div className="flex justify-between items-start">
        <PageHeader
          title="Trial Balance"
          subtitle="Verify books are balanced"
          breadcrumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Trial Balance' }]}
        />
      </div>

      <div className="card p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-60" className="text-sm font-medium text-foreground/70">Period:</label>
          <input id="field-60"
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
            onClick={() => { void loadTrialBalance() }}
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

      {trialBalance && (
        <div className="card overflow-hidden">
          <div className={`p-4 border-b border-border/20 ${trialBalance.is_balanced ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {trialBalance.is_balanced ? '✓ Books are Balanced' : '✗ Out of Balance'}
                </h3>
                <p className="text-sm text-foreground/60">
                  {format(new Date(startDate), 'MMM dd, yyyy')} - {format(new Date(endDate), 'MMM dd, yyyy')}
                </p>
              </div>
              {!trialBalance.is_balanced && (
                <div className="text-red-500 font-medium">
                  Variance: {formatCurrencyFromCents(Math.abs(trialBalance.total_debits - trialBalance.total_credits))}
                </div>
              )}
            </div>
          </div>

          <div className="no-scrollbar overflow-x-auto">
            <table className="table w-full text-left">
              <thead>
                <tr className="text-[11px] font-bold uppercase tracking-wider text-foreground/40 border-b border-border/20">
                  <th className="px-4 py-4">Account Code</th>
                  <th className="px-4 py-4">Account Name</th>
                  <th className="px-4 py-4 text-right">Debit</th>
                  <th className="px-4 py-4 text-right">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/20">
                {trialBalance.accounts.map((account) => (
                  <tr key={account.account_code} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-4 text-sm font-medium text-foreground">{account.account_code}</td>
                    <td className="px-4 py-4 text-sm text-foreground/80">{account.account_name}</td>
                    <td className="px-4 py-4 text-sm text-right font-mono text-foreground">
                      {formatCurrencyFromCents(account.debit_total)}
                    </td>
                    <td className="px-4 py-4 text-sm text-right font-mono text-foreground">
                      {formatCurrencyFromCents(account.credit_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary/30 border-t-2 border-border/40">
                <tr>
                  <td colSpan={2} className="px-4 py-4 text-sm font-bold text-foreground">TOTAL</td>
                  <td className="px-4 py-4 text-sm font-bold text-right font-mono text-emerald-500">
                    {formatCurrencyFromCents(trialBalance.total_debits)}
                  </td>
                  <td className="px-4 py-4 text-sm font-bold text-right font-mono text-emerald-500">
                    {formatCurrencyFromCents(trialBalance.total_credits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {trialBalance.is_balanced && (
            <div className="p-4 bg-emerald-500/10 border-t border-border/20">
              <p className="text-sm text-emerald-500 text-center font-medium">
                ✓ Total Debits = Total Credits: Books are mathematically balanced
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

