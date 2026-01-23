import { useState, useEffect } from 'react'
import { Download, FileText, Users, AlertCircle, TrendingUp, MessageSquare, Loader2 } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { formatCurrency } from '../../utils/format'

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']

interface StudentStats {
    totalStudents: number
    dayScholars: number
    boarders: number
}

interface FinancialSummary {
    totalIncome: number
    totalExpense: number
    netBalance: number
}

export default function Reports() {
    const [activeTab, setActiveTab] = useState('fee-collection')
    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10)
    })

    const [studentStats, setStudentStats] = useState<StudentStats | null>(null)
    const [financialSummary, setFinancialSummary] = useState<FinancialSummary | null>(null)
    const [feeCollectionData, setFeeCollectionData] = useState<{ month: string; amount: number }[]>([])
    const [paymentMethodData, setPaymentMethodData] = useState<{ name: string; value: number }[]>([])
    const [defaulters, setDefaulters] = useState<any[]>([])
    const [sendingBulk, setSendingBulk] = useState(false)

    useEffect(() => {
        loadReportData()
    }, [])

    const loadReportData = async () => {
        setLoading(true)
        try {
            // Load student statistics
            const students = await window.electronAPI.getStudents({})
            const dayScholars = students.filter((s: { student_type: string }) => s.student_type === 'DAY_SCHOLAR').length
            const boarders = students.filter((s: { student_type: string }) => s.student_type === 'BOARDER').length
            setStudentStats({
                totalStudents: students.length,
                dayScholars,
                boarders
            })

            // Load financial summary
            const summary = await window.electronAPI.getTransactionSummary(dateRange.start, dateRange.end)
            setFinancialSummary(summary)

            // Load fee collection data
            const feeData = await window.electronAPI.getFeeCollectionReport(dateRange.start, dateRange.end)

            // Group by month
            const monthlyData: Record<string, number> = {}
            feeData.forEach((item: { payment_date: string; amount: number }) => {
                const month = new Date(item.payment_date).toLocaleDateString('en-US', { month: 'short' })
                monthlyData[month] = (monthlyData[month] || 0) + item.amount
            })
            setFeeCollectionData(
                Object.entries(monthlyData).map(([month, amount]) => ({ month, amount }))
            )

            // Group by payment method
            const methodData: Record<string, number> = {}
            feeData.forEach((item: { payment_method: string; amount: number }) => {
                const method = item.payment_method || 'Other'
                methodData[method] = (methodData[method] || 0) + item.amount
            })
            const total = Object.values(methodData).reduce((sum, v) => sum + v, 0) || 1
            setPaymentMethodData(
                Object.entries(methodData).map(([name, value]) => ({
                    name,
                    value: Math.round((value / total) * 100)
                }))
            )

            // Load defaulters
            const defaulterData = await window.electronAPI.getDefaulters()
            setDefaulters(defaulterData)
        } catch (error) {
            console.error('Failed to load report data:', error)
        } finally {
            setLoading(false)
        }
    }

    const tabs = [
        { id: 'fee-collection', label: 'Fee Collection', icon: TrendingUp },
        { id: 'defaulters', label: 'Fee Defaulters', icon: AlertCircle },
        { id: 'students', label: 'Student Report', icon: Users },
        { id: 'financial', label: 'Financial Summary', icon: FileText },
    ]

    return (
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
                    <p className="text-gray-500 mt-1">Generate and export school reports</p>
                </div>
                <button className="btn btn-secondary flex items-center gap-2">
                    <Download className="w-5 h-5" />
                    <span>Export PDF</span>
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6 border-b border-gray-200">
                {tabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === tab.id
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}>
                        <tab.icon className="w-4 h-4" />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Date Range Filter */}
            <div className="card mb-6">
                <div className="flex items-center gap-4">
                    <div>
                        <label className="label" htmlFor="start-date">From</label>
                        <input id="start-date" type="date" value={dateRange.start}
                            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                            className="input" />
                    </div>
                    <div>
                        <label className="label" htmlFor="end-date">To</label>
                        <input id="end-date" type="date" value={dateRange.end}
                            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                            className="input" />
                    </div>
                    <button className="btn btn-primary mt-6">Apply</button>
                </div>
            </div>

            {/* Report Content */}
            {activeTab === 'fee-collection' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Collection</h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={feeCollectionData}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="month" />
                                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} />
                                    <Tooltip formatter={(v: number) => formatCurrency(v)} />
                                    <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="card">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Methods</h3>
                        <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={paymentMethodData} innerRadius={60} outerRadius={100} dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                                        {paymentMethodData.map((_, i) => (<Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'defaulters' && (
                <div className="card">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-semibold text-gray-900">Fee Defaulters List</h3>
                        <button
                            onClick={handleBulkReminders}
                            disabled={sendingBulk || defaulters.length === 0}
                            className="btn btn-primary flex items-center gap-2"
                        >
                            {sendingBulk ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageSquare className="w-5 h-5" />}
                            <span>{sendingBulk ? 'Sending...' : 'Bulk Send Reminders'}</span>
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Admission No</th>
                                    <th>Student Name</th>
                                    <th>Grade</th>
                                    <th>Total Fees</th>
                                    <th>Paid</th>
                                    <th>Balance</th>
                                    <th>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaulters.length === 0 ? (
                                    <tr><td colSpan={7} className="text-center py-8 text-gray-500">No defaulters found</td></tr>
                                ) : (
                                    defaulters.map((d) => (
                                        <tr key={d.id}>
                                            <td className="font-mono">{d.admission_number}</td>
                                            <td>{d.first_name} {d.last_name}</td>
                                            <td>{d.stream_name || '-'}</td>
                                            <td>{formatCurrency(d.total_amount)}</td>
                                            <td className="text-green-600">{formatCurrency(d.amount_paid)}</td>
                                            <td className="text-red-600 font-bold">{formatCurrency(d.balance)}</td>
                                            <td>
                                                <button
                                                    onClick={() => handleSendReminder(d)}
                                                    className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                                                    title="Send Reminder"
                                                >
                                                    <MessageSquare className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'students' && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Statistics</h3>
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div className="p-4 bg-blue-50 rounded-lg text-center">
                                <p className="text-3xl font-bold text-blue-600">{studentStats?.totalStudents || 0}</p>
                                <p className="text-sm text-gray-600">Total Students</p>
                            </div>
                            <div className="p-4 bg-green-50 rounded-lg text-center">
                                <p className="text-3xl font-bold text-green-600">{studentStats?.dayScholars || 0}</p>
                                <p className="text-sm text-gray-600">Day Scholars</p>
                            </div>
                            <div className="p-4 bg-purple-50 rounded-lg text-center">
                                <p className="text-3xl font-bold text-purple-600">{studentStats?.boarders || 0}</p>
                                <p className="text-sm text-gray-600">Boarders</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'financial' && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
                    {loading ? (
                        <div className="text-center py-8 text-gray-500">Loading...</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="p-4 border rounded-lg">
                                <p className="text-sm text-gray-500">Total Income</p>
                                <p className="text-2xl font-bold text-green-600">{formatCurrency(financialSummary?.totalIncome || 0)}</p>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <p className="text-sm text-gray-500">Total Expenses</p>
                                <p className="text-2xl font-bold text-red-600">{formatCurrency(financialSummary?.totalExpense || 0)}</p>
                            </div>
                            <div className="p-4 border rounded-lg">
                                <p className="text-sm text-gray-500">Net Balance</p>
                                <p className="text-2xl font-bold text-blue-600">{formatCurrency(financialSummary?.netBalance || 0)}</p>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )

    async function handleSendReminder(student: any) {
        if (!student.guardian_phone) {
            alert('Guardian phone number missing')
            return
        }

        try {
            const message = `Fee Reminder: ${student.first_name} has an outstanding balance of KES ${student.balance} for ${student.invoice_number}. Please settle at your earliest convenience. Thank you.`
            const result = await (window.electronAPI as any).sendSMS({
                to: student.guardian_phone,
                message,
                recipientId: student.id,
                recipientType: 'STUDENT',
                userId: 1 // TODO: Get current user ID
            })

            if (result.success) {
                alert(`Reminder sent to ${student.first_name}'s guardian`)
            } else {
                alert('Failed to send: ' + result.error)
            }
        } catch (error) {
            alert('Error sending reminder')
        }
    }

    async function handleBulkReminders() {
        if (!confirm(`Send reminders to ${defaulters.length} guardians?`)) return

        setSendingBulk(true)
        let sent = 0
        let failed = 0

        for (const student of defaulters) {
            if (!student.guardian_phone) {
                failed++
                continue
            }

            try {
                const message = `Fee Reminder: ${student.first_name} has an outstanding balance of KES ${student.balance}. Please settle at your earliest convenience. Thank you.`
                const result = await (window.electronAPI as any).sendSMS({
                    to: student.guardian_phone,
                    message,
                    recipientId: student.id,
                    recipientType: 'STUDENT',
                    userId: 1
                })
                if (result.success) sent++
                else failed++
            } catch (error) {
                failed++
            }
        }

        setSendingBulk(false)
        alert(`Finished: ${sent} sent, ${failed} failed.`)
    }
}
