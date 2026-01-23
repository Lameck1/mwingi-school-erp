import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { User } from '../types/electron-api/UserAPI'
import { SchoolSettings } from '../types/electron-api/SettingsAPI'
import { AcademicYear, Term } from '../types/electron-api/AcademicAPI'

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    login(user: User): void
    logout(): void
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            login: (user) => set({ user, isAuthenticated: true }),
            logout: () => set({ user: null, isAuthenticated: false }),
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
