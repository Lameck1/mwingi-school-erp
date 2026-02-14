import { LogOut, Shield, X } from 'lucide-react'

import { adminItems, navItems } from './nav-items'
import { NavTree } from './NavTree'

import type { LayoutModel } from './types'

interface SidebarProps {
    model: LayoutModel
}

export function Sidebar({ model }: Readonly<SidebarProps>) {
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
