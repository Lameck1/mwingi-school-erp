import React from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
    icon?: React.ReactNode
    title: string
    description?: string
    action?: React.ReactNode
}

export function EmptyState({
    icon = <Inbox className="w-12 h-12 text-foreground/20" />,
    title,
    description,
    action
}: EmptyStateProps) {
    return (
        <div className="flex flex-col items-center justify-center p-12 text-center border-2 border-dashed border-white/5 rounded-2xl bg-white/[0.02]">
            <div className="mb-4">
                {icon}
            </div>
            <h3 className="text-lg font-semibold text-foreground/80 mb-1">{title}</h3>
            {description && (
                <p className="text-sm text-foreground/40 max-w-xs mx-auto mb-6">
                    {description}
                </p>
            )}
            {action && (
                <div>{action}</div>
            )}
        </div>
    )
}
