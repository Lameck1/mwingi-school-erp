import { ChevronDown } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'

import type { NavItem } from './types'

interface NavTreeProps {
    items: NavItem[]
    expandedMenus: string[]
    toggleMenu: (label: string, siblingLabels: string[]) => void
    closeSidebar: () => void
    isChild?: boolean
}

export function NavTree({ items, expandedMenus, toggleMenu, closeSidebar, isChild = false }: Readonly<NavTreeProps>) {
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
