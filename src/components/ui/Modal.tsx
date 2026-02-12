import { X } from 'lucide-react'
import React, { useEffect } from 'react'
import { createPortal } from 'react-dom'

interface ModalProps {
    isOpen: boolean
    onClose: () => void
    title: string
    children: React.ReactNode
    size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'print'
}

const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]',
    print: 'max-w-[96vw] sm:max-w-[90vw] lg:max-w-[80vw] xl:max-w-[1080px] 2xl:max-w-[1160px]',
}

export function Modal({
    isOpen,
    onClose,
    title,
    children,
    size = 'md'
}: ModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {onClose()}
        }
        if (isOpen) {
            globalThis.document.addEventListener('keydown', handleEsc)
            globalThis.document.body.style.overflow = 'hidden'
        }
        return () => {
            globalThis.document.removeEventListener('keydown', handleEsc)
            globalThis.document.body.style.overflow = 'unset'
        }
    }, [isOpen, onClose])

    if (!isOpen) {return null}

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <button
                type="button"
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={onClose}
                aria-label="Close modal"
            />

            <div className={`
        relative w-full ${sizes[size]} bg-card border border-border/40 rounded-2xl shadow-2xl overflow-hidden
        animate-in zoom-in-95 fade-in slide-in-from-bottom-4 duration-300
      `}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-border/40">
                    <h2 className="text-lg font-bold text-foreground/90">{title}</h2>
                    <button
                        onClick={onClose}
                        title="Close dialog"
                        className="p-2 hover:bg-secondary rounded-lg transition-colors text-foreground/40 hover:text-foreground/80"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="px-6 py-6 max-h-[80vh] overflow-y-auto no-scrollbar">
                    {children}
                </div>
            </div>
        </div>,
        globalThis.document.body
    )
}
