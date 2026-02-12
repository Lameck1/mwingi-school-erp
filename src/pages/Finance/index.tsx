import {
    BarChart3,
    Calculator,
    CheckCircle,
    CreditCard,
    DollarSign,
    FileText,
    Gift,
    Layers,
    Package,
    Percent,
    TableProperties,
    TrendingDown,
    TrendingUp,
    Users
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from '../../components/patterns/PageHeader'

interface HubCard {
    title: string
    description: string
    icon: React.ElementType
    links: { label: string; path: string }[]
}

const sections: HubCard[] = [
    {
        title: 'Fees',
        description: 'Payments, invoices, fee structure, and exemptions',
        icon: CreditCard,
        links: [
            { label: 'Fee Payments', path: '/fee-payment' },
            { label: 'Invoices', path: '/invoices' },
            { label: 'Fee Structure', path: '/fee-structure' },
            { label: 'Fee Exemptions', path: '/fee-exemptions' }
        ]
    },
    {
        title: 'Income & Expenses',
        description: 'Record transactions and track cash flow',
        icon: DollarSign,
        links: [
            { label: 'Record Income', path: '/record-income' },
            { label: 'Record Expense', path: '/record-expense' },
            { label: 'Transactions', path: '/transactions' },
            { label: 'Cash Flow', path: '/cash-flow' }
        ]
    },
    {
        title: 'Budgets & Assets',
        description: 'Budget management, fixed assets, and depreciation',
        icon: Package,
        links: [
            { label: 'Budgets', path: '/budget' },
            { label: 'Asset Register', path: '/finance/fixed-assets' },
            { label: 'Depreciation', path: '/finance/depreciation' },
            { label: 'Asset Hire', path: '/asset-hire' }
        ]
    },
    {
        title: 'Accounting',
        description: 'Chart of accounts, reconciliation, and approvals',
        icon: Calculator,
        links: [
            { label: 'Chart of Accounts', path: '/finance/gl-accounts' },
            { label: 'Opening Balances', path: '/finance/opening-balances' },
            { label: 'Bank Accounts', path: '/bank-accounts' },
            { label: 'Reconciliation', path: '/finance/reconciliation' },
            { label: 'Approvals', path: '/approvals' },
            { label: 'Approvals Queue', path: '/finance/transaction-approvals' }
        ]
    },
    {
        title: 'Reports',
        description: 'Financial statements, student costs, and grant tracking',
        icon: BarChart3,
        links: [
            { label: 'Financial Reports', path: '/financial-reports' },
            { label: 'Balance Sheet', path: '/finance/balance-sheet' },
            { label: 'Profit & Loss', path: '/finance/profit-and-loss' },
            { label: 'Trial Balance', path: '/finance/trial-balance' },
            { label: 'Student Cost', path: '/finance/student-cost' },
            { label: 'Grant Tracking', path: '/finance/grants' }
        ]
    }
]

const iconMap: Record<string, React.ElementType> = {
    'Fee Payments': CreditCard,
    'Invoices': FileText,
    'Fee Structure': TableProperties,
    'Fee Exemptions': Percent,
    'Record Income': TrendingUp,
    'Record Expense': TrendingDown,
    'Transactions': FileText,
    'Cash Flow': TrendingUp,
    'Budgets': Calculator,
    'Asset Register': Package,
    'Depreciation': TrendingDown,
    'Asset Hire': CreditCard,
    'Chart of Accounts': Layers,
    'Opening Balances': DollarSign,
    'Bank Accounts': CreditCard,
    'Reconciliation': CheckCircle,
    'Approvals': CheckCircle,
    'Approvals Queue': CheckCircle,
    'Financial Reports': BarChart3,
    'Balance Sheet': FileText,
    'Profit & Loss': TrendingUp,
    'Trial Balance': TableProperties,
    'Student Cost': Users,
    'Grant Tracking': Gift
}

export default function FinanceHub() {
    const navigate = useNavigate()

    return (
        <div className="space-y-8">
            <PageHeader
                title="Finance"
                subtitle="Fees, income, budgets, accounting, and financial reports"
            />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {sections.map((section) => (
                    <div
                        key={section.title}
                        className="premium-card group overflow-hidden"
                    >
                        <div className="p-5 border-b border-border/40 bg-secondary/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <section.icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-foreground tracking-tight">{section.title}</h3>
                                    <p className="text-[11px] text-foreground/50">{section.description}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-3 space-y-0.5">
                            {section.links.map((link) => {
                                const LinkIcon = iconMap[link.label] || FileText
                                return (
                                    <button
                                        key={link.path}
                                        onClick={() => navigate(link.path)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors text-left"
                                    >
                                        <LinkIcon className="w-4 h-4 opacity-60" />
                                        <span className="font-medium">{link.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
