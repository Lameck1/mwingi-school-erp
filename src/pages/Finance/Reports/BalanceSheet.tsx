import { format } from 'date-fns';
import { useState, useEffect } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
import { formatCurrencyFromCents } from '../../../utils/format';

import type { BalanceSheetReport } from '../../../types/electron-api';


export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [balanceSheet, setBalanceSheet] = useState<BalanceSheetReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadBalanceSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBalanceSheet = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await globalThis.electronAPI.getBalanceSheet(asOfDate) as { success: boolean; data: BalanceSheetReport; message?: string };

      if (result.success) {
        setBalanceSheet(result.data);
      } else {
        setError(result.message || 'Failed to load balance sheet');
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
            onClick={loadBalanceSheet}
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

