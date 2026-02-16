import { describe, expect, it } from 'vitest'

import { buildPromotionRunFeedback } from '../promotion-feedback.logic'

import type { PromotionStudent } from '../../../types/electron-api/AcademicAPI'

const students: PromotionStudent[] = [
    {
        student_id: 10,
        student_name: 'Grace Mutua',
        admission_number: '2026/002',
        current_stream_name: 'Baby Class',
        average_score: 0,
        recommendation: 'PROMOTE'
    },
    {
        student_id: 11,
        student_name: 'Mercy Wambui',
        admission_number: '2026/004',
        current_stream_name: 'Baby Class',
        average_score: 0,
        recommendation: 'PROMOTE'
    }
]

describe('promotion feedback logic', () => {
    it('maps failure details to student identity', () => {
        const result = buildPromotionRunFeedback(
            {
                success: false,
                promoted: 0,
                failed: 2,
                errors: ['Student already has an active enrollment in the target academic year'],
                failureDetails: [
                    { student_id: 10, reason: 'Student already has an active enrollment in the target academic year' },
                    { student_id: 11, reason: 'Student already has an active enrollment in the target academic year' }
                ]
            },
            [10, 11],
            students
        )

        expect(result.attempted).toBe(2)
        expect(result.promoted).toBe(0)
        expect(result.failed).toBe(2)
        expect(result.failureDetails).toEqual([
            {
                student_id: 10,
                student_name: 'Grace Mutua',
                admission_number: '2026/002',
                reason: 'Student already has an active enrollment in the target academic year'
            },
            {
                student_id: 11,
                student_name: 'Mercy Wambui',
                admission_number: '2026/004',
                reason: 'Student already has an active enrollment in the target academic year'
            }
        ])
    })

    it('falls back to generic identity when a student is missing from local list', () => {
        const result = buildPromotionRunFeedback(
            {
                success: false,
                promoted: 0,
                failed: 1,
                errors: ['Student is not actively enrolled in the source stream/year'],
                failureDetails: [{ student_id: 99, reason: 'Student is not actively enrolled in the source stream/year' }]
            },
            [99],
            students
        )

        expect(result.failureDetails).toEqual([
            {
                student_id: 99,
                student_name: 'Student #99',
                admission_number: 'Unknown ADM',
                reason: 'Student is not actively enrolled in the source stream/year'
            }
        ])
    })

    it('uses a default error when backend fails without detailed messages', () => {
        const result = buildPromotionRunFeedback(
            {
                success: false,
                promoted: 0,
                failed: 1
            },
            [10],
            students
        )

        expect(result.errors).toEqual(['Promotion failed for one or more students'])
        expect(result.failureDetails).toEqual([])
    })
})
