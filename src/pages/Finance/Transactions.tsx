import { useEffect, useState, useCallback } from 'react'
import { ClipboardList, Filter, Download } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'
import { Transaction } from '../../types/electron-api/FinanceAPI'
import { formatCurrency, formatDate } from '../../utils/format'

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
            if (appliedFilter.category_id) filterParams.category_id = parseInt(appliedFilter.category_id)
            if (appliedFilter.startDate) filterParams.transaction_date = appliedFilter.startDate
            const results = await window.electronAPI.getTransactions(filterParams)
            setTransactions(results)
        } catch (error) {
            console.error('Failed to load transactions:', error)
            showToast('Failed to load transactions', 'error')
        } finally {
            setLoading(false)
        }
    }, [appliedFilter, showToast])

    useEffect(() => {
        loadTransactions()
    }, [loadTransactions])

    const handleApplyFilter = () => {
        setAppliedFilter(filter)
    }



    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Transactions</h1>
                    <p className="text-gray-500 mt-1">View all financial transactions</p>
                </div>
                <button className="btn btn-secondary flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    <span>Export</span>
                </button>
            </div>

            <div className="card mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <select value={filter.category_id} onChange={(e) => setFilter(prev => ({ ...prev, category_id: e.target.value }))}
                        aria-label="Filter by category"
                        className="input w-48">
                        <option value="">All Categories</option>
                    </select>
                    <input type="date" value={filter.startDate}
                        aria-label="Start date"
                        onChange={(e) => setFilter(prev => ({ ...prev, startDate: e.target.value }))}
                        className="input w-40" placeholder="From" />
                    <input type="date" value={filter.endDate}
                        aria-label="End date"
                        onChange={(e) => setFilter(prev => ({ ...prev, endDate: e.target.value }))}
                        className="input w-40" placeholder="To" />
                    <button
                        onClick={handleApplyFilter}
                        className="btn btn-primary flex items-center gap-2"
                    >
                        <Filter className="w-4 h-4" />
                        Apply
                    </button>
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : transactions.length === 0 ? (
                    <div className="text-center py-12">
                        <ClipboardList className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Transactions</h3>
                        <p className="text-gray-500">Transactions will appear here as you record payments and expenses</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Ref</th>
                                    <th>Date</th>
                                    <th>Description</th>
                                    <th>Amount</th>
                                    <th>Category</th>
                                </tr>
                            </thead>
                            <tbody>
                                {transactions.map((txn) => (
                                    <tr key={txn.id}>
                                        <td className="font-mono text-sm">{txn.reference}</td>
                                        <td>{formatDate(txn.transaction_date)}</td>
                                        <td>{txn.description || '-'}</td>
                                        <td>{formatCurrency(txn.amount)}</td>
                                        <td>{txn.category_id}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}
