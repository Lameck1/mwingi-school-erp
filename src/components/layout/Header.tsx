import { Menu, Moon, Settings, Sun } from 'lucide-react'
import { useMemo } from 'react'

import { getSectionTitle } from './nav-utils'

import type { LayoutModel } from './types'

interface HeaderProps {
    model: LayoutModel
}

export function Header({ model }: Readonly<HeaderProps>) {
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
