import { useState } from 'react'
import { Download, FileText, Users, AlertCircle, TrendingUp } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']

export default function Reports() {
    const [activeTab, setActiveTab] = useState('fee-collection')
    const [dateRange, setDateRange] = useState({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10)
    })

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount)
    }

    // Sample data for demonstration
    const feeCollectionData = [
        { month: 'Jan', amount: 520000 }, { month: 'Feb', amount: 480000 },
        { month: 'Mar', amount: 610000 }, { month: 'Apr', amount: 450000 },
        { month: 'May', amount: 580000 }, { month: 'Jun', amount: 690000 },
    ]

    const paymentMethodData = [
        { name: 'MPESA', value: 60 }, { name: 'Bank', value: 25 },
        { name: 'Cash', value: 15 },
    ]

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
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Defaulters List</h3>
                    <table className="data-table">
                        <thead>
                            <tr><th>Admission No</th><th>Student Name</th><th>Grade</th><th>Total Fees</th><th>Paid</th><th>Balance</th></tr>
                        </thead>
                        <tbody>
                            <tr><td colSpan={6} className="text-center py-8 text-gray-500">Run report to view defaulters</td></tr>
                        </tbody>
                    </table>
                </div>
            )}

            {activeTab === 'students' && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Student Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="p-4 bg-blue-50 rounded-lg text-center">
                            <p className="text-3xl font-bold text-blue-600">487</p>
                            <p className="text-sm text-gray-600">Total Students</p>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg text-center">
                            <p className="text-3xl font-bold text-green-600">342</p>
                            <p className="text-sm text-gray-600">Day Scholars</p>
                        </div>
                        <div className="p-4 bg-purple-50 rounded-lg text-center">
                            <p className="text-3xl font-bold text-purple-600">145</p>
                            <p className="text-sm text-gray-600">Boarders</p>
                        </div>
                        <div className="p-4 bg-orange-50 rounded-lg text-center">
                            <p className="text-3xl font-bold text-orange-600">23</p>
                            <p className="text-sm text-gray-600">New This Term</p>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'financial' && (
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Financial Summary</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-gray-500">Total Income</p>
                            <p className="text-2xl font-bold text-green-600">{formatCurrency(3500000)}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-gray-500">Total Expenses</p>
                            <p className="text-2xl font-bold text-red-600">{formatCurrency(2100000)}</p>
                        </div>
                        <div className="p-4 border rounded-lg">
                            <p className="text-sm text-gray-500">Net Balance</p>
                            <p className="text-2xl font-bold text-blue-600">{formatCurrency(1400000)}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
