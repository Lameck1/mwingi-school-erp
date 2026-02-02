import { useState, useEffect } from 'react'
import {
    TrendingUp, DollarSign, Activity,
    Download
} from 'lucide-react'
import { PageHeader } from '../../../components/patterns/PageHeader'
import { StatCard } from '../../../components/patterns/StatCard'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import { formatCurrency } from '../../../utils/format'
import { exportToPDF } from '../../../utils/exporters'
import { CashFlowStatement, FinancialForecast } from '../../../types/electron-api'

export default function CashFlow() {
    const [loading, setLoading] = useState(false)
    const [dateRange, setDateRange] = useState({
        start: new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10), // Start of year
        end: new Date().toISOString().slice(0, 10)
    })

    // Data state
    const [statement, setStatement] = useState<CashFlowStatement | null>(null)
    const [forecast, setForecast] = useState<FinancialForecast | null>(null)
    const [activeTab, setActiveTab] = useState<'statement' | 'forecast'>('statement')

    useEffect(() => {
        loadData()
    }, [dateRange])

    const loadData = async () => {
        setLoading(true)
        try {
            const stmt = await window.electronAPI.getCashFlowStatement(dateRange.start, dateRange.end)
            setStatement(stmt)

            const fc = await window.electronAPI.getForecast(6)
            setForecast(fc)
        } catch (error) {
            console.error(error)
        } finally {
            setLoading(false)
        }
    }

    const handleExport = () => {
        if (!statement) return
        exportToPDF({
            filename: `cash-flow-${dateRange.start}`,
            title: 'Statement of Cash Flows',
            subtitle: `Period: ${dateRange.start} to ${dateRange.end}`,
            columns: [
                { key: 'category', header: 'Category', width: 100 },
                { key: 'amount', header: 'Amount', width: 60, align: 'right', format: 'currency' }
            ],
            data: [
                { category: 'Operating Activities', amount: '' },
                { category: '  Cash Inflow from Fees', amount: statement.op_inflow },
                { category: '  Cash Outflow for Expenses', amount: statement.op_outflow * -1 },
                { category: 'Net Cash from Operating', amount: statement.op_net },
                { category: '', amount: '' },
                { category: 'Investing Activities', amount: '' },
                { category: '  Asset Purchases', amount: statement.inv_outflow * -1 },
                { category: 'Net Cash from Investing', amount: statement.inv_net },
                { category: '', amount: '' },
                { category: 'Net Change in Cash', amount: statement.net_change },
                { category: 'Closing Balance', amount: statement.closing_balance },
            ]
        })
    }

    // Chart Data Preparation
    const waterfallData = statement ? [
        { name: 'Opening', param: statement.opening_balance, fill: '#64748b' },
        { name: 'Operating', param: statement.op_net, fill: statement.op_net >= 0 ? '#22c55e' : '#ef4444' },
        { name: 'Investing', param: statement.inv_net, fill: statement.inv_net >= 0 ? '#22c55e' : '#ef4444' },
        { name: 'Financing', param: statement.fin_net, fill: statement.fin_net >= 0 ? '#22c55e' : '#ef4444' },
        { name: 'Closing', param: statement.closing_balance, fill: '#3b82f6' }
    ] : []

    // Forecast Data Combine
    const forecastChartData = forecast ? forecast.labels.map((label: string, i: number) => ({
        month: label,
        Actual: forecast.actual[i], // Whole currency units
        Projected: forecast.projected[i] // Whole currency units
    })) : []

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="Cash Flow & Forecasting"
                subtitle="Analyze cash position and future trends"
                breadcrumbs={[{ label: 'Finance' }, { label: 'Cash Flow' }]}
                actions={
                    <button onClick={handleExport} className="btn btn-secondary flex items-center gap-2">
                        <Download className="w-4 h-4" /> Export Report
                    </button>
                }
            />

            {/* Date and Tab Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center premium-card p-4">
                <div className="flex gap-2 bg-secondary/30 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('statement')}
                        className={`px-4 py-2 rounded-md transition-all duration-300 ${activeTab === 'statement' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground/70 hover:text-foreground'}`}
                    >
                        Cash Flow Statement
                    </button>
                    <button
                        onClick={() => setActiveTab('forecast')}
                        className={`px-4 py-2 rounded-md transition-all duration-300 ${activeTab === 'forecast' ? 'bg-primary text-primary-foreground shadow-lg' : 'text-foreground/70 hover:text-foreground'}`}
                    >
                        Financial Forecast
                    </button>
                </div>

                <div className="flex gap-4 items-center">
                    <input
                        type="date"
                        value={dateRange.start}
                        onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                        className="bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                    <span className="text-foreground/40">to</span>
                    <input
                        type="date"
                        value={dateRange.end}
                        onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                        className="bg-secondary/30 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                </div>
            </div>

            {loading ? (
                <div className="text-center py-20 text-foreground/40">Loading financial data...</div>
            ) : (
                <>
                    {activeTab === 'statement' && statement && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Summary Cards */}
                            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                                <StatCard label="Net Operating Cash" value={formatCurrency(statement.op_net)} icon={Activity} color={statement.op_net >= 0 ? "text-green-400" : "text-red-400"} />
                                <StatCard label="Net Investing Cash" value={formatCurrency(statement.inv_net)} icon={TrendingUp} color="text-blue-400" />
                                <StatCard label="Net Change" value={formatCurrency(statement.net_change)} icon={DollarSign} color={statement.net_change >= 0 ? "text-green-400" : "text-red-400"} />
                            </div>

                            {/* Detail Table */}
                            <div className="lg:col-span-2 premium-card">
                                <h3 className="text-lg font-bold text-foreground mb-6">Direct Method Statement</h3>
                                <div className="space-y-4">
                                    <Section title="Operating Activities" net={statement.op_net}>
                                        <Row label="Cash Inflow from Fees & Income" amount={statement.op_inflow} />
                                        <Row label="Cash Outflow for Expenses" amount={-statement.op_outflow} />
                                    </Section>
                                    <Section title="Investing Activities" net={statement.inv_net}>
                                        <Row label="Purchase of Assets" amount={-statement.inv_outflow} />
                                    </Section>
                                    <div className="pt-4 border-t border-border/20 flex justify-between items-center text-lg font-bold text-foreground">
                                        <span>Net Increase / (Decrease) in Cash</span>
                                        <span>{formatCurrency(statement.net_change)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Waterfall Chart */}
                            <div className="lg:col-span-1 premium-card flex flex-col">
                                <h3 className="text-lg font-bold text-foreground mb-6">Cash Movement</h3>
                                <div className="flex-1 min-h-[300px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={waterfallData}>
                                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} />
                                            <YAxis stroke="#94a3b8" fontSize={10} tickFormatter={(val) => (val / 1000).toFixed(0) + 'k'} />
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                                                formatter={(val: number) => formatCurrency(val)}
                                            />
                                            <Bar dataKey="param" fill="#3b82f6" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'forecast' && forecast && (
                        <div className="premium-card">
                            <h3 className="text-lg font-bold text-foreground mb-6">6-Month Cash Flow Projection</h3>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={forecastChartData}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                                        <XAxis dataKey="month" stroke="#94a3b8" />
                                        <YAxis stroke="#94a3b8" tickFormatter={(val) => (val).toFixed(0)} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155' }}
                                            formatter={(val: number) => formatCurrency(val)}
                                        />
                                        <Legend />
                                        <Line type="monotone" dataKey="Actual" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
                                        <Line type="monotone" dataKey="Projected" stroke="#22c55e" strokeDasharray="5 5" strokeWidth={2} dot={{ r: 4 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-blue-300">
                                <strong>Note:</strong> Projections are based on a 6-month simple moving average of fee collections. Future versions will include seasonality support.
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}

function Section({ title, net, children }: { title: string, net: number, children: React.ReactNode }) {
    return (
        <div className="space-y-2">
            <h4 className="text-sm font-bold text-foreground/60 uppercase tracking-wider">{title}</h4>
            <div className="pl-4 border-l-2 border-border/20 space-y-2">
                {children}
                <div className="flex justify-between items-center pt-2 font-bold text-foreground">
                    <span>Net Cash from {title.replace('Activities', '')}</span>
                    <span className={net >= 0 ? 'text-emerald-500' : 'text-red-500'}>{formatCurrency(net)}</span>
                </div>
            </div>
        </div>
    )
}

function Row({ label, amount }: { label: string, amount: number }) {
    return (
        <div className="flex justify-between items-center text-sm">
            <span className="text-foreground/80">{label}</span>
            <span className="font-mono">{formatCurrency(amount)}</span>
        </div>
    )
}
