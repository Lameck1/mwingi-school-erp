import {
    ArrowUpRight,
    BarChart3,
    Bus,
    Calculator,
    CheckCircle,
    Database,
    GraduationCap,
    Home,
    LayoutDashboard,
    Mail,
    Package,
    Settings,
    Shield,
    UserCog,
    Users,
    Wallet,
} from 'lucide-react'

import type { NavItem } from './types'

export const navItems: NavItem[] = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard },
    {
        label: 'Students',
        icon: Users,
        children: [
            { path: '/students', label: 'Students', icon: Users },
            { path: '/students/promotions', label: 'Promotions', icon: ArrowUpRight },
            { path: '/attendance', label: 'Attendance', icon: CheckCircle }
        ]
    },
    { path: '/academics', label: 'Academics', icon: GraduationCap, activePatterns: [
        '/academic/', '/report-cards'
    ] },
    { path: '/finance', label: 'Finance', icon: Wallet, activePatterns: [
        '/finance/', '/fee-payment', '/invoices', '/transactions', '/record-expense',
        '/record-income', '/financial-reports', '/fee-structure', '/fee-exemptions',
        '/budget', '/cash-flow', '/bank-accounts', '/approvals', '/asset-hire'
    ] },
    {
        label: 'Staff & Payroll',
        icon: UserCog,
        children: [
            { path: '/staff', label: 'Staff Directory', icon: UserCog },
            { path: '/payroll-run', label: 'Run Payroll', icon: Calculator }
        ]
    },
    {
        label: 'Operations',
        icon: Package,
        children: [
            { path: '/inventory', label: 'Inventory', icon: Package },
            { path: '/operations/boarding', label: 'Boarding', icon: Home },
            { path: '/operations/transport', label: 'Transport', icon: Bus }
        ]
    },
    { path: '/reports', label: 'Reports', icon: BarChart3 },
    { path: '/communications', label: 'Communications', icon: Mail },
    { path: '/settings', label: 'Settings', icon: Settings }
]

export const adminItems: NavItem[] = [
    { path: '/users', label: 'Users', icon: Users },
    { path: '/audit-log', label: 'Audit Log', icon: Shield },
    { path: '/backup', label: 'Backup', icon: Database }
]
