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

const getService = () => container.resolve('AttendanceService')

export function registerAttendanceHandlers(): void {
    validatedHandlerMulti('attendance:getByDate', ROLES.STAFF, AttendanceGetByDateSchema, (_event, [streamId, date, academicYearId, termId]) => {
        return getService().getAttendanceByDate(streamId, date, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:markAttendance', ROLES.STAFF, MarkAttendanceSchema, (_event, [entries, streamId, date, academicYearId, termId], actor) => {
        return getService().markAttendance(
            entries,
            streamId,
            date,
            academicYearId,
            termId,
            actor.id
        )
    })

    validatedHandlerMulti('attendance:getStudentSummary', ROLES.STAFF, GetStudentSummarySchema, (_event, [studentId, academicYearId, termId]) => {
        return getService().getStudentAttendanceSummary(studentId, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:getClassSummary', ROLES.STAFF, GetClassSummarySchema, (_event, [streamId, date, academicYearId, termId]) => {
        return getService().getClassAttendanceSummary(streamId, date, academicYearId, termId)
    })

    validatedHandlerMulti('attendance:getStudentsForMarking', ROLES.STAFF, GetStudentsForMarkingSchema, (_event, [streamId, academicYearId, termId]) => {
        return getService().getStudentsForAttendance(streamId, academicYearId, termId)
    })
}
