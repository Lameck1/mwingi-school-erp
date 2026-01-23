import { useState, useEffect } from 'react'
import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuthStore, useAppStore } from '../stores'
import {
    LayoutDashboard, Users, Wallet, ClipboardList, Package,
    BarChart3, Settings, LogOut, ChevronDown, Shield, Database,
    FileText, CreditCard, UserCog, Calculator,
    TrendingUp,
    TrendingDown,
    TableProperties,
    LucideIcon
} from 'lucide-react'

interface NavItem {
    path?: string
    label: string
    icon: LucideIcon
    children?: NavItem[]
}

const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/students', label: 'Students', icon: Users },
    {
        label: 'Finance',
        icon: Wallet,
        children: [
            { path: '/fee-payment', label: 'Fee Payments', icon: CreditCard },
            { path: '/invoices', label: 'Invoices', icon: FileText },
            { path: '/fee-structure', label: 'Fee Structure', icon: TableProperties },
            { path: '/record-income', label: 'Record Income', icon: TrendingUp },
            { path: '/record-expense', label: 'Record Expense', icon: TrendingDown },
            { path: '/transactions', label: 'Transactions', icon: ClipboardList },
            { path: '/financial-reports', label: 'Financial Reports', icon: BarChart3 },
        ],
    },
    {
        label: 'Payroll',
        icon: Calculator,
        children: [
            { path: '/staff', label: 'Staff', icon: UserCog },
            { path: '/payroll-run', label: 'Run Payroll', icon: Calculator },
        ],
    },
    { path: '/inventory', label: 'Inventory', icon: Package },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/settings', label: 'Settings', icon: Settings },
]

const adminItems: NavItem[] = [
    { path: '/users', label: 'Users', icon: Users },
    { path: '/audit-log', label: 'Audit Log', icon: Shield },
    { path: '/backup', label: 'Backup', icon: Database },
]

export default function Layout() {
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
    }, [setSchoolSettings, setCurrentAcademicYear, setCurrentTerm])

    const handleLogout = () => {
        logout()
        navigate('/login')
    }

    const renderNavItem = (item: NavItem, isChild = false) => {
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
                            {item.children.map((child) => renderNavItem(child, true))}
                        </div>
                    )}
                </div>
            )
        }

        if (!item.path) return null

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
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* Sidebar */}
            <aside className="w-64 premium-sidebar flex flex-col z-40">
                {/* Logo Section */}
                <div className="p-8 border-b border-border/40">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30">
                            <Shield className="w-6 h-6 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold leading-tight tracking-tight text-white font-heading">
                                {schoolSettings?.school_name?.split(' ')[0] || 'Mwingi'}
                                <span className="text-primary block text-xs font-medium tracking-widest uppercase">ERP System</span>
                            </h1>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 p-4 mt-2 space-y-1 overflow-y-auto no-scrollbar">
                    {navItems.map((item) => renderNavItem(item))}

                    {user?.role === 'ADMIN' && (
                        <div className="pt-6">
                            <p className="px-4 text-[10px] text-foreground/40 uppercase tracking-[0.2em] font-bold mb-3">Administration</p>
                            {adminItems.map((item) => renderNavItem(item))}
                        </div>
                    )}
                </nav>

                {/* User Profile Section */}
                <div className="p-6 border-t border-border/40 bg-black/10">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-secondary to-slate-700 border-2 border-primary/20 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                                {user?.full_name?.charAt(0) || 'U'}
                            </div>
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card"></div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate text-white">{user?.full_name}</p>
                            <p className="text-[10px] text-primary font-bold uppercase tracking-wider">{user?.role?.replace('_', ' ')}</p>
                        </div>
                    </div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all border border-transparent hover:border-destructive/20"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {/* Global Header / Search Bar Placeholder */}
                <header className="premium-header px-8 h-20 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h2 className="text-sm font-bold text-foreground/40 uppercase tracking-widest">
                            {window.location.pathname === '/' ? 'Overview' : window.location.pathname.substring(1).replace('-', ' ')}
                        </h2>
                    </div>

                    <div className="flex items-center gap-6">
                        <div className="text-right hidden sm:block">
                            <p className="text-xs font-bold text-white">{schoolSettings?.school_name}</p>
                            <p className="text-[10px] text-foreground/40 font-medium">Academic Year 2024</p>
                        </div>
                        <div className="w-px h-8 bg-border/60"></div>
                        <button className="p-2 rounded-lg bg-secondary/50 border border-border/60 text-foreground/60 hover:text-primary transition-colors">
                            <Settings className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-auto p-8 no-scrollbar scroll-smooth">
                    <div className="max-w-7xl mx-auto animate-slide-up">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    )
}
