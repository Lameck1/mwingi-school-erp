import { ClipboardList, Filter, Download, Calendar, Tag } from 'lucide-react'
import { useEffect, useState, useCallback } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { type Transaction } from '../../types/electron-api/FinanceAPI'
import { formatCurrencyFromCents, formatDate } from '../../utils/format'

export default function Transactions() {
    const { showToast } = useToast()

    const [transactions, setTransactions] = useState<Transaction[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState({
        category_id: '',
        transaction_date: '',
        startDate: '',
        endDate: ''
    })
    const [appliedFilter, setAppliedFilter] = useState(filter)

    const loadTransactions = useCallback(async () => {
        setLoading(true)
        try {
            const filterParams: Partial<Transaction> = {}
            if (appliedFilter.category_id) {filterParams.category_id = Number.parseInt(appliedFilter.category_id, 10)}
            if (appliedFilter.startDate) {filterParams.transaction_date = appliedFilter.startDate}
            const results = await globalThis.electronAPI.getTransactions(filterParams)
            setTransactions(results)
        } catch (error) {
            console.error('Failed to load transactions:', error)
            showToast('Failed to synchronize transaction ledger', 'error')
        } finally {
            setLoading(false)
        }
    }, [appliedFilter, showToast])

    useEffect(() => {
        void loadTransactions()
    }, [loadTransactions])

    const handleApplyFilter = () => {
        setAppliedFilter(filter)
    }

    const renderTransactionsTable = () => {
        if (loading) {
            return (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                    <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Fetching Ledger Records...</p>
                </div>
            )
        }

        if (transactions.length === 0) {
            return (
                <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                    <ClipboardList className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                    <h3 className="text-xl font-bold text-foreground/80 font-heading">Void Ledger</h3>
                    <p className="text-foreground/40 font-medium italic mb-6">No financial transactions identified within the specified parameters</p>
                </div>
            )
        }

        return (
            <div className="overflow-x-auto">
                <table className="data-table">
                    <thead>
                        <tr className="border-b border-border/40">
                            <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 px-6">Ref Identity</th>
                            <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Chronology</th>
                            <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Narrative Description</th>
                            <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Capital Magnitude</th>
                            <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-right px-8">Categorisation</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                        {transactions.map((txn) => (
                            <tr key={txn.id} className="group hover:bg-secondary/20 transition-colors">
                                <td className="py-4 px-6">
                                    <span className="font-mono text-[11px] font-bold text-primary/60 tracking-wider">#{txn.reference}</span>
                                </td>
                                <td className="py-4">
                                    <span className="text-sm font-medium text-foreground/60">{formatDate(txn.transaction_date)}</span>
                                </td>
                                <td className="py-4">
                                    <span className="text-sm font-bold text-foreground/80">{txn.description || 'Fee Payment'}</span>
                                </td>
                                <td className="py-4">
                                    <span className={`text-sm font-bold ${txn.amount < 0 ? 'text-destructive' : 'text-emerald-500'}`}>
                                        {formatCurrencyFromCents(txn.amount)}
                                    </span>
                                </td>
                                <td className="py-4 text-right px-8">
                                    <span className="px-3 py-1 bg-secondary/40 text-[10px] font-bold uppercase tracking-widest rounded-lg border border-border/20 text-foreground/40 group-hover:text-foreground/70 transition-colors">
                                        Vector {txn.category_id}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )
    }

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">Financial Ledger</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Comprehensive audit trail of all institutional capital flows</p>
                </div>
                <button className="btn btn-secondary flex items-center gap-2 py-3 px-8 text-sm font-bold border border-border/40 hover:bg-secondary/40 transition-all hover:-translate-y-1">
                    <Download className="w-5 h-5 opacity-60" />
                    <span>Export Artifact</span>
                </button>
            </div>

            <div className="premium-card animate-slide-up">
                <div className="flex flex-wrap items-center gap-6">
                    <div className="relative flex-1 min-w-[200px] group">
                        <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/20 group-focus-within:text-primary transition-colors" />
                        <select
                            value={filter.category_id}
                            onChange={(e) => setFilter(prev => ({ ...prev, category_id: e.target.value }))}
                            aria-label="Filter by category"
                            className="input w-full pl-12 bg-secondary/30 h-12"
                        >
                            <option value="">All Revenue/Expense Vectors</option>
                            {/* Categories would be mapped here */}
                        </select>
                    </div>

                    <div className="flex items-center gap-4 flex-1 min-w-[300px]">
                        <div className="relative flex-1">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20" />
                            <input
                                type="date"
                                value={filter.startDate}
                                aria-label="Start date"
                                onChange={(e) => setFilter(prev => ({ ...prev, startDate: e.target.value }))}
                                className="input w-full pl-11 bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                        <div className="relative flex-1">
                            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/20" />
                            <input
                                type="date"
                                value={filter.endDate}
                                aria-label="End date"
                                onChange={(e) => setFilter(prev => ({ ...prev, endDate: e.target.value }))}
                                className="input w-full pl-11 bg-secondary/30 h-12 text-xs font-bold uppercase tracking-tight"
                            />
                        </div>
                    </div>

                    <button
                        onClick={handleApplyFilter}
                        className="btn btn-primary flex items-center gap-2 px-8 h-12 text-sm font-bold shadow-lg shadow-primary/20"
                    >
                        <Filter className="w-4 h-4" />
                        Initialise Filter
                    </button>
                </div>
            </div>

            <div className="card overflow-hidden transition-all duration-300">
                {renderTransactionsTable()}
            </div>
        </div>
    )
}
