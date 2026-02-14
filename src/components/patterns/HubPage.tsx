import { FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { PageHeader } from './PageHeader'

export interface HubLink {
    label: string
    path: string
}

export interface HubSection {
    title: string
    description: string
    icon: React.ElementType
    links: HubLink[]
}

interface HubPageProps {
    title: string
    subtitle: string
    sections: HubSection[]
    iconMap?: Record<string, React.ElementType>
    columns?: 2 | 3
}

export function HubPage({ title, subtitle, sections, iconMap, columns = 2 }: Readonly<HubPageProps>) {
    const navigate = useNavigate()
    const gridCols = columns === 3
        ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-1 md:grid-cols-2'

    return (
        <div className="space-y-8">
            <PageHeader title={title} subtitle={subtitle} />

            <div className={`grid ${gridCols} gap-6`}>
                {sections.map((section) => (
                    <div key={section.title} className="premium-card group overflow-hidden">
                        <div className="p-5 border-b border-border/40 bg-secondary/5">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                                    <section.icon className="w-5 h-5 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-foreground tracking-tight">{section.title}</h3>
                                    <p className="text-[11px] text-foreground/50">{section.description}</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-3 space-y-0.5">
                            {section.links.map((link) => {
                                const LinkIcon = iconMap?.[link.label] ?? FileText
                                return (
                                    <button
                                        key={link.path}
                                        onClick={() => navigate(link.path)}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-foreground/70 hover:bg-primary/10 hover:text-primary transition-colors text-left"
                                    >
                                        <LinkIcon className="w-4 h-4 opacity-60" />
                                        <span className="font-medium">{link.label}</span>
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
