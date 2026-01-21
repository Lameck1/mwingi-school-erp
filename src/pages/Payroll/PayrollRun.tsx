import { useState } from 'react'
import { Calculator, Play, Check, Download, AlertCircle } from 'lucide-react'

export default function PayrollRun() {
    const [month, setMonth] = useState(new Date().getMonth() + 1)
    const [year, setYear] = useState(new Date().getFullYear())
    const [payrollData, setPayrollData] = useState<any[]>([])
    const [running, setRunning] = useState(false)
    const [error, setError] = useState('')

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

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
                {payrollData.length === 0 ? (
                    <div className="text-center py-12">
                        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Payroll Data</h3>
                        <p className="text-gray-500">Select a period and click "Run Payroll" to calculate salaries</p>
                    </div>
                ) : (
                    <>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-semibold">{months[month - 1]} {year} Payroll</h3>
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
                    </>
                )}
            </div>
        </div>
    )
}