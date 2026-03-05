import type { Student } from '../../../types/electron-api/StudentAPI'

// Roles that can approve awards
export const APPROVER_ROLES = new Set(['ADMIN', 'PRINCIPAL', 'DEPUTY_PRINCIPAL'])

export interface StudentAward {
    id: number
    student_id: number
    student_name?: string
    admission_number: string
    first_name?: string
    last_name?: string
    award_category_id: number
    category_name: string
    awarded_date: string
    approval_status: 'pending' | 'approved' | 'rejected'
    assigned_by_name?: string | undefined
    approved_by_name?: string | undefined
    approved_at?: string | undefined
    rejection_reason?: string | undefined
    certificate_number?: string | undefined
    remarks?: string | undefined
}

export interface AwardCategory {
    id: number
    name: string
    category_type: string
    description: string
}

export type StudentOption = { id: number; name: string; admission_number: string }

export const isStudentAward = (value: unknown): value is StudentAward =>
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { id?: unknown }).id === 'number' &&
    typeof (value as { student_id?: unknown }).student_id === 'number' &&
    typeof (value as { award_category_id?: unknown }).award_category_id === 'number' &&
    typeof (value as { approval_status?: unknown }).approval_status === 'string';

export function mapStudentToOption(s: Student): StudentOption {
    return {
        id: s.id,
        name: s.full_name || `${s.first_name} ${s.last_name}`,
        admission_number: s.admission_number
    }
}
