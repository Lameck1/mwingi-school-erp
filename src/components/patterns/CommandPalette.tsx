import { Command } from 'cmdk'
import {
    LayoutDashboard, Users, UserPlus, FileText,
    CreditCard, Settings, Sun, Moon, LogOut,
    Calculator, Package, Search
} from 'lucide-react'
import { type ComponentType, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useTheme } from '../../contexts/ThemeContext'
import { useAuthStore } from '../../stores'

interface PaletteItem {
    id: string
    label: string
    icon: ComponentType<{ className?: string }>
    path?: string
    action?: () => void
    danger?: boolean
}

const NAVIGATION_ITEMS: PaletteItem[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { id: 'students', label: 'Students', icon: Users, path: '/students' },
    { id: 'fee-payments', label: 'Fee Payments', icon: CreditCard, path: '/fee-payment' },
    { id: 'inventory', label: 'Inventory', icon: Package, path: '/inventory' },
    { id: 'settings', label: 'Settings', icon: Settings, path: '/settings' }
]

const QUICK_ACTION_ITEMS: PaletteItem[] = [
    { id: 'new-student', label: 'New Student', icon: UserPlus, path: '/students/new?action=create' },
    { id: 'new-invoice', label: 'New Invoice', icon: FileText, path: '/invoices' },
    { id: 'run-payroll', label: 'Run Payroll', icon: Calculator, path: '/payroll-run' }
]

const baseItemClassName = 'flex items-center gap-2 px-2 py-2 text-sm rounded-lg cursor-pointer'
const normalItemClassName = `${baseItemClassName} text-foreground/70 dark:text-slate-200 aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400`
const dangerItemClassName = `${baseItemClassName} text-red-600 dark:text-red-400 aria-selected:bg-red-50 dark:aria-selected:bg-red-900/20`

function CommandItemButton({
    item,
    onSelect
}: Readonly<{ item: PaletteItem; onSelect: () => void }>) {
    const Icon = item.icon

    return (
        <Command.Item onSelect={onSelect} className={item.danger ? dangerItemClassName : normalItemClassName}>
            <Icon className="w-4 h-4" />
            <span>{item.label}</span>
        </Command.Item>
    )
}

function PaletteGroupItems({
    items,
    onExecute
}: Readonly<{ items: PaletteItem[]; onExecute: (item: PaletteItem) => void }>) {
    return (
        <>
            {items.map((item) => (
                <CommandItemButton key={item.id} item={item} onSelect={() => onExecute(item)} />
            ))}
        </>
    )
}

export function CommandPalette() {
    const [open, setOpen] = useState(false)
    const navigate = useNavigate()
    const { theme, toggleTheme } = useTheme()
    const { logout } = useAuthStore()

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener('keydown', down)
        const unsubscribe = globalThis.electronAPI.menuEvents.onOpenCommandPalette(() => setOpen(true))
        return () => {
            document.removeEventListener('keydown', down)
            unsubscribe()
        }
    }, [])

    const systemItems: PaletteItem[] = [
        { id: 'toggle-theme', label: 'Toggle Theme', icon: theme === 'dark' ? Sun : Moon, action: toggleTheme },
        {
            id: 'logout',
            label: 'Logout',
            icon: LogOut,
            action: () => {
                logout()
                navigate('/login')
            },
            danger: true
        }
    ]

    const executeItem = (item: PaletteItem) => {
        if (item.path) {
            navigate(item.path)
        } else {
            item.action?.()
        }
        setOpen(false)
    }

    if (!open) {return null}

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[20vh] animate-in fade-in duration-200">
            <Command className="w-full max-w-lg bg-card dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-border dark:border-slate-800 animate-in slide-in-from-top-4 duration-200">
                <div className="flex items-center border-b border-border dark:border-slate-800 px-3">
                    <Search className="w-5 h-5 text-slate-400 mr-2" />
                    <Command.Input
                        placeholder="Type a command or search..."
                        className="w-full px-2 py-4 text-base outline-none bg-transparent text-foreground dark:text-slate-100 placeholder:text-slate-400"
                    />
                </div>

                <Command.List className="max-h-[300px] overflow-y-auto p-2">
                    <Command.Empty className="py-6 text-center text-sm text-slate-500">
                        No results found.
                    </Command.Empty>

                    <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <PaletteGroupItems items={NAVIGATION_ITEMS} onExecute={executeItem} />
                    </Command.Group>

                    <Command.Separator className="h-px bg-secondary dark:bg-slate-800 my-1" />

                    <Command.Group heading="Quick Actions" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <PaletteGroupItems items={QUICK_ACTION_ITEMS} onExecute={executeItem} />
                    </Command.Group>

                    <Command.Separator className="h-px bg-secondary dark:bg-slate-800 my-1" />

                    <Command.Group heading="System" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <PaletteGroupItems items={systemItems} onExecute={executeItem} />
                    </Command.Group>
                </Command.List>
            </Command>
        </div>
    )
}
