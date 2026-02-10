import { create } from 'zustand'

import { type AcademicYear, type Term } from '../types/electron-api/AcademicAPI'
import { type SchoolSettings } from '../types/electron-api/SettingsAPI'
import { type User } from '../types/electron-api/UserAPI'

// Session expires after 8 hours of inactivity
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    lastActivity: number | null
    isSessionLoaded: boolean
    login(user: User): void
    logout(): void
    touchSession(): void
    checkSession(): boolean
    hydrateSession(): Promise<void>
}

export const useAuthStore = create<AuthState>()((set, get) => ({
    user: null,
    isAuthenticated: false,
    lastActivity: null,
    isSessionLoaded: false,
    login: (user) => {
        const lastActivity = Date.now()
        set({ user, isAuthenticated: true, lastActivity, isSessionLoaded: true })
        void window.electronAPI.setSession({ user, lastActivity })
    },
    logout: () => {
        set({ user: null, isAuthenticated: false, lastActivity: null, isSessionLoaded: true })
        void window.electronAPI.clearSession()
    },
    touchSession: () => {
        const state = get()
        if (state.isAuthenticated && state.user) {
            const lastActivity = Date.now()
            set({ lastActivity })
            void window.electronAPI.setSession({ user: state.user, lastActivity })
        }
    },
    checkSession: () => {
        const state = get()
        if (!state.isAuthenticated || !state.lastActivity) {return false}
        const elapsed = Date.now() - state.lastActivity
        if (elapsed > SESSION_TIMEOUT_MS) {
            set({ user: null, isAuthenticated: false, lastActivity: null, isSessionLoaded: true })
            void window.electronAPI.clearSession()
            return false
        }
        return true
    },
    hydrateSession: async () => {
        const current = get()
        if (current.isAuthenticated && current.user) {
            set({ isSessionLoaded: true })
            return
        }
        const session = await window.electronAPI.getSession()
        const latest = get()
        if (latest.isAuthenticated && latest.user) {
            set({ isSessionLoaded: true })
            return
        }
        if (!session) {
            set({ user: null, isAuthenticated: false, lastActivity: null, isSessionLoaded: true })
            return
        }
        const elapsed = Date.now() - session.lastActivity
        if (elapsed > SESSION_TIMEOUT_MS) {
            set({ user: null, isAuthenticated: false, lastActivity: null, isSessionLoaded: true })
            void window.electronAPI.clearSession()
            return
        }
        set({ user: session.user as User, isAuthenticated: true, lastActivity: session.lastActivity, isSessionLoaded: true })
    }
}))

interface AppState {
    currentAcademicYear: AcademicYear | null
    currentTerm: Term | null
    schoolSettings: SchoolSettings | null
    setCurrentAcademicYear(year: AcademicYear): void
    setCurrentTerm(term: Term): void
    setSchoolSettings(settings: SchoolSettings): void
}

export const useAppStore = create<AppState>((set) => ({
    currentAcademicYear: null,
    currentTerm: null,
    schoolSettings: null,
    setCurrentAcademicYear: (year) => set({ currentAcademicYear: year }),
    setCurrentTerm: (term) => set({ currentTerm: term }),
    setSchoolSettings: (settings) => set({ schoolSettings: settings }),
}))
