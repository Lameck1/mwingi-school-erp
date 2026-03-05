import { useEffect } from 'react'

import { useAppStore } from '../../stores'
import type { AcademicYear, Term } from '../../types/electron-api/AcademicAPI'
import type { SchoolSettings } from '../../types/electron-api/SettingsAPI'
import { unwrapIPCResult } from '../../utils/ipc'

export function useLoadGlobalSettings(): { schoolName: string; currentAcademicYearName: string } {
    const schoolSettings = useAppStore((s) => s.schoolSettings)
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)
    const setSchoolSettings = useAppStore((s) => s.setSchoolSettings)
    const setCurrentAcademicYear = useAppStore((s) => s.setCurrentAcademicYear)
    const setCurrentTerm = useAppStore((s) => s.setCurrentTerm)

    useEffect(() => {
        void (async () => {
            try {
                const [settings, year, term] = await Promise.all([
                    globalThis.electronAPI.settings.getSettings(),
                    globalThis.electronAPI.academic.getCurrentAcademicYear(),
                    globalThis.electronAPI.academic.getCurrentTerm()
                ])
                setSchoolSettings(unwrapIPCResult<SchoolSettings>(settings, 'Failed to load school settings'))
                setCurrentAcademicYear(unwrapIPCResult<AcademicYear>(year, 'Failed to load current academic year'))
                setCurrentTerm(unwrapIPCResult<Term>(term, 'Failed to load current term'))
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
