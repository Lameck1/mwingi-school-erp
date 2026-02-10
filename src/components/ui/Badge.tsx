import { type LucideIcon } from 'lucide-react'
import React from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'

interface BadgeProps {
    children: React.ReactNode
    variant?: BadgeVariant
    icon?: LucideIcon
    className?: string
}

const variants: Record<BadgeVariant, string> = {
    default: 'bg-secondary/40 text-foreground/70 border-border/10',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
    error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
    info: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    outline: 'bg-transparent text-foreground/50 border-border/20',
}

export function Badge({
    children,
    variant = 'default',
    icon: Icon,
    className = ''
}: Readonly<BadgeProps>) {
    return (
        <span className={`
      inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border
      ${variants[variant]} 
      ${className}
    `}>
            {Icon && <Icon className="w-3 h-3" />}
            {children}
        </span>
    )
}
