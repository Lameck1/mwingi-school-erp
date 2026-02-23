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
                /* eslint-disable @typescript-eslint/no-unnecessary-condition */
                if (settings && !('error' in settings)) {
                    setSchoolSettings(settings)
                }
                if (year && !('error' in year)) {
                    setCurrentAcademicYear(year)
                }
                if (term && !('error' in term)) {
                    setCurrentTerm(term)
                }
                /* eslint-enable @typescript-eslint/no-unnecessary-condition */
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
