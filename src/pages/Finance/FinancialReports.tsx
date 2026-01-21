import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, DollarSign, Download, Filter } from 'lucide-react'
import { useToast } from '../../contexts/ToastContext'

export default function FinancialReports() {
    const { showToast } = useToast()
    
    const [summary, setSummary] = useState<any[]>([])
    const [dateRange, setDateRange] = useState({
        startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10),
        endDate: new Date().toISOString().slice(0, 10)
    })

    useEffect(() => {
        loadSummary()
    }, [])

    const loadSummary = async () => {
        try {
            const data = await window.electronAPI.getTransactionSummary(dateRange.startDate, dateRange.endDate)
            setSummary(data)
        } catch (error) {
            console.error('Failed to load summary:', error)
            showToast('Failed to load financial summary', 'error')
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    const calculateTotals = () => {
        let income = 0
        let expense = 0

        summary.forEach(item => {
            if (item.debit_credit === 'CREDIT') {
                income += item.total
            } else if (item.debit_credit === 'DEBIT') {
                expense += item.total
            }
        })

        return { income, expense, net: income - expense }
    }

    const { income, expense, net } = calculateTotals()

    const incomeBreakdown = summary.filter(i => i.debit_credit === 'CREDIT')
    const expenseBreakdown = summary.filter(i => i.debit_credit === 'DEBIT')

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Financial Reports</h1>
                    <p className="text-gray-500 mt-1">Income vs Expenditure Overview</p>
                </div>
                <div className="flex gap-2">
                    <button className="btn btn-secondary flex items-center gap-2">
                        <Download className="w-5 h-5" />
                        <span>Export Report</span>
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="card mb-6 p-4">
                <div className="flex items-end gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input 
                            type="date" 
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                            className="input" 
                            aria-label="Start Date"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input 
                            type="date" 
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                            className="input" 
                            aria-label="End Date"
                        />
                    </div>
                    <button 
                        onClick={loadSummary}
                        className="btn btn-primary flex items-center gap-2 mb-0.5"
                    >
                        <Filter className="w-4 h-4" />
                        Update Report
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-green-50 rounded-lg">
                            <TrendingUp className="w-6 h-6 text-green-600" />
                        </div>
                        <span className="text-sm text-green-600 font-medium bg-green-50 px-2 py-1 rounded">Income</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(income)}</h3>
                    <p className="text-gray-500 text-sm mt-1">Total Money In</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className="p-3 bg-red-50 rounded-lg">
                            <TrendingDown className="w-6 h-6 text-red-600" />
                        </div>
                        <span className="text-sm text-red-600 font-medium bg-red-50 px-2 py-1 rounded">Expenditure</span>
                    </div>
                    <h3 className="text-2xl font-bold text-gray-900">{formatCurrency(expense)}</h3>
                    <p className="text-gray-500 text-sm mt-1">Total Money Out</p>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                        <div className={`p-3 rounded-lg ${net >= 0 ? 'bg-blue-50' : 'bg-orange-50'}`}>
                            <DollarSign className={`w-6 h-6 ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`} />
                        </div>
                        <span className={`text-sm font-medium px-2 py-1 rounded ${net >= 0 ? 'text-blue-600 bg-blue-50' : 'text-orange-600 bg-orange-50'}`}>Net Balance</span>
                    </div>
                    <h3 className={`text-2xl font-bold ${net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{formatCurrency(net)}</h3>
                    <p className="text-gray-500 text-sm mt-1">Income - Expenditure</p>
                </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Income Breakdown */}
                <div className="card">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-green-600" />
                        Income Breakdown
                    </h3>
                    <div className="space-y-4">
                        {incomeBreakdown.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No income records for this period</p>
                        ) : (
                            incomeBreakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-700 capitalize">
                                            {item.category_name || item.transaction_type.replace(/_/g, ' ').toLowerCase()}
                                        </span>
                                        {item.category_name && (
                                            <span className="text-xs text-gray-500 capitalize">
                                                {item.transaction_type.replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-bold text-gray-900">{formatCurrency(item.total)}</span>
                                </div>
                            ))
                        )}
                        <div className="border-t pt-3 flex justify-between items-center">
                            <span className="font-bold text-gray-900">Total</span>
                            <span className="font-bold text-green-600">{formatCurrency(income)}</span>
                        </div>
                    </div>
                </div>

                {/* Expense Breakdown */}
                <div className="card">
                    <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingDown className="w-5 h-5 text-red-600" />
                        Expenditure Breakdown
                    </h3>
                    <div className="space-y-4">
                        {expenseBreakdown.length === 0 ? (
                            <p className="text-gray-500 text-center py-4">No expenditure records for this period</p>
                        ) : (
                            expenseBreakdown.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-gray-700 capitalize">
                                            {item.category_name || item.transaction_type.replace(/_/g, ' ').toLowerCase()}
                                        </span>
                                        {item.category_name && (
                                            <span className="text-xs text-gray-500 capitalize">
                                                {item.transaction_type.replace(/_/g, ' ').toLowerCase()}
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-bold text-gray-900">{formatCurrency(item.total)}</span>
                                </div>
                            ))
                        )}
                        <div className="border-t pt-3 flex justify-between items-center">
                            <span className="font-bold text-gray-900">Total</span>
                            <span className="font-bold text-red-600">{formatCurrency(expense)}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
