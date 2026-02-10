import { Eye, EyeOff, Loader2 } from 'lucide-react'
import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

import { useAuthStore, useAppStore } from '../stores'

export default function Login() {
    const navigate = useNavigate()
    const login = useAuthStore((state) => state.login)
    const { setSchoolSettings, setCurrentAcademicYear, setCurrentTerm } = useAppStore()

    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        const checkSetup = async () => {
            try {
                const hasUsers = await globalThis.electronAPI.hasUsers()
                if (!hasUsers) {
                    navigate('/setup')
                }
            } catch (err) {
                console.error('Failed to check setup state:', err)
            }
        }
        void checkSetup()
    }, [navigate])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const result = await globalThis.electronAPI.login(username, password)

            if (result.success && result.user) {
                login(result.user)
                navigate('/')

                // Load app data in background; don't block login
                void (async () => {
                    try {
                        const [settings, academicYear, currentTerm] = await Promise.all([
                            globalThis.electronAPI.getSettings(),
                            globalThis.electronAPI.getCurrentAcademicYear(),
                            globalThis.electronAPI.getCurrentTerm(),
                        ])
                        if (settings) {setSchoolSettings(settings)}
                        if (academicYear) {setCurrentAcademicYear(academicYear)}
                        if (currentTerm) {setCurrentTerm(currentTerm)}
                    } catch (err) {
                        console.error('Post-login bootstrap failed:', err)
                    }
                })()
            } else {
                setError(result.error || 'Login failed')
            }
        } catch (err) {
            setError((err as Error).message || 'An error occurred')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo Section */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
                        <span className="text-3xl font-bold text-blue-600">MAS</span>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Mwingi Adventist School</h1>
                    <p className="text-blue-200 mt-1">School Management System</p>
                </div>

                {/* Login Form */}
                <div className="bg-white rounded-2xl shadow-2xl p-8">
                    <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">Sign In</h2>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="label" htmlFor="login-username">Username</label>
                            <input
                                id="login-username"
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="input"
                                placeholder="Enter username"
                                required
                                disabled={loading}
                            />
                        </div>

                        <div>
                            <label className="label" htmlFor="login-password">Password</label>
                            <div className="relative">
                                <input
                                    id="login-password"
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="input pr-10"
                                    placeholder="Enter password"
                                    required
                                    disabled={loading}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    <span>Signing in...</span>
                                </>
                            ) : (
                                <span>Sign In</span>
                            )}
                        </button>
                    </form>

                    <div className="mt-6 pt-6 border-t border-gray-100 text-center text-sm text-gray-500">
                        <p>Use your assigned credentials to sign in.</p>
                    </div>
                </div>

                <p className="text-center text-blue-200 text-sm mt-6">
                    &copy; {new Date().getFullYear()} Mwingi Adventist School
                </p>
            </div>
        </div>
    )
}
