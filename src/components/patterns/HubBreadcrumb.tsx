import { ChevronRight } from 'lucide-react'
import React from 'react'
import { useNavigate } from 'react-router-dom'

interface Crumb {
    label: string
    href?: string
}

interface HubBreadcrumbProps {
    readonly crumbs: Crumb[]
}

/**
 * Lightweight breadcrumb trail for pages that don't use PageHeader
 * but still need hub-page back-navigation.
 */
export function HubBreadcrumb({ crumbs }: HubBreadcrumbProps) {
    const navigate = useNavigate()

    return (
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-foreground/30 mb-4">
            {crumbs.map((crumb, idx) => (
                <React.Fragment key={crumb.label}>
                    {idx > 0 && <ChevronRight className="w-3 h-3" />}
                    {crumb.href ? (
                        <button
                            onClick={() => navigate(crumb.href!)}
                            className="hover:text-primary transition-colors cursor-pointer"
                        >
                            {crumb.label}
                        </button>
                    ) : (
                        <span className={idx === crumbs.length - 1 ? 'text-primary' : ''}>
                            {crumb.label}
                        </span>
                    )}
                </React.Fragment>
            ))}
        </div>
    )
}
