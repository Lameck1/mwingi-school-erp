import React, { useEffect, useState } from 'react'

import type { SchoolSettings } from '../../types/electron-api/SettingsAPI'

interface InstitutionalHeaderProps {
    variant?: 'ui' | 'print'
}

export const InstitutionalHeader: React.FC<InstitutionalHeaderProps> = ({ variant = 'ui' }) => {
    const [settings, setSettings] = useState<SchoolSettings | null>(null)

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const data = await globalThis.electronAPI.getSchoolSettings()
                setSettings(data)
            } catch (error) {
                console.error('Failed to load school settings for header:', error)
            }
        }
        void loadSettings()
    }, [])

    if (!settings) {return null}

    if (variant === 'print') {
        return (
            <div className="text-center border-b-2 border-primary/20 pb-4 mb-6">
                <h1 className="text-2xl font-bold uppercase tracking-tight text-foreground">
                    {settings.school_name}
                </h1>
                <div className="text-sm text-foreground/60 font-medium">
                    {settings.address && <span>{settings.address}</span>}
                    {settings.phone && <span> • {settings.phone}</span>}
                    {settings.email && <span> • {settings.email}</span>}
                </div>
            </div>
        )
    }

    return (
        <div className="flex items-center gap-4 mb-8 p-4 bg-secondary/10 rounded-2xl border border-secondary/20">
            {settings.logo_path && (
                <div className="w-16 h-16 rounded-xl bg-card flex items-center justify-center p-2 shadow-sm border border-border/20">
                    <img src={settings.logo_path} alt="Logo" className="max-w-full max-h-full object-contain" />
                </div>
            )}
            <div>
                <h2 className="text-lg font-bold text-foreground leading-tight tracking-tight uppercase">
                    {settings.school_name}
                </h2>
                <div className="text-xs text-foreground/40 font-medium tracking-wide uppercase">
                    Institutional Management Portal
                </div>
            </div>
        </div>
    )
}
