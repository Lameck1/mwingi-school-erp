import { useState, useEffect } from 'react';
import { format } from 'date-fns';

interface CategoryBalance {
  category: string;
  amount: number;
  percentage: number;
}

interface ProfitAndLoss {
  period_start: string;
  period_end: string;
  revenue_by_category: CategoryBalance[];
  expenses_by_category: CategoryBalance[];
  total_revenue: number;
  total_expenses: number;
  net_profit: number;
}

export default function ProfitAndLossPage() {
  const [startDate, setStartDate] = useState<string>(
    format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [profitAndLoss, setProfitAndLoss] = useState<ProfitAndLoss | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProfitAndLoss();
  }, []);

  const loadProfitAndLoss = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await (window as unknown).electronAPI.getProfitAndLoss(startDate, endDate);
      
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

  const formatAmount = (amount: number): string => {
    return `Kes ${(amount / 100).toLocaleString('en-KE', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })}`;
  };

  const formatPercentage = (percentage: number): string => {
    return `${percentage.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading Profit & Loss statement...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Profit & Loss Statement</h1>
        <p className="text-gray-600 mt-1">Income Statement</p>
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
            onClick={loadProfitAndLoss}
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

      {profitAndLoss && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-4 border-b bg-gray-50">
            <h3 className="font-semibold text-lg">
              {format(new Date(profitAndLoss.period_start), 'MMM dd, yyyy')} - {' '}
              {format(new Date(profitAndLoss.period_end), 'MMM dd, yyyy')}
            </h3>
          </div>

          <div className="p-6">
            {/* Revenue Section */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-green-700">REVENUE</h2>
              <div className="space-y-2">
                {profitAndLoss.revenue_by_category.map((item, index) => (
                  <div key={index} className="flex justify-between py-2 border-b border-gray-100">
                    <div className="flex-1">
                      <span className="text-gray-900">{item.category}</span>
                      <span className="text-gray-500 text-sm ml-2">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-gray-900 font-medium">
                      {formatAmount(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-gray-900 font-bold">
                  <span>Total Revenue</span>
                  <span className="text-green-700">{formatAmount(profitAndLoss.total_revenue)}</span>
                </div>
              </div>
            </div>

            {/* Expenses Section */}
            <div className="mb-8">
              <h2 className="text-xl font-bold mb-4 text-red-700">EXPENSES</h2>
              <div className="space-y-2">
                {profitAndLoss.expenses_by_category.map((item, index) => (
                  <div key={index} className="flex justify-between py-2 border-b border-gray-100">
                    <div className="flex-1">
                      <span className="text-gray-900">{item.category}</span>
                      <span className="text-gray-500 text-sm ml-2">({formatPercentage(item.percentage)})</span>
                    </div>
                    <div className="text-gray-900 font-medium">
                      {formatAmount(item.amount)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between py-3 border-t-2 border-gray-900 font-bold">
                  <span>Total Expenses</span>
                  <span className="text-red-700">{formatAmount(profitAndLoss.total_expenses)}</span>
                </div>
              </div>
            </div>

            {/* Net Profit/Loss */}
            <div className={`p-4 rounded-lg ${profitAndLoss.net_profit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold">
                  {profitAndLoss.net_profit >= 0 ? 'NET PROFIT' : 'NET LOSS'}
                </h2>
                <div className={`text-2xl font-bold ${profitAndLoss.net_profit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {formatAmount(Math.abs(profitAndLoss.net_profit))}
                </div>
              </div>
              {profitAndLoss.total_revenue > 0 && (
                <div className="text-sm text-gray-600 mt-2">
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

