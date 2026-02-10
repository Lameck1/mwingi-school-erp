import React, { useState, useEffect } from 'react';

import { formatCurrencyFromCents } from '../../../utils/format';

interface CBCStrand {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_active: boolean;
}

interface StrandProfitability {
  strand_id: number;
  strand_name: string;
  revenue: number;
  expenses: number;
  profit: number;
  profit_margin: number;
  student_count: number;
}

const getStrandColor = (profit_margin: number): string => {
  if (profit_margin >= 20) {
    return 'bg-green-100 text-green-800';
  }
  if (profit_margin >= 0) {
    return 'bg-yellow-100 text-yellow-800';
  }
  return 'bg-red-100 text-red-800';
};

const CBCStrandManagement: React.FC = () => {
  const [, setStrands] = useState<CBCStrand[]>([]);
  const [profitability, setProfitability] = useState<StrandProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState(1);

  useEffect(() => {
    void loadData();
  }, [fiscalYear, term]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch strands from IPC (CBC handlers)
      const strandsResult = await globalThis.electronAPI.getCBCStrands();
      const strandsData: CBCStrand[] = strandsResult?.data || [];
      setStrands(strandsData);

      // Profitability data derived from strand + financial data
      // For now, map strands to profitability structure if profitability endpoint exists
      const profData: StrandProfitability[] = strandsData.map((s: CBCStrand) => ({
        strand_id: s.id,
        strand_name: s.name,
        revenue: 0,
        expenses: 0,
        profit: 0,
        profit_margin: 0,
        student_count: 0,
      }));
      setProfitability(profData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading CBC Strand Data...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">CBC Activity Management</h1>
        <p className="text-gray-600 mt-2">Track revenue, expenses, and profitability by CBC strand</p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-center">
          <div>
            <label htmlFor="field-82" className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year</label>
            <select id="field-82"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number.parseInt(e.target.value, 10))}
              className="border rounded px-3 py-2"
              aria-label="Fiscal year"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label htmlFor="field-95" className="block text-sm font-medium text-gray-700 mb-1">Term</label>
            <select id="field-95"
              value={term}
              onChange={(e) => setTerm(Number.parseInt(e.target.value, 10))}
              className="border rounded px-3 py-2"
              aria-label="Term"
            >
              <option value={1}>Term 1</option>
              <option value={2}>Term 2</option>
              <option value={3}>Term 3</option>
            </select>
          </div>
        </div>
      </div>

      {/* Profitability Overview */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b">
          <h2 className="text-xl font-semibold text-gray-800">Strand Performance Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-700 uppercase tracking-wider">Strand</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Expenses</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Profit/Loss</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Margin</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-700 uppercase tracking-wider">Students</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {profitability.map((strand) => (
                <tr key={strand.strand_id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{strand.strand_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{formatCurrencyFromCents(strand.revenue)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{formatCurrencyFromCents(strand.expenses)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-medium ${strand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrencyFromCents(strand.profit)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStrandColor(strand.profit_margin)}`}>
                      {strand.profit_margin.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-900">
                    {strand.student_count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CBCStrandManagement;
