import { useState, useEffect } from 'react'
import { Calculator, Play, Check, Download, AlertCircle, ChevronLeft, Eye } from 'lucide-react'

export default function PayrollRun() {
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [payrollData, setPayrollData] = useState<any[]>([])
    const [history, setHistory] = useState<any[]>([])
    const [running, setRunning] = useState(false)
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [error, setError] = useState('')
    const [selectedPeriod, setSelectedPeriod] = useState<any>(null)

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

    useEffect(() => {
        loadHistory()
    }, [])

    const loadHistory = async () => {
        setLoadingHistory(true)
        try {
            const data = await window.electronAPI.getPayrollHistory()
            setHistory(data)
        } catch (err) {
            console.error('Failed to load history', err)
        } finally {
            setLoadingHistory(false)
        }
    }

    const loadPeriodDetails = async (periodId: number) => {
        setRunning(true)
        setError('')
        try {
            const result = await window.electronAPI.getPayrollDetails(periodId)
            if (result.success) {
                setPayrollData(result.results)
                setSelectedPeriod(result.period)
            } else {
                setError(result.error)
            }
        } catch (err) {
            console.error(err)
            setError('Failed to load payroll details')
        } finally {
            setRunning(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    const runPayroll = async () => {
        setRunning(true)
        setError('')
        try {
            // TODO: Get actual user ID from auth context
            const result = await window.electronAPI.runPayroll(month, year, 1) 
            if (result.success) {
                setPayrollData(result.results || [])
                setSelectedPeriod({ period_name: `${months[month - 1]} ${year}`, status: 'DRAFT' }) // Temporary period obj
                loadHistory() // Refresh history
            } else {
                setError(result.error || 'Failed to run payroll')
            }
        } catch (err) {
            console.error(err)
            setError('An error occurred while processing payroll')
        } finally {
            setRunning(false)
        }
    }

    const handleBack = () => {
        setSelectedPeriod(null)
        setPayrollData([])
        setError('')
        loadHistory()
    }

    if (selectedPeriod || payrollData.length > 0) {
        return (
            <div className="p-6">
                <div className="flex items-center gap-4 mb-6">
                    <button onClick={handleBack} className="btn btn-secondary flex items-center gap-2">
                        <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">
                            {selectedPeriod?.period_name || 'Payroll Result'}
                        </h1>
                        <p className="text-gray-500">
                            Status: <span className="font-medium uppercase">{selectedPeriod?.status || 'New'}</span>
                        </p>
                    </div>
                </div>

                <div className="card">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-semibold">Staff Salaries</h3>
                        <div className="flex gap-2">
                            <button className="btn btn-secondary flex items-center gap-2">
                                <Download className="w-4 h-4" /> Export
                            </button>
                            <button className="btn btn-success flex items-center gap-2">
                                <Check className="w-4 h-4" /> Approve & Pay
                            </button>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Staff</th>
                                    <th className="text-right">Basic</th>
                                    <th className="text-right">Allowances</th>
                                    <th className="text-right">Gross</th>
                                    <th className="text-right">PAYE</th>
                                    <th className="text-right">NHIF</th>
                                    <th className="text-right">NSSF</th>
                                    <th className="text-right">Net Pay</th>
                                </tr>
                            </thead>
                            <tbody>
                                {payrollData.map((p: any, i: number) => (
                                    <tr key={i}>
                                        <td className="font-medium">{p.staff_name}</td>
                                        <td className="text-right">{formatCurrency(p.basic_salary)}</td>
                                        <td className="text-right">{formatCurrency(p.allowances)}</td>
                                        <td className="text-right font-medium">{formatCurrency(p.gross_salary)}</td>
                                        <td className="text-right text-red-600">{formatCurrency(p.paye)}</td>
                                        <td className="text-right text-red-600">{formatCurrency(p.nhif)}</td>
                                        <td className="text-right text-red-600">{formatCurrency(p.nssf)}</td>
                                        <td className="text-right font-bold text-green-600">{formatCurrency(p.net_salary)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Run Payroll</h1>
                    <p className="text-gray-500 mt-1">Process monthly staff salaries</p>
                </div>
            </div>

            <div className="card mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Select Period</h2>
                <div className="flex flex-wrap items-end gap-4">
                    <div>
                        <label className="label" htmlFor="month-select">Month</label>
                        <select id="month-select" value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-40">
                            {months.map((m, i) => (<option key={i} value={i + 1}>{m}</option>))}
                        </select>
                    </div>
                    <div>
                        <label className="label" htmlFor="year-input">Year</label>
                        <input id="year-input" type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                            className="input w-32" min={2020} max={2030} />
                    </div>
                    <button onClick={runPayroll} disabled={running}
                        className="btn btn-primary flex items-center gap-2">
                        {running ? <Calculator className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                        <span>{running ? 'Calculating...' : 'Run Payroll'}</span>
                    </button>
                </div>
                {error && (
                    <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                )}
            </div>

            <div className="card">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Previous Payrolls</h2>
                {loadingHistory ? (
                    <div className="py-8 text-center text-gray-500">Loading history...</div>
                ) : history.length === 0 ? (
                    <div className="py-8 text-center text-gray-500">No payroll history found</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="py-3 font-medium text-gray-500">Period</th>
                                    <th className="py-3 font-medium text-gray-500">Status</th>
                                    <th className="py-3 font-medium text-gray-500">Date Created</th>
                                    <th className="py-3 font-medium text-gray-500 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((h: any) => (
                                    <tr key={h.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                                        <td className="py-3 font-medium text-gray-900">{h.period_name}</td>
                                        <td className="py-3">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                h.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                                            }`}>
                                                {h.status}
                                            </span>
                                        </td>
                                        <td className="py-3 text-gray-500">{new Date(h.created_at).toLocaleDateString()}</td>
                                        <td className="py-3 text-right">
                                            <button 
                                                onClick={() => loadPeriodDetails(h.id)}
                                                className="btn btn-sm btn-secondary inline-flex items-center gap-1"
                                            >
                                                <Eye className="w-3 h-3" /> View
                                            </button>
                                        </td>
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