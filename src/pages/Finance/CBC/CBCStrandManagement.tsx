import React, { useState, useEffect } from 'react';
import { formatCurrency } from '../../../utils/format';

interface CBCStrand {
  id: number;
  code: string;
  name: string;
  description: string;
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

const CBCStrandManagement: React.FC = () => {
  const [, setStrands] = useState<CBCStrand[]>([]);
  const [profitability, setProfitability] = useState<StrandProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState(1);

  useEffect(() => {
    loadData();
  }, [fiscalYear, term]);

  const loadData = async () => {
    try {
      setLoading(true);
      // Mock data - replace with actual API calls
      const strandsData: CBCStrand[] = [
        { id: 1, code: 'PERF_ARTS', name: 'Performing Arts', description: 'Music, Drama, Dance', is_active: true },
        { id: 2, code: 'SPORTS', name: 'Sports & Physical Education', description: 'Athletics, Team Sports', is_active: true },
        { id: 3, code: 'HOME_SCI', name: 'Home Science', description: 'Food, Nutrition, Textiles', is_active: true },
        { id: 4, code: 'AGRICULTURE', name: 'Agriculture', description: 'Farming, Livestock', is_active: true },
        { id: 5, code: 'ICT', name: 'Information Technology', description: 'Computer Studies', is_active: true },
        { id: 6, code: 'SCIENCE', name: 'Science & Technology', description: 'Laboratory, STEM', is_active: true },
        { id: 7, code: 'BUSINESS', name: 'Business & Entrepreneurship', description: 'Business Studies', is_active: true }
      ];
      
      const profData: StrandProfitability[] = [
        { strand_id: 1, strand_name: 'Performing Arts', revenue: 600000, expenses: 700000, profit: -100000, profit_margin: -16.7, student_count: 45 },
        { strand_id: 2, strand_name: 'Sports & Physical Education', revenue: 800000, expenses: 500000, profit: 300000, profit_margin: 37.5, student_count: 120 },
        { strand_id: 3, strand_name: 'Home Science', revenue: 350000, expenses: 320000, profit: 30000, profit_margin: 8.6, student_count: 30 },
        { strand_id: 4, strand_name: 'Agriculture', revenue: 400000, expenses: 250000, profit: 150000, profit_margin: 37.5, student_count: 35 },
        { strand_id: 5, strand_name: 'Information Technology', revenue: 500000, expenses: 450000, profit: 50000, profit_margin: 10.0, student_count: 50 },
        { strand_id: 6, strand_name: 'Science & Technology', revenue: 450000, expenses: 420000, profit: 30000, profit_margin: 6.7, student_count: 40 },
        { strand_id: 7, strand_name: 'Business & Entrepreneurship', revenue: 300000, expenses: 280000, profit: 20000, profit_margin: 6.7, student_count: 25 }
      ];
      
      setStrands(strandsData);
      setProfitability(profData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStrandColor = (profit_margin: number) => {
    if (profit_margin >= 20) return 'bg-green-100 text-green-800';
    if (profit_margin >= 0) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year</label>
            <select
              value={fiscalYear}
              onChange={(e) => setFiscalYear(parseInt(e.target.value))}
              className="border rounded px-3 py-2"
              aria-label="Fiscal year"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
            <select
              value={term}
              onChange={(e) => setTerm(parseInt(e.target.value))}
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
                    <div className="text-sm text-gray-900">{formatCurrency(strand.revenue)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-gray-900">{formatCurrency(strand.expenses)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className={`text-sm font-medium ${strand.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(strand.profit)}
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
