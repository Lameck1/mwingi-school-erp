import {
    ArrowUpRight,
    BarChart3,
    Bus,
    Calculator,
    CheckCircle,
    ChevronDown,
    Database,
    GraduationCap,
    Home,
    LayoutDashboard,
    LogOut,
    Mail,
    Menu,
    Moon,
    Package,
    Settings,
    Shield,
    Sun,
    type LucideIcon,
    UserCog,
    Users,
    Wallet,
    WifiOff,
    X
} from 'lucide-react'
import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { useTheme } from '../contexts/ThemeContext'
import { useToast } from '../contexts/ToastContext'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useAppStore, useAuthStore } from '../stores'
import { printCurrentView } from '../utils/print'
import { CommandPalette } from './patterns/CommandPalette'

import type { UpdateStatus } from '../types/electron-api'
import type { User } from '../types/electron-api/UserAPI'

interface NavItem {
    path?: string
    label: string
    icon: LucideIcon
    children?: NavItem[]
    /** Additional path prefixes that should keep this item highlighted as active */
    activePatterns?: string[]
}

interface LayoutModel {
    user: User | null
    schoolName: string
    currentAcademicYearName: string
    isOnline: boolean
    isSidebarOpen: boolean
    setIsSidebarOpen: (open: boolean) => void
    expandedMenus: string[]
    toggleMenu: (label: string, siblingLabels: string[]) => void
    pathname: string
    theme: 'dark' | 'light'
    toggleTheme: () => void
    handleLogout: () => void
}

const navItems: NavItem[] = [
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

const adminItems: NavItem[] = [
    { path: '/users', label: 'Users', icon: Users },
    { path: '/audit-log', label: 'Audit Log', icon: Shield },
    { path: '/backup', label: 'Backup', icon: Database }
]

function getSectionTitle(pathname: string): string {
    if (pathname === '/') {
        return 'Overview'
    }
    const [firstSegment] = pathname.substring(1).split('/')
    return firstSegment.replace('-', ' ')
}

function pathMatches(pathname: string, itemPath: string): boolean {
    if (itemPath === '/') return pathname === '/'
    return pathname === itemPath || pathname.startsWith(itemPath + '/')
}

/** Walk the nav tree and return the chain of parent labels leading to `pathname`. */
function findMenuChainForPath(pathname: string, items: NavItem[]): string[] | null {
    for (const item of items) {
        if (item.path && pathMatches(pathname, item.path)) {
            return []
        }
        if (item.children) {
            const result = findMenuChainForPath(pathname, item.children)
            if (result !== null) {
                return [item.label, ...result]
            }
        }
    }
    return null
}

function PageLoader() {
    return (
        <div className="space-y-6 animate-pulse pt-2">
            <div className="h-7 w-56 bg-secondary/50 rounded-lg" />
            <div className="flex gap-4">
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl" />
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl" />
                <div className="h-24 flex-1 bg-secondary/30 rounded-xl hidden md:block" />
            </div>
            <div className="h-96 bg-secondary/20 rounded-xl" />
        </div>
    )
}

function useLoadGlobalSettings(): Pick<LayoutModel, 'schoolName' | 'currentAcademicYearName'> {
    const { schoolSettings, currentAcademicYear, setSchoolSettings, setCurrentAcademicYear, setCurrentTerm } = useAppStore()

    useEffect(() => {
        void (async () => {
            try {
                const [settings, year, term] = await Promise.all([
                    globalThis.electronAPI.getSettings(),
                    globalThis.electronAPI.getCurrentAcademicYear(),
                    globalThis.electronAPI.getCurrentTerm()
                ])
                setSchoolSettings(settings)
                setCurrentAcademicYear(year)
                setCurrentTerm(term)
            } catch (error) {
                console.error('Failed to load global settings:', error)
            }
        })()
    }, [setSchoolSettings, setCurrentAcademicYear, setCurrentTerm])

    return {
        schoolName: schoolSettings?.school_name || '',
        currentAcademicYearName: currentAcademicYear?.year_name || ''
    }
}

function useElectronLayoutEvents(navigate: ReturnType<typeof useNavigate>, showToast: ReturnType<typeof useToast>['showToast']) {
    useEffect(() => {
        const unsubscribeNavigate = globalThis.electronAPI.onNavigate((path) => navigate(path))
        const unsubscribePrint = globalThis.electronAPI.onTriggerPrint(() => printCurrentView({ title: 'Page Print Preview' }))
        const unsubscribeImport = globalThis.electronAPI.onOpenImportDialog(() => navigate('/students?import=1'))
        const unsubscribeBackup = globalThis.electronAPI.onBackupDatabase((filePath) => {
            void (async () => {
                try {
                    const result = await globalThis.electronAPI.createBackupTo(filePath)
                    showToast(result.success ? 'Backup saved successfully' : 'Backup failed', result.success ? 'success' : 'error')
                } catch (error) {
                    showToast(error instanceof Error ? error.message : 'Backup failed', 'error')
                }
            })()
        })
        const unsubscribeCheckUpdates = globalThis.electronAPI.onCheckForUpdates(() => {
            globalThis.electronAPI.checkForUpdates().catch((error) => {
                showToast(error instanceof Error ? error.message : 'Update check failed', 'error')
            })
        })
        const unsubscribeUpdateStatus = globalThis.electronAPI.onUpdateStatus((data: UpdateStatus) => {
            if (data.status === 'available') { showToast(`Update available: v${data.version}`, 'info'); return }
            if (data.status === 'downloading') { showToast(`Downloading update: ${data.progress}%`, 'info'); return }
            if (data.status === 'downloaded') { showToast(`Update ready: v${data.version}`, 'success'); return }
            if (data.status === 'error') { showToast(data.error, 'error'); return }
            if (data.status === 'not-available') { showToast('No updates available', 'info') }
        })
        const unsubscribeDbError = globalThis.electronAPI.onDatabaseError((message) => showToast(message, 'error'))

        return () => {
            unsubscribeNavigate()
            unsubscribePrint()
            unsubscribeImport()
            unsubscribeBackup()
            unsubscribeCheckUpdates()
            unsubscribeUpdateStatus()
            unsubscribeDbError()
        }
    }, [navigate, showToast])
}

function useLayoutModel(): LayoutModel {
    const navigate = useNavigate()
    const location = useLocation()
    const isOnline = useNetworkStatus()
    const { user, logout } = useAuthStore()
    const { theme, toggleTheme } = useTheme()
    const { showToast } = useToast()
    const [expandedMenus, setExpandedMenus] = useState<string[]>(() =>
        findMenuChainForPath(location.pathname, [...navItems, ...adminItems]) ?? []
    )
    const [isSidebarOpen, setIsSidebarOpen] = useState(false)
    const { schoolName, currentAcademicYearName } = useLoadGlobalSettings()

    useElectronLayoutEvents(navigate, showToast)

    // Auto-expand the menu section matching the current route
    useEffect(() => {
        const chain = findMenuChainForPath(location.pathname, [...navItems, ...adminItems])
        if (chain !== null) {
            setExpandedMenus(chain)
        }
    }, [location.pathname])

    return {
        user,
        schoolName,
        currentAcademicYearName,
        isOnline,
        isSidebarOpen,
        setIsSidebarOpen,
        expandedMenus,
        toggleMenu: (label: string, siblingLabels: string[]) => setExpandedMenus((previous) => {
            if (previous.includes(label)) {
                return previous.filter((item) => item !== label)
            }
            return [...previous.filter((item) => !siblingLabels.includes(item)), label]
        }),
        pathname: location.pathname,
        theme,
        toggleTheme,
        handleLogout: () => {
            logout()
            navigate('/login')
        }
    }
}

interface NavTreeProps {
    items: NavItem[]
    expandedMenus: string[]
    toggleMenu: (label: string, siblingLabels: string[]) => void
    closeSidebar: () => void
    isChild?: boolean
}

function NavTree({ items, expandedMenus, toggleMenu, closeSidebar, isChild = false }: Readonly<NavTreeProps>) {
    const siblingLabels = items.filter(i => i.children).map(i => i.label)
    const location = useLocation()

    return (
        <>
            {items.map((item) => {
                if (item.children) {
                    const isExpanded = expandedMenus.includes(item.label)
                    return (
                        <div key={item.label}>
                            <button
                                onClick={() => toggleMenu(item.label, siblingLabels)}
                                className="w-full flex items-center justify-between px-4 py-3 text-foreground/60 hover:bg-secondary rounded-lg transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon className="w-5 h-5" />
                                    <span>{item.label}</span>
                                </div>
                                <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <div className={`grid transition-[grid-template-rows] duration-200 ease-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                                <div className="overflow-hidden">
                                    <div className="ml-4 mt-1 space-y-1">
                                        <NavTree
                                            items={item.children}
                                            expandedMenus={expandedMenus}
                                            toggleMenu={toggleMenu}
                                            closeSidebar={closeSidebar}
                                            isChild={true}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }
                if (!item.path) {
                    return null
                }

                // Check if this item should be active based on activePatterns
                const isPatternActive = item.activePatterns?.some(
                    pattern => location.pathname.startsWith(pattern)
                ) ?? false

                return (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={closeSidebar}
                        className={({ isActive }) => {
                            const active = isActive || isPatternActive
                            return `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${active
                                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                                : 'text-foreground/60 hover:bg-secondary'
                            } ${isChild ? 'text-sm' : ''}`
                        }}
                    >
                        <item.icon className={isChild ? 'w-4 h-4' : 'w-5 h-5'} />
                        <span>{item.label}</span>
                    </NavLink>
                )
            })}
        </>
    )
}

interface SidebarProps {
    model: LayoutModel
}

function Sidebar({ model }: Readonly<SidebarProps>) {
    const shortSchoolName = model.schoolName.split(' ')[0] || 'Mwingi'

    return (
        <aside className={`fixed inset-y-0 left-0 w-64 premium-sidebar flex flex-col z-50 transition-transform duration-500 ease-out lg:relative lg:translate-x-0 ${model.isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
            <div className="p-8 border-b border-border/40 relative">
                <button onClick={() => model.setIsSidebarOpen(false)} title="Close sidebar" className="absolute top-4 right-4 p-2 lg:hidden text-foreground/40 hover:text-primary transition-colors">
                    <X className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-indigo-600 flex items-center justify-center shadow-lg shadow-primary/30">
                        <Shield className="w-6 h-6 text-white" />
                    </div>
                    <h1 className="text-lg font-bold leading-tight tracking-tight text-foreground font-heading">
                        {shortSchoolName}
                        <span className="text-primary block text-xs font-medium tracking-widest uppercase">ERP System</span>
                    </h1>
                </div>
            </div>

            <nav className="flex-1 p-4 mt-2 space-y-1 overflow-y-auto no-scrollbar">
                <NavTree
                    items={navItems}
                    expandedMenus={model.expandedMenus}
                    toggleMenu={model.toggleMenu}
                    closeSidebar={() => model.setIsSidebarOpen(false)}
                />
                {model.user?.role === 'ADMIN' && (
                    <div className="pt-6">
                        <p className="px-4 text-[10px] text-foreground/40 uppercase tracking-[0.2em] font-bold mb-3">Administration</p>
                        <NavTree
                            items={adminItems}
                            expandedMenus={model.expandedMenus}
                            toggleMenu={model.toggleMenu}
                            closeSidebar={() => model.setIsSidebarOpen(false)}
                        />
                    </div>
                )}
            </nav>

            <div className="p-6 border-t border-border/40 bg-secondary/30">
                <div className="flex items-center gap-4 mb-6">
                    <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-secondary to-slate-700 border-2 border-primary/20 flex items-center justify-center text-white font-bold text-sm shadow-inner">
                            {model.user?.full_name.charAt(0) || 'U'}
                        </div>
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success rounded-full border-2 border-card"></div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate text-foreground">{model.user?.full_name}</p>
                        <p className="text-[10px] text-primary font-bold uppercase tracking-wider">{model.user?.role.replace('_', ' ')}</p>
                    </div>
                </div>
                <button onClick={model.handleLogout} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold text-foreground/60 hover:text-destructive hover:bg-destructive/10 rounded-xl transition-all border border-transparent hover:border-destructive/20">
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    )
}

interface HeaderProps {
    model: LayoutModel
}

function Header({ model }: Readonly<HeaderProps>) {
    const sectionTitle = useMemo(() => getSectionTitle(model.pathname), [model.pathname])

    return (
        <header className="premium-header px-4 lg:px-8 h-20 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
                <button onClick={() => model.setIsSidebarOpen(true)} title="Open sidebar" className="p-2 lg:hidden text-foreground/60 hover:text-primary transition-colors bg-secondary/20 rounded-lg">
                    <Menu className="w-5 h-5" />
                </button>
                <h2 className="text-sm font-bold text-foreground/40 uppercase tracking-widest hidden sm:block">{sectionTitle}</h2>
            </div>

            <div className="flex items-center gap-6">
                <div className="text-right hidden sm:block">
                    <p className="text-xs font-bold text-foreground">{model.schoolName}</p>
                    <p className="text-[10px] text-foreground/40 font-medium">
                        {model.currentAcademicYearName ? `Academic Year ${model.currentAcademicYearName}` : 'Academic Year'}
                    </p>
                </div>
                <div className="hidden md:flex items-center gap-2 mr-4 text-foreground/40 text-xs font-medium bg-secondary/30 px-3 py-1.5 rounded-lg border border-border/40">
                    <span>Command Palette</span>
                    <kbd className="hidden sm:inline-block px-1.5 font-mono text-[10px] bg-background border border-border rounded shadow-sm">Ctrl K</kbd>
                </div>
                <div className="w-px h-8 bg-border/60"></div>
                <div className="flex items-center gap-2 p-1.5 bg-secondary/50 border border-border/60 rounded-xl">
                    <button onClick={model.toggleTheme} title="Toggle theme" className="p-2 rounded-lg hover:bg-secondary text-foreground/60 transition-colors">
                        {model.theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                    <button title="Settings" className="p-2 rounded-lg hover:bg-secondary text-foreground/60 transition-colors">
                        <Settings className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </header>
    )
}

function OfflineBanner() {
    return (
        <div className="bg-red-500 text-white px-4 py-1 text-xs font-bold text-center flex items-center justify-center gap-2 animate-in slide-in-from-top">
            <WifiOff className="w-3 h-3" />
            <span>OFFLINE MODE: Cloud features (Email/SMS) are unavailable. Local features work normally.</span>
        </div>
    )
}

interface SidebarBackdropProps {
    isOpen: boolean
    closeSidebar: () => void
}

function SidebarBackdrop({ isOpen, closeSidebar }: Readonly<SidebarBackdropProps>) {
    if (!isOpen) {
        return null
    }

    return (
        <button
            type="button"
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-300"
            onClick={closeSidebar}
            aria-label="Close sidebar"
        />
    )
}

export default function Layout() {
    const model = useLayoutModel()
    const mainRef = useRef<HTMLElement>(null)

    // Scroll to top on route change
    useEffect(() => {
        mainRef.current?.scrollTo(0, 0)
    }, [model.pathname])

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            <CommandPalette />
            <SidebarBackdrop isOpen={model.isSidebarOpen} closeSidebar={() => model.setIsSidebarOpen(false)} />
            <Sidebar model={model} />
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
                {!model.isOnline && <OfflineBanner />}
                <Header model={model} />
                <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-8 no-scrollbar scroll-smooth">
                    <div className="max-w-7xl mx-auto pb-12">
                        <Suspense fallback={<PageLoader />}>
                            <Outlet />
                        </Suspense>
                    </div>
                </main>
            </div>
        </div>
    )
}
