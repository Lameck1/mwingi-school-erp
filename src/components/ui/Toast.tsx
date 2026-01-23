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


export function Toast({ message, type, onClose }: ToastProps) {
    const Icon = icons[type]

    const typeStyles = {
        success: "bg-success/10 border-success/30 text-success backdrop-blur-md",
        error: "bg-destructive/10 border-destructive/30 text-destructive backdrop-blur-md",
        info: "bg-primary/10 border-primary/30 text-primary backdrop-blur-md",
        warning: "bg-warning/10 border-warning/30 text-warning backdrop-blur-md"
    }

    return (
        <div className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-2xl animate-slide-up min-w-[300px] ${typeStyles[type]}`}>
            <Icon className="w-5 h-5 shrink-0" />
            <p className="flex-1 text-sm font-medium">{message}</p>
            <button onClick={onClose} className="opacity-50 hover:opacity-100 transition-opacity" aria-label="Close">
                <X className="w-4 h-4" />
            </button>
        </div>
    )
}
