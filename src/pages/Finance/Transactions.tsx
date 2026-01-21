import { useEffect, useState } from 'react'
import { ClipboardList, Filter, Download } from 'lucide-react'

export default function Transactions() {
    const [transactions, _setTransactions] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState({ type: '', startDate: '', endDate: '' })

    useEffect(() => {
        setLoading(false)
    }, [])

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
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
                    <select value={filter.type} onChange={(e) => setFilter(prev => ({ ...prev, type: e.target.value }))}
                        aria-label="Filter by type"
                        className="input w-48">
                        <option value="">All Types</option>
                        <option value="FEE_PAYMENT">Fee Payments</option>
                        <option value="EXPENSE">Expenses</option>
                        <option value="SALARY_PAYMENT">Salaries</option>
                        <option value="DONATION">Donations</option>
                    </select>
                    <input type="date" value={filter.startDate}
                        aria-label="Start date"
                        onChange={(e) => setFilter(prev => ({ ...prev, startDate: e.target.value }))}
                        className="input w-40" placeholder="From" />
                    <input type="date" value={filter.endDate}
                        aria-label="End date"
                        onChange={(e) => setFilter(prev => ({ ...prev, endDate: e.target.value }))}
                        className="input w-40" placeholder="To" />
                    <button className="btn btn-primary flex items-center gap-2">
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
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Ref</th>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Description</th>
                                <th>Method</th>
                                <th>Debit</th>
                                <th>Credit</th>
                                <th>Recorded By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transactions.map((txn) => (
                                <tr key={txn.id}>
                                    <td className="font-mono text-sm">{txn.transaction_ref}</td>
                                    <td>{new Date(txn.transaction_date).toLocaleDateString()}</td>
                                    <td>{txn.transaction_type.replace(/_/g, ' ')}</td>
                                    <td>{txn.description || '-'}</td>
                                    <td>{txn.payment_method}</td>
                                    <td className="text-red-600">{txn.debit_credit === 'DEBIT' ? formatCurrency(txn.amount) : '-'}</td>
                                    <td className="text-green-600">{txn.debit_credit === 'CREDIT' ? formatCurrency(txn.amount) : '-'}</td>
                                    <td>{txn.recorded_by}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    )
}
