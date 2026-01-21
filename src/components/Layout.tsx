import { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../stores'
import {
    LayoutDashboard, Users, Wallet, ClipboardList, Package,
    BarChart3, Settings, LogOut, ChevronDown, Shield, Database,
    FileText, CreditCard, UserCog, Calculator,
    TrendingUp,
    TrendingDown,
    TableProperties
} from 'lucide-react'

const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/students', label: 'Students', icon: Users },
    {
        label: 'Finance',
        icon: Wallet,
        children: [
            { path: '/finance/payments', label: 'Fee Payments', icon: CreditCard },
            { path: '/finance/invoices', label: 'Invoices', icon: FileText },
            { path: '/finance/fee-structure', label: 'Fee Structure', icon: TableProperties },
            { path: '/finance/income/new', label: 'Record Income', icon: TrendingUp },
            { path: '/finance/expenses/new', label: 'Record Expense', icon: TrendingDown },
            { path: '/finance/transactions', label: 'Transactions', icon: ClipboardList },
            { path: '/finance/reports', label: 'Financial Reports', icon: BarChart3 },
        ],
    },
    {
        label: 'Payroll',
        icon: Calculator,
        children: [
            { path: '/payroll/staff', label: 'Staff', icon: UserCog },
            { path: '/payroll/run', label: 'Run Payroll', icon: Calculator },
        ],
    },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/settings', label: 'Settings', icon: Settings },
]

const adminItems = [
    { path: '/users', label: 'Users', icon: Users },
    { path: '/audit-log', label: 'Audit Log', icon: Shield },
    { path: '/backup', label: 'Backup', icon: Database },
]

export default function Layout({ children }: { children: React.ReactNode }) {
    const navigate = useNavigate()
    const { user, logout } = useAuthStore()
    const { schoolSettings, setSchoolSettings, setCurrentAcademicYear, setCurrentTerm } = useAppStore()
    const [expandedMenu, setExpandedMenu] = useState<string | null>(null)

    useEffect(() => {
        const loadGlobals = async () => {
            try {
                const [settings, year, term] = await Promise.all([
                    window.electronAPI.getSettings(),
                    window.electronAPI.getCurrentAcademicYear(),
                    window.electronAPI.getCurrentTerm()
                ])
                setSchoolSettings(settings)
                setCurrentAcademicYear(year)
                setCurrentTerm(term)
            } catch (error) {
                console.error('Failed to load global settings:', error)
            }
        }

        loadGlobals()
    }, [])

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const renderNavItem = (item: any, isChild = false) => {
        if (item.children) {
            const isExpanded = expandedMenu === item.label
            return (
                <div key={item.label}>
                    <button
                        onClick={() => setExpandedMenu(isExpanded ? null : item.label)}
                        className="w-full flex items-center justify-between px-4 py-3 text-gray-300 hover:bg-sidebar-hover rounded-lg transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            <item.icon className="w-5 h-5" />
                            <span>{item.label}</span>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </button>
                    {isExpanded && (
                        <div className="ml-4 mt-1 space-y-1">
                            {item.children.map((child: any) => renderNavItem(child, true))}
                        </div>
                    )}
                </div>
            )
        }

        return (
            <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${isActive
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-300 hover:bg-sidebar-hover'
                    } ${isChild ? 'text-sm' : ''}`
                }
            >
                <item.icon className={`${isChild ? 'w-4 h-4' : 'w-5 h-5'}`} />
                <span>{item.label}</span>
            </NavLink>
        )
    }

    return (
        <div className="flex h-screen bg-gray-50">
            {/* Sidebar */}
            <aside className="w-64 bg-sidebar-bg text-white flex flex-col">
                {/* Logo */}
                <div className="p-6 border-b border-gray-700">
                    <h1 className="text-xl font-bold">
                        {schoolSettings?.school_name || 'School ERP'}
                    </h1>
                    <p className="text-xs text-gray-400 mt-1">Management System</p>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {navItems.map((item) => renderNavItem(item))}

                    {user?.role === 'ADMIN' && (
                        <>
                            <div className="border-t border-gray-700 my-4" />
                            <p className="px-4 text-xs text-gray-500 uppercase tracking-wide mb-2">Admin</p>
                            {adminItems.map((item) => renderNavItem(item))}
                        </>
                    )}
                </nav>

                {/* User Section */}
                <div className="p-4 border-t border-gray-700">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                            {user?.full_name?.charAt(0) || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{user?.full_name}</p>
                            <p className="text-xs text-gray-400 capitalize">{user?.role?.toLowerCase().replace('_', ' ')}</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-300 hover:bg-sidebar-hover rounded-lg transition-colors"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                    </button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                {children}
            </main>
        </div>
    )
}
