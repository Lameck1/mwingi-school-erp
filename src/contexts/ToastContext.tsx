import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { Toast, type ToastType } from '../components/ui/Toast'

interface ToastMessage {
    id: string
    message: string
    type: ToastType
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function ToastProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [toasts, setToasts] = useState<ToastMessage[]>([])
    const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

    useEffect(() => {
        const timers = timersRef.current
        return () => {
            for (const timer of timers.values()) { clearTimeout(timer) }
            timers.clear()
        }
    }, [])

    const removeToastById = useCallback((id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id))
        const timer = timersRef.current.get(id)
        if (timer) { clearTimeout(timer); timersRef.current.delete(id) }
    }, [])

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        const id = globalThis.crypto.randomUUID()
        setToasts(prev => [...prev, { id, message, type }])
        const timer = setTimeout(() => {
            timersRef.current.delete(id)
            removeToastById(id)
        }, 5000)
        timersRef.current.set(id, timer)
    }, [removeToastById])

    const removeToast = useCallback((id: string) => {
        removeToastById(id)
    }, [removeToastById])

    const value = useMemo(() => ({ showToast }), [showToast])

    return (
        <ToastContext.Provider value={value}>
            {children}
            <div className="fixed top-4 right-4 z-50 space-y-2">
                {toasts.map(toast => (
                    <Toast
                        key={toast.id}
                        message={toast.message}
                        type={toast.type}
                        onClose={() => removeToast(toast.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    )
}

export function useToast() {
    const context = useContext(ToastContext)
    if (context === undefined) {
        throw new Error('useToast must be used within a ToastProvider')
    }
    return context
}
