import type { User } from '../../types/electron-api/UserAPI'
import type { LucideIcon } from 'lucide-react'

export interface NavItem {
    path?: string
    label: string
    icon: LucideIcon
    children?: NavItem[]
    /** Additional path prefixes that should keep this item highlighted as active */
    activePatterns?: string[]
}

export interface LayoutModel {
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
