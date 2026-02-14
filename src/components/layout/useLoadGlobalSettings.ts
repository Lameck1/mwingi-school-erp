import { useEffect } from 'react'

import { useAppStore } from '../../stores'

export function useLoadGlobalSettings(): { schoolName: string; currentAcademicYearName: string } {
    const { schoolSettings, currentAcademicYear, setSchoolSettings, setCurrentAcademicYear, setCurrentTerm } = useAppStore()

    useEffect(() => {
        void (async () => {
            try {
                const [settings, year, term] = await Promise.all([
                    globalThis.electronAPI.settings.getSettings(),
                    globalThis.electronAPI.academic.getCurrentAcademicYear(),
                    globalThis.electronAPI.academic.getCurrentTerm()
                ])
                setSchoolSettings(settings)
                setCurrentAcademicYear(year)
                setCurrentTerm(term)
            } catch (error) {
                console.error('Failed to load global settings:', error)
            }
        })()
    }, [setSchoolSettings, setCurrentAcademicYear, setCurrentTerm])

    return {
        schoolName: schoolSettings?.school_name || '',
        currentAcademicYearName: currentAcademicYear?.year_name || ''
    }
}
