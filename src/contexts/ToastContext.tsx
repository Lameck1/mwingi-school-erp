import React, { createContext, useCallback, useContext, useRef, useState } from 'react'

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
    const fallbackIdCounter = useRef(0)

    const removeToastById = (id: string) => {
        setToasts(prev => prev.filter(toast => toast.id !== id))
    }

    const showToast = useCallback((message: string, type: ToastType = 'info') => {
        fallbackIdCounter.current += 1
        const hasRandomUuid = typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.randomUUID === 'function'
        const id = hasRandomUuid ? globalThis.crypto.randomUUID() : `toast-${Date.now()}-${fallbackIdCounter.current}`
        setToasts(prev => [...prev, { id, message, type }])
        setTimeout(() => {
            removeToastById(id)
        }, 5000)
    }, [])

    const removeToast = useCallback((id: string) => {
        removeToastById(id)
    }, [])

    return (
        <ToastContext.Provider value={{ showToast }}>
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
