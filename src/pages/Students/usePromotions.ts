import { useState, useEffect, useCallback } from 'react'

import { buildPromotionRunFeedback, type PromotionRunFeedback } from './promotion-feedback.logic'
import { useToast } from '../../contexts/ToastContext'
import { useAppStore, useAuthStore } from '../../stores'
import { type Stream, type AcademicYear, type Term, type PromotionStudent } from '../../types/electron-api/AcademicAPI'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'
import { reportRuntimeError } from '../../utils/runtimeError'

export function usePromotions() {
    const currentAcademicYear = useAppStore((s) => s.currentAcademicYear)
    const user = useAuthStore((s) => s.user)
    const { showToast } = useToast()

    const [streams, setStreams] = useState<Stream[]>([])
    const [students, setStudents] = useState<PromotionStudent[]>([])
    const [selectedStudents, setSelectedStudents] = useState<number[]>([])
    const [loading, setLoading] = useState(false)
    const [promoting, setPromoting] = useState(false)

    const [fromStream, setFromStream] = useState<number>(0)
    const [toStream, setToStream] = useState<number>(0)
    const [academicYears, setAcademicYears] = useState<AcademicYear[]>([])
    const [toAcademicYear, setToAcademicYear] = useState<number>(0)
    const [toTerm, setToTerm] = useState<number>(0)
    const [terms, setTerms] = useState<Term[]>([])
    const [lastPromotionFeedback, setLastPromotionFeedback] = useState<PromotionRunFeedback | null>(null)
    const [confirmingPromotion, setConfirmingPromotion] = useState(false)

    const loadStreams = useCallback(async () => {
        try {
            const data = unwrapArrayResult(await globalThis.electronAPI.academic.getPromotionStreams(), 'Failed to load streams')
            setStreams(data)
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadStreams' }, 'Failed to load streams')
            setStreams([])
            setFromStream(0)
            setToStream(0)
            setStudents([])
            setSelectedStudents([])
            showToast(error instanceof Error ? error.message : 'Failed to load streams', 'error')
        }
    }, [showToast])

    const loadAcademicYears = useCallback(async () => {
        try {
            const data = unwrapArrayResult(await globalThis.electronAPI.academic.getAcademicYears(), 'Failed to load academic years')
            setAcademicYears(data)
            const targetYear = data.find((year) => !year.is_current) || data[0] || null
            if (targetYear) {
                setToAcademicYear(targetYear.id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadAcademicYears' }, 'Failed to load academic years')
            setAcademicYears([])
            setToAcademicYear(0)
            setTerms([])
            setToTerm(0)
            showToast(error instanceof Error ? error.message : 'Failed to load academic years', 'error')
        }
    }, [showToast])

    const loadTerms = useCallback(async () => {
        if (!toAcademicYear) {
            setTerms([])
            setToTerm(0)
            return
        }
        try {
            const data = unwrapArrayResult(await globalThis.electronAPI.academic.getTermsByYear(toAcademicYear), 'Failed to load terms')
            setTerms(data)
            if (data.length > 0 && data[0]) {
                setToTerm(data[0].id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadTerms' }, 'Failed to load terms')
            setTerms([])
            setToTerm(0)
            showToast(error instanceof Error ? error.message : 'Failed to load terms', 'error')
        }
    }, [showToast, toAcademicYear])

    useEffect(() => {
        loadStreams().catch((err: unknown) => console.error('Failed to load streams', err))
        loadAcademicYears().catch((err: unknown) => console.error('Failed to load academic years', err))
    }, [loadStreams, loadAcademicYears])

    useEffect(() => {
        if (toAcademicYear) {
            loadTerms().catch((err: unknown) => console.error('Failed to load terms', err))
        }
    }, [toAcademicYear, loadTerms])

    const loadStudents = useCallback(async () => {
        if (!currentAcademicYear) {
            setStudents([])
            setSelectedStudents([])
            return
        }
        setLoading(true)
        try {
            const data = unwrapArrayResult(
                await globalThis.electronAPI.academic.getStudentsForPromotion(fromStream, currentAcademicYear.id),
                'Failed to load students for promotion'
            )
            setStudents(data)
            setSelectedStudents([])
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'loadStudents' }, 'Failed to load students')
            setStudents([])
            setSelectedStudents([])
            showToast(error instanceof Error ? error.message : 'Failed to load students for promotion', 'error')
        } finally {
            setLoading(false)
        }
    }, [fromStream, currentAcademicYear, showToast])

    const suggestNextStream = useCallback(async () => {
        try {
            const next = unwrapIPCResult<Stream | null>(
                await globalThis.electronAPI.academic.getNextStream(fromStream),
                'Failed to get next stream'
            )
            if (next) {
                setToStream(next.id)
            }
        } catch (error) {
            reportRuntimeError(error, { area: 'Students.Promotions', action: 'suggestNextStream' }, 'Failed to get next stream')
            showToast(error instanceof Error ? error.message : 'Failed to get next stream', 'error')
        }
    }, [fromStream, showToast])

    useEffect(() => {
        if (fromStream && currentAcademicYear) {
            loadStudents().catch((err: unknown) => {
                reportRuntimeError(err, { area: 'Students.Promotions', action: 'loadStudentsEffect' }, 'Failed to load students for promotion')
            })
            suggestNextStream().catch((err: unknown) => {
                reportRuntimeError(err, { area: 'Students.Promotions', action: 'suggestNextStreamEffect' }, 'Failed to suggest next stream')
            })
            return
        }
        setStudents([])
        setSelectedStudents([])
    }, [fromStream, currentAcademicYear, loadStudents, suggestNextStream])

    const toggleStudent = (studentId: number) => {
        setSelectedStudents(prev =>
            prev.includes(studentId)
                ? prev.filter(id => id !== studentId)
                : [...prev, studentId]
        )
    }

    const selectAll = () => {
        if (selectedStudents.length === students.length) {
            setSelectedStudents([])
        } else {
            setSelectedStudents(students.map(s => s.student_id))
        }
    }

    const handlePromote = () => {
        if (!currentAcademicYear) {
            showToast('No active academic year selected', 'error')
            return
        }
        if (!user?.id) {
            showToast('You must be signed in to promote students', 'error')
            return
        }
        if (selectedStudents.length === 0) {
            showToast('Please select students to promote', 'warning')
            return
        }
        if (!toStream || !toAcademicYear || !toTerm) {
            showToast('Please select destination stream, academic year, and term', 'warning')
            return
        }

        setConfirmingPromotion(true)
    }

    const executePromotion = async () => {
        if (!currentAcademicYear) {
            showToast('No active academic year selected', 'error')
            return
        }
        if (!user?.id) {
            showToast('You must be signed in to promote students', 'error')
            return
        }

        setConfirmingPromotion(false)
        setLastPromotionFeedback(null)
        setPromoting(true)
        try {
            const result = await globalThis.electronAPI.academic.batchPromoteStudents(
                selectedStudents,
                fromStream,
                toStream,
                currentAcademicYear.id,
                toAcademicYear,
                toTerm,
                user.id
            )

            setLastPromotionFeedback(buildPromotionRunFeedback(result, selectedStudents, students))

            if (result.success) {
                showToast(`Successfully promoted ${result.promoted} students`, 'success')
                await loadStudents()
            } else {
                showToast(`Promotion completed with ${result.failed} failure(s)`, 'warning')
                if (result.promoted > 0) {
                    await loadStudents()
                }
            }
        } catch (error) {
            const errorMessage = reportRuntimeError(error, { area: 'Students.Promotions', action: 'executePromotion' }, 'Failed to promote students')
            setLastPromotionFeedback({
                attempted: selectedStudents.length,
                promoted: 0,
                failed: selectedStudents.length,
                errors: [errorMessage],
                failureDetails: []
            })
            showToast(errorMessage, 'error')
        } finally {
            setPromoting(false)
        }
    }

    const cancelPromotion = () => setConfirmingPromotion(false)

    return {
        // data
        streams,
        students,
        selectedStudents,
        academicYears,
        terms,
        lastPromotionFeedback,
        // ui state
        loading,
        promoting,
        fromStream,
        toStream,
        toAcademicYear,
        toTerm,
        confirmingPromotion,
        // setters
        setFromStream,
        setToStream,
        setToAcademicYear,
        setToTerm,
        // actions
        toggleStudent,
        selectAll,
        handlePromote,
        executePromotion,
        cancelPromotion,
    }
}
