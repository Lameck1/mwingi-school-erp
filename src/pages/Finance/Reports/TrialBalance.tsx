import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { formatCurrency } from '../../../utils/format';
import { ElectronAPI } from '../../../types/electron-api';

interface TrialBalanceAccount {
  account_code: string;
  account_name: string;
  debit_total: number;
  credit_total: number;
}

interface TrialBalance {
  accounts: TrialBalanceAccount[];
  total_debits: number;
  total_credits: number;
  is_balanced: boolean;
}

export default function TrialBalancePage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [trialBalance, setTrialBalance] = useState<TrialBalance | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTrialBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadTrialBalance = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.getTrialBalance(startDate, endDate);

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
          <div className="text-gray-500">Loading trial balance...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Trial Balance</h1>
        <p className="text-gray-600 mt-1">Verify books are balanced</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Period:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
            aria-label="Start date"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md"
            aria-label="End date"
          />
          <button
            onClick={loadTrialBalance}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Generate
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {trialBalance && (
        <div className="bg-white rounded-lg shadow">
          <div className={`p-4 border-b ${trialBalance.is_balanced ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-lg">
                  {trialBalance.is_balanced ? '✓ Books are Balanced' : '✗ Out of Balance'}
                </h3>
                <p className="text-sm text-gray-600">
                  {format(new Date(startDate), 'MMM dd, yyyy')} - {format(new Date(endDate), 'MMM dd, yyyy')}
                </p>
              </div>
              {!trialBalance.is_balanced && (
                <div className="text-red-600 font-medium">
                  Variance: {formatCurrency(Math.abs(trialBalance.total_debits - trialBalance.total_credits))}
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Code</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account Name</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {trialBalance.accounts.map((account) => (
                  <tr key={account.account_code} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">{account.account_code}</td>
                    <td className="px-6 py-4 text-sm text-gray-900">{account.account_name}</td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {formatCurrency(account.debit_total)}
                    </td>
                    <td className="px-6 py-4 text-sm text-right text-gray-900">
                      {formatCurrency(account.credit_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-900">
                <tr>
                  <td colSpan={2} className="px-6 py-4 text-sm font-bold text-gray-900">TOTAL</td>
                  <td className="px-6 py-4 text-sm font-bold text-right text-gray-900">
                    {formatCurrency(trialBalance.total_debits)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-right text-gray-900">
                    {formatCurrency(trialBalance.total_credits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {trialBalance.is_balanced && (
            <div className="p-4 bg-blue-50 border-t">
              <p className="text-sm text-blue-800 text-center">
                ✓ Total Debits = Total Credits: Books are mathematically balanced
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

