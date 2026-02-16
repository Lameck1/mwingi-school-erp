import { AlertTriangle } from 'lucide-react'

import { Modal } from './Modal'

interface ConfirmDialogProps {
    isOpen: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    onConfirm: () => void
    onCancel: () => void
    tone?: 'default' | 'danger'
    isProcessing?: boolean
}

export function ConfirmDialog({
    isOpen,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    onConfirm,
    onCancel,
    tone = 'default',
    isProcessing = false
}: Readonly<ConfirmDialogProps>) {
    const confirmClassName = tone === 'danger'
        ? 'btn bg-destructive hover:bg-destructive/90 text-white'
        : 'btn btn-primary'

    return (
        <Modal isOpen={isOpen} onClose={onCancel} title={title} size="sm">
            <div className="space-y-5">
                <div className="flex items-start gap-3 rounded-xl border border-border/30 bg-secondary/20 p-4">
                    <AlertTriangle className="w-5 h-5 mt-0.5 text-amber-400 shrink-0" />
                    <p className="text-sm text-foreground/80 leading-relaxed">{message}</p>
                </div>

                <div className="flex justify-end gap-3">
                    <button type="button" onClick={onCancel} className="btn btn-secondary" disabled={isProcessing}>
                        {cancelLabel}
                    </button>
                    <button type="button" onClick={onConfirm} className={confirmClassName} disabled={isProcessing}>
                        {isProcessing ? 'Processing...' : confirmLabel}
                    </button>
                </div>
            </div>
        </Modal>
    )
}
