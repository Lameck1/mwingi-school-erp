import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types/electron-api/UserAPI'
import { SchoolSettings } from '../types/electron-api/SettingsAPI'
import { AcademicYear, Term } from '../types/electron-api/AcademicAPI'

// Session expires after 8 hours of inactivity
const SESSION_TIMEOUT_MS = 8 * 60 * 60 * 1000

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    lastActivity: number | null
    login(user: User): void
    logout(): void
    touchSession(): void
    checkSession(): boolean
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            isAuthenticated: false,
            lastActivity: null,
            login: (user) => set({ user, isAuthenticated: true, lastActivity: Date.now() }),
            logout: () => set({ user: null, isAuthenticated: false, lastActivity: null }),
            touchSession: () => {
                if (get().isAuthenticated) {
                    set({ lastActivity: Date.now() })
                }
            },
            checkSession: () => {
                const state = get()
                if (!state.isAuthenticated || !state.lastActivity) return false
                const elapsed = Date.now() - state.lastActivity
                if (elapsed > SESSION_TIMEOUT_MS) {
                    // Session expired - auto logout
                    set({ user: null, isAuthenticated: false, lastActivity: null })
                    return false
                }
                return true
            },
        }),
        {
            name: 'auth-storage',
        }
    )
)

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
