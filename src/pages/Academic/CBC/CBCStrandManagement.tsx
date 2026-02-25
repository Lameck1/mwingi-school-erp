import React, { useState, useEffect, useCallback } from 'react';

import { HubBreadcrumb } from '../../../components/patterns/HubBreadcrumb'
import { useToast } from '../../../contexts/ToastContext'
import { formatCurrencyFromCents } from '../../../utils/format';
import { unwrapIPCResult } from '../../../utils/ipc'


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

const isCBCStrand = (value: unknown): value is CBCStrand =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { id?: unknown }).id === 'number' &&
  typeof (value as { name?: unknown }).name === 'string';

interface RawStrandProfitability {
  strand_id: number;
  strand_name: string;
  revenue_cents: number;
  expenses_cents: number;
  net_profit_cents: number;
  profit_margin_percent: number;
  student_count: number;
}

const isRawStrandProfitability = (value: unknown): value is RawStrandProfitability =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { strand_id?: unknown }).strand_id === 'number' &&
  typeof (value as { strand_name?: unknown }).strand_name === 'string' &&
  typeof (value as { revenue_cents?: unknown }).revenue_cents === 'number' &&
  typeof (value as { expenses_cents?: unknown }).expenses_cents === 'number' &&
  typeof (value as { net_profit_cents?: unknown }).net_profit_cents === 'number' &&
  typeof (value as { profit_margin_percent?: unknown }).profit_margin_percent === 'number' &&
  typeof (value as { student_count?: unknown }).student_count === 'number';

const parseStrandsPayload = (payload: unknown): CBCStrand[] => {
  if (Array.isArray(payload)) {
    return payload.filter((strand): strand is CBCStrand => isCBCStrand(strand));
  }
  if (typeof payload === 'object' && payload !== null && Array.isArray((payload as { data?: unknown }).data)) {
    return ((payload as { data: unknown[] }).data).filter((strand): strand is CBCStrand => isCBCStrand(strand));
  }
  throw new Error('Invalid CBC strands payload');
};

const parseProfitabilityPayload = (payload: unknown): RawStrandProfitability[] => {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is RawStrandProfitability => isRawStrandProfitability(row));
  }
  if (typeof payload === 'object' && payload !== null && Array.isArray((payload as { data?: unknown }).data)) {
    return ((payload as { data: unknown[] }).data).filter((row): row is RawStrandProfitability => isRawStrandProfitability(row));
  }
  throw new Error('Invalid CBC profitability payload');
};

const getStrandColor = (profit_margin: number): string => {
  if (profit_margin >= 20) {
    return 'bg-green-500/15 text-green-600 dark:text-green-400';
  }
  if (profit_margin >= 0) {
    return 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400';
  }
  return 'bg-red-500/15 text-red-600 dark:text-red-400';
};

const CBCStrandManagement: React.FC = () => {
  const { showToast } = useToast()
  const [profitability, setProfitability] = useState<StrandProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState(1);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [strandsPayload, profitabilityPayload] = await Promise.all([
        globalThis.electronAPI.academic.getCBCStrands(),
        globalThis.electronAPI.academic.getCBCProfitabilityReport(fiscalYear, term),
      ]);

      const resolvedStrandsPayload = unwrapIPCResult<unknown>(
        strandsPayload,
        'Failed to load CBC strands'
      );
      const strandsData = parseStrandsPayload(resolvedStrandsPayload);
      const resolvedProfitabilityPayload = unwrapIPCResult<unknown>(
        profitabilityPayload,
        'Failed to load CBC profitability report'
      );
      const profitabilityData = parseProfitabilityPayload(resolvedProfitabilityPayload);
      const profitabilityByStrand = new Map<number, RawStrandProfitability>(
        profitabilityData.map((row) => [row.strand_id, row])
      );

      // Keep strand list stable while projecting profitability values when available.
      const profData: StrandProfitability[] = strandsData.map((s: CBCStrand) => {
        const metrics = profitabilityByStrand.get(s.id);
        return {
          strand_id: s.id,
          strand_name: s.name,
          revenue: metrics?.revenue_cents ?? 0,
          expenses: metrics?.expenses_cents ?? 0,
          profit: metrics?.net_profit_cents ?? 0,
          profit_margin: metrics?.profit_margin_percent ?? 0,
          student_count: metrics?.student_count ?? 0,
        };
      });
      setProfitability(profData);
    } catch (error) {
      console.error('Error loading data:', error);
      setProfitability([]);
      showToast(error instanceof Error ? error.message : 'Failed to load CBC strand data', 'error')
    } finally {
      setLoading(false);
    }
  }, [fiscalYear, showToast, term]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading CBC Strand Data...</div>;
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
            <HubBreadcrumb crumbs={[{ label: 'Academics', href: '/academics' }, { label: 'CBC Strands' }]} />
        <h1 className="text-xl md:text-3xl font-bold text-foreground">CBC Activity Management</h1>
        <p className="text-muted-foreground mt-2">Track revenue, expenses, and profitability by CBC strand</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg shadow p-4 mb-6">
        <div className="flex gap-4 items-center">
          <div>
            <label htmlFor="field-82" className="block text-sm font-medium text-foreground/70 mb-1">Fiscal Year</label>
            <select id="field-82"
              value={fiscalYear}
              onChange={(e) => setFiscalYear(Number.parseInt(e.target.value, 10))}
              className="border border-border rounded px-3 py-2 bg-input text-foreground"
              aria-label="Fiscal year"
            >
              <option value={2024}>2024</option>
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
            </select>
          </div>
          <div>
            <label htmlFor="field-95" className="block text-sm font-medium text-foreground/70 mb-1">Term</label>
            <select id="field-95"
              value={term}
              onChange={(e) => setTerm(Number.parseInt(e.target.value, 10))}
              className="border border-border rounded px-3 py-2 bg-input text-foreground"
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
      <div className="bg-card rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 bg-secondary border-b">
          <h2 className="text-xl font-semibold text-foreground">Strand Performance Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-secondary">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-foreground/70 uppercase tracking-wider">Strand</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase tracking-wider">Revenue</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase tracking-wider">Expenses</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase tracking-wider">Profit/Loss</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase tracking-wider">Margin</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-foreground/70 uppercase tracking-wider">Students</th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {profitability.map((strand) => (
                <tr key={strand.strand_id} className="hover:bg-secondary">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">{strand.strand_name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-foreground">{formatCurrencyFromCents(strand.revenue)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="text-sm text-foreground">{formatCurrencyFromCents(strand.expenses)}</div>
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
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-foreground">
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
