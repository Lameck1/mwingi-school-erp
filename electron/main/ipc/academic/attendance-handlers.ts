import { container } from '../../services/base/ServiceContainer'
import { ROLES } from '../ipc-result'
import {
    AttendanceGetByDateSchema,
    MarkAttendanceSchema,
    GetStudentSummarySchema,
    GetClassSummarySchema,
    GetStudentsForMarkingSchema
} from '../schemas/academic-schemas'
import { validatedHandlerMulti } from '../validated-handler'

import type { DailyAttendanceEntry } from '../../services/academic/AttendanceService'

const getService = () => container.resolve('AttendanceService')

export function registerAttendanceHandlers(): void {
    validatedHandlerMulti('attendance:getByDate', ROLES.STAFF, AttendanceGetByDateSchema, (_event, [streamId, date, academicYearId, termId]: [number, string, number, number]) => {
        return getService().getAttendanceByDate(streamId, date, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:markAttendance', ROLES.STAFF, MarkAttendanceSchema, (event, [entries, streamId, date, academicYearId, termId]: [DailyAttendanceEntry[], number, string, number, number, number?], actor) => {
        return getService().markAttendance(
            entries,
            streamId,
            date,
            academicYearId,
            termId,
            actor.id
        )
    })

    validatedHandlerMulti('attendance:getStudentSummary', ROLES.STAFF, GetStudentSummarySchema, (_event, [studentId, academicYearId, termId]: [number, number, number?]) => {
        return getService().getStudentAttendanceSummary(studentId, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:getClassSummary', ROLES.STAFF, GetClassSummarySchema, (_event, [streamId, date, academicYearId, termId]: [number, string, number, number]) => {
        return getService().getClassAttendanceSummary(streamId, date, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:getStudentsForMarking', ROLES.STAFF, GetStudentsForMarkingSchema, (_event, [streamId, academicYearId, termId]: [number, number, number]) => {
        return getService().getStudentsForAttendance(streamId, academicYearId, termId)
    })
}
