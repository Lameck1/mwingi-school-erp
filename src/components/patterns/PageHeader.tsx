import { ChevronRight } from 'lucide-react'
import React from 'react'

interface Breadcrumb {
    label: string
    href?: string
}

interface PageHeaderProps {
    title: string
    subtitle?: string
    breadcrumbs?: Breadcrumb[]
    actions?: React.ReactNode
}

export function PageHeader({
    title,
    subtitle,
    breadcrumbs,
    actions
}: Readonly<PageHeaderProps>) {
    return (
        <div className="flex flex-col gap-6 mb-8">
            <div className="flex items-center justify-between">
                <div className="space-y-1">
                    {breadcrumbs && breadcrumbs.length > 0 && (
                        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/30 mb-2">
                            {breadcrumbs.map((crumb, idx) => (
                                <React.Fragment key={crumb.label}>
                                    {idx > 0 && <ChevronRight className="w-3 h-3" />}
                                    <span className={idx === breadcrumbs.length - 1 ? 'text-primary' : ''}>
                                        {crumb.label}
                                    </span>
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    <h1 className="text-3xl font-bold tracking-tight text-foreground font-heading">
                        {title}
                    </h1>
                    {subtitle && (
                        <p className="text-sm text-foreground/50 font-medium">
                            {subtitle}
                        </p>
                    )}
                </div>

                {actions && (
                    <div className="flex items-center gap-3 animate-in fade-in slide-in-from-right-4 duration-500">
                        {actions}
                    </div>
                )}
            </div>

            <div className="h-px bg-gradient-to-r from-border/60 via-border/20 to-transparent w-full" />
        </div>
    )
}
