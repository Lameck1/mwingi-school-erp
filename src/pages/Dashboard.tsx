import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../stores'
import {
    Users, Wallet, TrendingUp, TrendingDown, UserCog,
    CreditCard, UserPlus, FileText, AlertCircle
} from 'lucide-react'
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts'

const COLORS = ['#2563eb', '#059669', '#d97706', '#dc2626', '#7c3aed']

export default function Dashboard() {
    const { schoolSettings, currentTerm, currentAcademicYear } = useAppStore()
    const [dashboardData, setDashboardData] = useState<any>(null)
    const [feeCollectionData, setFeeCollectionData] = useState<any[]>([])
    const [recentActivities, setRecentActivities] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        loadDashboardData()
    }, [])

    const loadDashboardData = async () => {
        try {
            const [data, feeData, logs] = await Promise.all([
                window.electronAPI.getDashboardData(),
                window.electronAPI.getFeeCollectionReport(
                    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                    new Date().toISOString().slice(0, 10)
                ),
                window.electronAPI.getAuditLog(5)
            ])
            
            setDashboardData(data)
            setRecentActivities(logs)

            // Group by month
            const monthlyData: Record<string, number> = {}
            feeData.forEach((item: any) => {
                const month = new Date(item.date).toLocaleDateString('en-US', { month: 'short' })
                monthlyData[month] = (monthlyData[month] || 0) + item.total
            })

            setFeeCollectionData(
                Object.entries(monthlyData).map(([month, total]) => ({ month, total }))
            )
        } catch (error) {
            console.error('Failed to load dashboard data:', error)
        } finally {
            setLoading(false)
        }
    }

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-KE', {
            style: 'currency',
            currency: 'KES',
            minimumFractionDigits: 0,
        }).format(amount)
    }

    const stats = [
        {
            label: 'Total Students',
            value: dashboardData?.totalStudents || 0,
            icon: Users,
            color: 'bg-blue-500',
            change: '+12',
            changeType: 'up',
        },
        {
            label: 'Fees Collected',
            value: formatCurrency(dashboardData?.feeCollected || 0),
            icon: Wallet,
            color: 'bg-green-500',
            change: '+8%',
            changeType: 'up',
        },
        {
            label: 'Outstanding Balance',
            value: formatCurrency(dashboardData?.outstandingBalance || 0),
            icon: AlertCircle,
            color: 'bg-orange-500',
            change: '-5%',
            changeType: 'down',
        },
        {
            label: 'Staff Count',
            value: dashboardData?.totalStaff || 0,
            icon: UserCog,
            color: 'bg-purple-500',
        },
    ]

    const quickActions = [
        { label: 'Record Payment', icon: CreditCard, path: '/finance/payments', color: 'bg-green-600' },
        { label: 'Add Student', icon: UserPlus, path: '/students/new', color: 'bg-blue-600' },
        { label: 'Generate Report', icon: FileText, path: '/reports', color: 'bg-purple-600' },
    ]

    const feeCategories = [
        { name: 'Tuition', value: 60 },
        { name: 'Boarding', value: 25 },
        { name: 'Transport', value: 10 },
        { name: 'Others', value: 5 },
    ]

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
        )
    }

    return (
        <div className="p-6">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900">
                    {schoolSettings?.school_name || 'Dashboard'}
                </h1>
                <p className="text-gray-500 mt-1">
                    {currentAcademicYear?.year_name} - {currentTerm?.term_name || 'Current Term'}
                </p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                {stats.map((stat, index) => (
                    <div key={index} className="stat-card">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="stat-card-label">{stat.label}</p>
                                <p className="stat-card-value mt-2">{stat.value}</p>
                                {stat.change && (
                                    <div className={`flex items-center gap-1 mt-2 text-sm ${stat.changeType === 'up' ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {stat.changeType === 'up' ? (
                                            <TrendingUp className="w-4 h-4" />
                                        ) : (
                                            <TrendingDown className="w-4 h-4" />
                                        )}
                                        <span>{stat.change}</span>
                                    </div>
                                )}
                            </div>
                            <div className={`${stat.color} p-3 rounded-lg`}>
                                <stat.icon className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Fee Collection Chart */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Collection Trend</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={feeCollectionData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="month" />
                                <YAxis tickFormatter={(value) => `${(value / 1000).toFixed(0)}K`} />
                                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                                <Bar dataKey="total" fill="#2563eb" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Fee Categories Chart */}
                <div className="card">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Fee Categories</h3>
                    <div className="h-72 flex items-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={feeCategories}
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                >
                                    {feeCategories.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Bottom Row: Recent Activities & Quick Actions */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Activities */}
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold text-gray-900">Recent Activities</h3>
                        <Link to="/settings" className="text-sm text-blue-600 hover:text-blue-700">View All</Link>
                    </div>
                    <div className="space-y-4">
                        {recentActivities.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <FileText className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                                <p>No recent activities</p>
                            </div>
                        ) : (
                            recentActivities.map((log) => (
                                <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                                    <div className="p-2 bg-blue-50 rounded-full shrink-0">
                                        <FileText className="w-4 h-4 text-blue-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{log.action}</p>
                                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                            <span className="font-medium text-gray-700">{log.user_name || 'System'}</span>
                                            <span>•</span>
                                            <span>{new Date(log.created_at).toLocaleString()}</span>
                                        </div>
                                        {log.details && (
                                            <p className="text-xs text-gray-600 mt-1 line-clamp-1">{log.details}</p>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="card h-fit">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {quickActions.map((action) => (
                            <Link
                                key={action.path}
                                to={action.path}
                                className={`${action.color} text-white px-4 py-4 rounded-lg flex items-center gap-3 hover:opacity-90 transition-opacity shadow-sm`}
                            >
                                <div className="p-2 bg-white/20 rounded-lg">
                                    <action.icon className="w-6 h-6" />
                                </div>
                                <span className="font-medium text-lg">{action.label}</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
