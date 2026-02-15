export interface FeeExemption {
    id: number
    student_id: number
    academic_year_id: number
    term_id?: number
    fee_category_id?: number
    exemption_type: 'FULL' | 'PARTIAL'
    exemption_percentage: number
    exemption_reason: string
    supporting_document?: string
    notes?: string
    approved_by_user_id: number
    approved_at?: string
    status: 'ACTIVE' | 'REVOKED'
    revoked_by_user_id?: number
    revoked_at?: string
    revoke_reason?: string
    created_at: string
    student_name?: string
    category_name?: string
    term_name?: string
    year_name?: string
    approved_by_name?: string
}

export interface ExemptionCreateData {
    student_id: number
    academic_year_id: number
    term_id?: number
    fee_category_id?: number
    exemption_percentage: number
    exemption_reason: string
    notes?: string
}

export interface ExemptionCalculation {
    exemption_id?: number
    exemption_percentage: number
    exemption_amount: number
    net_amount: number
}

export interface ExemptionStats {
    totalExemptions: number
    activeExemptions: number
    fullExemptions: number
    partialExemptions: number
}

export interface ExemptionAPI {
    getExemptions: (filters?: { studentId?: number; academicYearId?: number; termId?: number; status?: string }) => Promise<FeeExemption[]>
    getExemptionById: (id: number) => Promise<FeeExemption | undefined>
    getStudentExemptions: (studentId: number, academicYearId: number, termId: number) => Promise<FeeExemption[]>
    calculateExemption: (studentId: number, academicYearId: number, termId: number, categoryId: number, originalAmount: number) => Promise<ExemptionCalculation>
    createExemption: (data: ExemptionCreateData) => Promise<{ success: boolean; id?: number; errors?: string[] }>
    revokeExemption: (id: number, reason: string) => Promise<{ success: boolean; errors?: string[] }>
    getExemptionStats: (academicYearId?: number) => Promise<ExemptionStats>
}
