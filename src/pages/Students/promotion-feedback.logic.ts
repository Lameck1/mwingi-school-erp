import type {
    PromotionBatchFailure,
    PromotionBatchResult,
    PromotionStudent
} from '../../types/electron-api/AcademicAPI'

export interface PromotionFailureFeedback extends PromotionBatchFailure {
    student_name: string
    admission_number: string
}

export interface PromotionRunFeedback {
    attempted: number
    promoted: number
    failed: number
    errors: string[]
    failureDetails: PromotionFailureFeedback[]
}

const UNKNOWN_ADMISSION_NUMBER = 'Unknown ADM'
const GENERIC_FAILURE_MESSAGE = 'Promotion failed for one or more students'

export function buildPromotionRunFeedback(
    result: PromotionBatchResult,
    selectedStudentIds: number[],
    students: PromotionStudent[]
): PromotionRunFeedback {
    const studentById = new Map(students.map(student => [student.student_id, student]))

    const failureDetails = (result.failureDetails ?? []).map(detail => {
        const student = studentById.get(detail.student_id)
        return {
            student_id: detail.student_id,
            student_name: student?.student_name ?? `Student #${detail.student_id}`,
            admission_number: student?.admission_number ?? UNKNOWN_ADMISSION_NUMBER,
            reason: detail.reason
        }
    })

    const normalizedErrors = (result.errors ?? [])
        .map(error => error.trim())
        .filter(Boolean)

    let errors: string[] = []
    if (normalizedErrors.length > 0) {
        errors = [...new Set(normalizedErrors)]
    } else if (result.failed > 0) {
        errors = [GENERIC_FAILURE_MESSAGE]
    }

    return {
        attempted: selectedStudentIds.length,
        promoted: result.promoted,
        failed: result.failed,
        errors,
        failureDetails
    }
}
