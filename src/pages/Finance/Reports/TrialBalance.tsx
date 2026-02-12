import { format } from 'date-fns';
import { useState, useEffect } from 'react';

import { formatCurrencyFromCents } from '../../../utils/format';

import type { TrialBalanceReport } from '../../../types/electron-api';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'

export default function TrialBalancePage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [trialBalance, setTrialBalance] = useState<TrialBalanceReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadTrialBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTrialBalance = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await globalThis.electronAPI.getTrialBalance(startDate, endDate) as { success: boolean; data: TrialBalanceReport; message?: string };

      if (result.success) {
        setTrialBalance(result.data);
      } else {
        setError(result.message || 'Failed to load trial balance');
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
          <div className="text-muted-foreground">Loading trial balance...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
            <HubBreadcrumb crumbs={[{ label: 'Finance', href: '/finance' }, { label: 'Trial Balance' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">Trial Balance</h1>
        <p className="text-muted-foreground mt-1">Verify books are balanced</p>
      </div>

      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label htmlFor="field-60" className="text-sm font-medium text-foreground/70">Period:</label>
          <input id="field-60"
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
            onClick={loadTrialBalance}
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

      {trialBalance && (
        <div className="bg-card rounded-lg shadow">
          <div className={`p-4 border-b ${trialBalance.is_balanced ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {trialBalance.is_balanced ? '✓ Books are Balanced' : '✗ Out of Balance'}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {format(new Date(startDate), 'MMM dd, yyyy')} - {format(new Date(endDate), 'MMM dd, yyyy')}
                </p>
              </div>
              {!trialBalance.is_balanced && (
                <div className="text-red-600 dark:text-red-400 font-medium">
                  Variance: {formatCurrencyFromCents(Math.abs(trialBalance.total_debits - trialBalance.total_credits))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-secondary border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Account Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Account Name</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Debit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {trialBalance.accounts.map((account) => (
                  <tr key={account.account_code} className="hover:bg-secondary">
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{account.account_code}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{account.account_name}</td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">
                      {formatCurrencyFromCents(account.debit_total)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-foreground">
                      {formatCurrencyFromCents(account.credit_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-secondary border-t-2 border-foreground">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-sm font-bold text-foreground">TOTAL</td>
                  <td className="px-6 py-4 text-sm font-bold text-right text-foreground">
                    {formatCurrencyFromCents(trialBalance.total_debits)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-right text-foreground">
                    {formatCurrencyFromCents(trialBalance.total_credits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {trialBalance.is_balanced && (
            <div className="p-4 bg-blue-500/10 border-t border-border">
              <p className="text-sm text-blue-600 dark:text-blue-400 text-center">
                ✓ Total Debits = Total Credits: Books are mathematically balanced
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

