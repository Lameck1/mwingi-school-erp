import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { adminItems, navItems } from './nav-items'
import { findMenuChainForPath } from './nav-utils'
import { useElectronLayoutEvents } from './useElectronLayoutEvents'
import { useLoadGlobalSettings } from './useLoadGlobalSettings'
import { useTheme } from '../../contexts/ThemeContext'
import { useToast } from '../../contexts/ToastContext'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import { useAuthStore } from '../../stores'

import type { LayoutModel } from './types'

export function useLayoutModel(): LayoutModel {
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
