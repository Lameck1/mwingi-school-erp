import { type ChangeEvent, type SyntheticEvent, useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { useAuthStore } from '../../stores'
import { type Stream } from '../../types/electron-api/AcademicAPI'
import { getIPCFailureMessage, isIPCFailure, unwrapArrayResult } from '../../utils/ipc'

export interface StudentFormData {
    admission_number: string
    first_name: string
    middle_name: string
    last_name: string
    date_of_birth: string
    gender: 'MALE' | 'FEMALE'
    student_type: 'BOARDER' | 'DAY_SCHOLAR'
    admission_date: string
    guardian_name: string
    guardian_phone: string
    guardian_email: string
    address: string
    stream_id: string
    guardian_relationship: string
    notes: string
}

const DEFAULT_FORM_DATA: StudentFormData = {
    admission_number: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    date_of_birth: '',
    gender: 'MALE',
    student_type: 'DAY_SCHOLAR',
    admission_date: new Date().toISOString().slice(0, 10),
    guardian_name: '',
    guardian_phone: '',
    guardian_email: '',
    address: '',
    stream_id: '',
    guardian_relationship: '',
    notes: ''
}

const getResultMessage = (value: unknown, fallback: string): string => {
    if (isIPCFailure(value)) {
        return getIPCFailureMessage(value, fallback)
    }
    if (value && typeof value === 'object') {
        const maybe = value as { error?: unknown; message?: unknown }
        if (typeof maybe.error === 'string' && maybe.error.trim()) {
            return maybe.error
        }
        if (typeof maybe.message === 'string' && maybe.message.trim()) {
            return maybe.message
        }
    }
    return fallback
}

type StudentRecord = Record<string, unknown> & {
    admission_number?: string; first_name?: string; middle_name?: string; last_name?: string
    date_of_birth?: string; gender?: 'MALE' | 'FEMALE'; student_type?: 'BOARDER' | 'DAY_SCHOLAR'
    admission_date?: string; guardian_name?: string; guardian_phone?: string; guardian_email?: string
    address?: string; stream_id?: number | null; guardian_relationship?: string | null; notes?: string | null
}

function mapStudentToFormData(s: StudentRecord): StudentFormData {
    return {
        admission_number: s.admission_number || '',
        first_name: s.first_name || '',
        middle_name: s.middle_name || '',
        last_name: s.last_name || '',
        date_of_birth: s.date_of_birth || '',
        gender: s.gender || 'MALE',
        student_type: s.student_type || 'DAY_SCHOLAR',
        admission_date: s.admission_date || '',
        guardian_name: s.guardian_name || '',
        guardian_phone: s.guardian_phone || '',
        guardian_email: s.guardian_email || '',
        address: s.address || '',
        stream_id: s.stream_id?.toString() || '',
        guardian_relationship: s.guardian_relationship || '',
        notes: s.notes || ''
    }
}

export function useStudentForm() {
    const navigate = useNavigate()
    const { id } = useParams()
    const isEdit = Boolean(id)
    const user = useAuthStore((s) => s.user)

    const [streams, setStreams] = useState<Stream[]>([])
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null)
    const [pendingPhoto, setPendingPhoto] = useState<string | null>(null)
    const photoInputRef = useRef<HTMLInputElement>(null)
    const [formData, setFormData] = useState<StudentFormData>(DEFAULT_FORM_DATA)

    const loadExistingStudent = async (studentId: number) => {
        const result = await globalThis.electronAPI.students.getStudentById(studentId)
        if (
            result &&
            typeof result === 'object' &&
            'success' in result &&
            (result as { success?: unknown }).success === false
        ) {
            setError(getResultMessage(result, 'Failed to load student record'))
            return
        }
        if (!result || typeof result !== 'object' || 'success' in result) {
            setError('Student record not found')
            return
        }

        const dataUrlResult = await globalThis.electronAPI.students.getStudentPhotoDataUrl(studentId)
        if (isIPCFailure(dataUrlResult)) {
            setError(getIPCFailureMessage(dataUrlResult, 'Failed to load student photo'))
            setPhotoDataUrl(null)
        } else {
            setPhotoDataUrl(typeof dataUrlResult === 'string' ? dataUrlResult : null)
        }

        setFormData(mapStudentToFormData(result as unknown as StudentRecord))
    }

    useEffect(() => {
        const loadData = async () => {
            setLoading(true)
            try {
                const streamsData = unwrapArrayResult(await globalThis.electronAPI.academic.getStreams(), 'Failed to load streams')
                setStreams(streamsData)

                if (id) {
                    const studentId = Number.parseInt(id, 10)
                    if (!Number.isFinite(studentId) || studentId <= 0) {
                        setError('Invalid student identifier')
                        return
                    }
                    await loadExistingStudent(studentId)
                }
            } catch (error) {
                console.error('Failed to load data:', error)
                setError('Failed to load local data registry')
            } finally {
                setLoading(false)
            }
        }

        void loadData()
    }, [id]) // loadExistingStudent is stable per render

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
    }

    const handlePhotoSelect = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) { return }

        if (file.size > 5 * 1024 * 1024) {
            setError('Image file size exceeds 5MB limit')
            return
        }

        const reader = new FileReader()
        reader.onload = async () => {
            const base64 = reader.result as string
            if (isEdit && id) {
                setSaving(true)
                try {
                    const result = await globalThis.electronAPI.students.uploadStudentPhoto(Number.parseInt(id, 10), base64)
                    if (result.success) {
                        setPhotoDataUrl(base64)
                    } else {
                        setError(result.error || 'Failed to upload photo')
                    }
                } catch (error) {
                    setError(error instanceof Error ? error.message : 'Photo upload failed')
                } finally {
                    setSaving(false)
                }
            } else {
                setPendingPhoto(base64)
                setPhotoDataUrl(base64)
            }
        }
        reader.readAsDataURL(file)
    }

    const handleRemovePhoto = async () => {
        if (!confirm('Are you sure you want to remove the student photo?')) { return }
        if (isEdit && id) {
            setSaving(true)
            try {
                const result = await globalThis.electronAPI.students.removeStudentPhoto(Number.parseInt(id, 10))
                if (result.success) {
                    setPhotoDataUrl(null)
                } else {
                    setError(result.error || 'Failed to remove photo')
                }
            } catch (error) {
                setError(error instanceof Error ? error.message : 'Remove photo failed')
            } finally {
                setSaving(false)
            }
        } else {
            setPendingPhoto(null)
            setPhotoDataUrl(null)
        }
    }

    const handleSubmit = async (e: SyntheticEvent) => {
        e.preventDefault()
        setError('')
        setSaving(true)

        try {
            const parsedStreamId = Number.parseInt(formData.stream_id, 10)
            const studentPayload = {
                admission_number: formData.admission_number,
                first_name: formData.first_name,
                middle_name: formData.middle_name,
                last_name: formData.last_name,
                date_of_birth: formData.date_of_birth,
                gender: formData.gender,
                student_type: formData.student_type,
                admission_date: formData.admission_date,
                guardian_name: formData.guardian_name,
                guardian_phone: formData.guardian_phone,
                guardian_email: formData.guardian_email,
                address: formData.address,
                stream_id: Number.isFinite(parsedStreamId) ? parsedStreamId : undefined,
                guardian_relationship: formData.guardian_relationship,
                notes: formData.notes
            } as Parameters<typeof globalThis.electronAPI.students.updateStudent>[1]
            type StudentMutationResult = { success: boolean; error?: string; id?: number }
            let mutationResult: StudentMutationResult

            if (isEdit && id) {
                mutationResult = await globalThis.electronAPI.students.updateStudent(
                    Number.parseInt(id, 10),
                    studentPayload
                ) as StudentMutationResult
            } else {
                if (!user?.id) {
                    throw new Error('User session not found. Please log in again.')
                }

                mutationResult = await globalThis.electronAPI.students.createStudent(
                    studentPayload,
                    user.id
                ) as StudentMutationResult & { id?: number }

                if (mutationResult.success && mutationResult.id && pendingPhoto) {
                    await globalThis.electronAPI.students.uploadStudentPhoto(mutationResult.id, pendingPhoto)
                }
            }

            if (!mutationResult.success) {
                throw new Error(getResultMessage(mutationResult, 'Failed to save student record'))
            }

            navigate('/students')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registry synchronization failed')
        } finally {
            setSaving(false)
        }
    }

    return {
        formData, setFormData, streams, loading, saving, error,
        photoDataUrl, photoInputRef, isEdit, navigate,
        handleChange, handlePhotoSelect, handleRemovePhoto, handleSubmit,
    }
}
