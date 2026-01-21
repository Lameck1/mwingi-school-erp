import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
    message: string
    type: ToastType
    onClose: () => void
}

const icons = {
    success: CheckCircle,
    error: AlertCircle,
    info: Info,
    warning: AlertTriangle
}

const styles = {
    success: 'bg-green-50 text-green-800 border-green-200',
    error: 'bg-red-50 text-red-800 border-red-200',
    info: 'bg-blue-50 text-blue-800 border-blue-200',
    warning: 'bg-yellow-50 text-yellow-800 border-yellow-200'
}

export function Toast({ message, type, onClose }: ToastProps) {
    const Icon = icons[type]

    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg min-w-[300px] transition-all duration-300 transform translate-y-0 opacity-100 ${styles[type]}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{message}</p>
            <button onClick={onClose} className="p-1 hover:bg-black/5 rounded" aria-label="Close">
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
