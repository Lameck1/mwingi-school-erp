import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { useNavigate } from 'react-router-dom'
import {
    LayoutDashboard, Users, UserPlus, FileText,
    CreditCard, Settings, Sun, Moon, LogOut,
    Calculator, Package, Search
} from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useAuthStore } from '../../stores'

export function CommandPalette() {
    const [open, setOpen] = useState(false)
    const navigate = useNavigate()
    const { toggleTheme } = useTheme()
    const { logout } = useAuthStore()

    useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }
        document.addEventListener('keydown', down)
        return () => document.removeEventListener('keydown', down)
    }, [])

    const run = (action: () => void) => {
        action()
        setOpen(false)
    }

    if (!open) return null

    return (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start justify-center pt-[20vh] animate-in fade-in duration-200">
            <Command className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in slide-in-from-top-4 duration-200">
                <div className="flex items-center border-b border-slate-200 dark:border-slate-800 px-3">
                    <Search className="w-5 h-5 text-slate-400 mr-2" />
                    <Command.Input
                        placeholder="Type a command or search..."
                        className="w-full px-2 py-4 text-base outline-none bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                    />
                </div>

                <Command.List className="max-h-[300px] overflow-y-auto p-2">
                    <Command.Empty className="py-6 text-center text-sm text-slate-500">
                        No results found.
                    </Command.Empty>

                    <Command.Group heading="Navigation" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <Command.Item
                            onSelect={() => run(() => navigate('/'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <LayoutDashboard className="w-4 h-4" />
                            <span>Dashboard</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/students'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <Users className="w-4 h-4" />
                            <span>Students</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/fee-payment'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <CreditCard className="w-4 h-4" />
                            <span>Fee Payments</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/inventory'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <Package className="w-4 h-4" />
                            <span>Inventory</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/settings'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <Settings className="w-4 h-4" />
                            <span>Settings</span>
                        </Command.Item>
                    </Command.Group>

                    <Command.Separator className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

                    <Command.Group heading="Quick Actions" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <Command.Item
                            onSelect={() => run(() => navigate('/students/new?action=create'))} // Assuming we handle params or routing
                            // Actually pure nav for now
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <UserPlus className="w-4 h-4" />
                            <span>New Student</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/invoices'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <FileText className="w-4 h-4" />
                            <span>New Invoice</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => navigate('/payroll-run'))}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <Calculator className="w-4 h-4" />
                            <span>Run Payroll</span>
                        </Command.Item>
                    </Command.Group>

                    <Command.Separator className="h-px bg-slate-200 dark:bg-slate-800 my-1" />

                    <Command.Group heading="System" className="px-2 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">
                        <Command.Item
                            onSelect={() => run(toggleTheme)}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-slate-700 dark:text-slate-200 rounded-lg aria-selected:bg-blue-50 dark:aria-selected:bg-blue-900/20 aria-selected:text-blue-600 dark:aria-selected:text-blue-400 cursor-pointer"
                        >
                            <Sun className="w-4 h-4 dark:hidden" />
                            <Moon className="w-4 h-4 hidden dark:block" />
                            <span>Toggle Theme</span>
                        </Command.Item>
                        <Command.Item
                            onSelect={() => run(() => { logout(); navigate('/login') })}
                            className="flex items-center gap-2 px-2 py-2 text-sm text-red-600 dark:text-red-400 rounded-lg aria-selected:bg-red-50 dark:aria-selected:bg-red-900/20 cursor-pointer"
                        >
                            <LogOut className="w-4 h-4" />
                            <span>Logout</span>
                        </Command.Item>
                    </Command.Group>
                </Command.List>
            </Command>
        </div>
    )
}
