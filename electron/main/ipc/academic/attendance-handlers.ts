import { container } from '../../services/base/ServiceContainer'
import { validateDate, validateId } from '../../utils/validation'
import { ROLES, resolveActorId, safeHandleRawWithRole } from '../ipc-result'

import type { DailyAttendanceEntry } from '../../services/academic/AttendanceService'

const getService = () => container.resolve('AttendanceService')

function formatLocalDate(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function validateAttendanceDateInput(date: string): { success: boolean; error?: string; value?: string } {
    const dateValidation = validateDate(date)
    if (!dateValidation.success) {
        return { success: false, error: dateValidation.error || 'Invalid attendance date' }
    }

    const normalized = dateValidation.data!.slice(0, 10)
    if (normalized > formatLocalDate(new Date())) {
        return { success: false, error: 'Attendance date cannot be in the future.' }
    }

    return { success: true, value: normalized }
}

export function registerAttendanceHandlers(): void {
    safeHandleRawWithRole('attendance:getByDate', ROLES.STAFF, (
        _event,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        const streamValidation = validateId(streamId, 'Stream ID')
        const yearValidation = validateId(academicYearId, 'Academic year ID')
        const termValidation = validateId(termId, 'Term ID')
        const dateValidation = validateAttendanceDateInput(date)
        if (!streamValidation.success || !yearValidation.success || !termValidation.success || !dateValidation.success) {
            return []
        }

        return getService().getAttendanceByDate(streamValidation.data!, dateValidation.value!, yearValidation.data!, termValidation.data!)
    })

    safeHandleRawWithRole('attendance:markAttendance', ROLES.STAFF, (
        event,
        entries: DailyAttendanceEntry[],
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number,
        legacyUserId?: number
    ) => {
        const streamValidation = validateId(streamId, 'Stream ID')
        const yearValidation = validateId(academicYearId, 'Academic year ID')
        const termValidation = validateId(termId, 'Term ID')
        const dateValidation = validateAttendanceDateInput(date)
        const actor = resolveActorId(event, legacyUserId)
        if (!streamValidation.success) {
            return { success: false, marked: 0, errors: [streamValidation.error || 'Invalid stream ID'] }
        }
        if (!yearValidation.success) {
            return { success: false, marked: 0, errors: [yearValidation.error || 'Invalid academic year ID'] }
        }
        if (!termValidation.success) {
            return { success: false, marked: 0, errors: [termValidation.error || 'Invalid term ID'] }
        }
        if (!actor.success) {
            return { success: false, marked: 0, errors: [actor.error] }
        }
        if (!dateValidation.success) {
            return { success: false, marked: 0, errors: [dateValidation.error || 'Invalid attendance date'] }
        }

        if (!Array.isArray(entries) || entries.length === 0) {
            return { success: false, marked: 0, errors: ['At least one attendance entry is required'] }
        }

        const malformed = entries.find((entry) => !entry || !Number.isFinite(entry.student_id) || entry.student_id <= 0 || typeof entry.status !== 'string')
        if (malformed) {
            return { success: false, marked: 0, errors: ['Attendance payload contains invalid entries'] }
        }

        return getService().markAttendance(
            entries,
            streamValidation.data!,
            dateValidation.value!,
            yearValidation.data!,
            termValidation.data!,
            actor.actorId
        )
    })

    safeHandleRawWithRole('attendance:getStudentSummary', ROLES.STAFF, (
        _event,
        studentId: number,
        academicYearId: number,
        termId?: number
    ) => {
        return getService().getStudentAttendanceSummary(studentId, academicYearId, termId)
    })

    safeHandleRawWithRole('attendance:getClassSummary', ROLES.STAFF, (
        _event,
        streamId: number,
        date: string,
        academicYearId: number,
        termId: number
    ) => {
        const streamValidation = validateId(streamId, 'Stream ID')
        const yearValidation = validateId(academicYearId, 'Academic year ID')
        const termValidation = validateId(termId, 'Term ID')
        const dateValidation = validateAttendanceDateInput(date)
        if (!streamValidation.success || !yearValidation.success || !termValidation.success || !dateValidation.success) {
            return { present: 0, absent: 0, late: 0, excused: 0, total: 0 }
        }

        return getService().getClassAttendanceSummary(streamValidation.data!, dateValidation.value!, yearValidation.data!, termValidation.data!)
    })

    safeHandleRawWithRole('attendance:getStudentsForMarking', ROLES.STAFF, (
        _event,
        streamId: number,
        academicYearId: number,
        termId: number
    ) => {
        const streamValidation = validateId(streamId, 'Stream ID')
        const yearValidation = validateId(academicYearId, 'Academic year ID')
        const termValidation = validateId(termId, 'Term ID')
        if (!streamValidation.success || !yearValidation.success || !termValidation.success) {
            return []
        }

        return getService().getStudentsForAttendance(streamValidation.data!, yearValidation.data!, termValidation.data!)
    })
}
