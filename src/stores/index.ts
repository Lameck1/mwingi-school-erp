import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
    id: number
    username: string
    full_name: string
    email: string
    role: 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR'
}

interface AuthState {
    user: User | null
    isAuthenticated: boolean
    login: (user: User) => void
    logout: () => void
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
    currentAcademicYear: any | null
    currentTerm: any | null
    schoolSettings: any | null
    setCurrentAcademicYear: (year: any) => void
    setCurrentTerm: (term: any) => void
    setSchoolSettings: (settings: any) => void
}

export const useAppStore = create<AppState>((set) => ({
    currentAcademicYear: null,
    currentTerm: null,
    schoolSettings: null,
    setCurrentAcademicYear: (year) => set({ currentAcademicYear: year }),
    setCurrentTerm: (term) => set({ currentTerm: term }),
    setSchoolSettings: (settings) => set({ schoolSettings: settings }),
}))
