import { useState, useCallback } from 'react'

export interface InstallmentSchedule {
    id?: number
    installment_number: number
    percentage: number
    due_date: string
    description?: string
}

export interface InstallmentPolicy {
    id: number
    policy_name: string
    academic_year_id: number
    stream_id: number | null
    student_type: 'DAY_SCHOLAR' | 'BOARDER' | 'ALL'
    number_of_installments: number
    is_active: number
    created_at: string
}

export interface VoteHeadBalance {
    fee_category_id: number
    category_name: string
    total_charged: number
    total_paid: number
    outstanding: number
}

export function useFeePolicies() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const executeCall = async <T>(apiCall: () => Promise<{ success: boolean; data?: T; id?: number; error?: string }>): Promise<T | null> => {
        setIsLoading(true)
        setError(null)
        try {
            const res = await apiCall()
            if (res.success) {
                return (res.data ?? res.id ?? true) as T
            }
            setError(res.error || 'Operation failed')
            return null
        } catch (e) {
            setError(e instanceof Error ? e.message : 'An error occurred')
            return null
        } finally {
            setIsLoading(false)
        }
    }

    const createInstallmentPolicy = useCallback(async (data: {
        policy_name: string
        academic_year_id: number
        stream_id?: number
        student_type: 'DAY_SCHOLAR' | 'BOARDER' | 'ALL'
        schedules: InstallmentSchedule[]
    }): Promise<number | null> => executeCall(() => globalThis.electronAPI.finance.createInstallmentPolicy(data)), [])

    const getPoliciesForTerm = useCallback(async (academicYearId: number, streamId?: number, studentType?: string): Promise<InstallmentPolicy[] | null> =>
        executeCall(() => globalThis.electronAPI.finance.getPoliciesForTerm(academicYearId, streamId, studentType)), [])

    const getInstallmentSchedule = useCallback(async (policyId: number): Promise<InstallmentSchedule[] | null> =>
        executeCall(() => globalThis.electronAPI.finance.getInstallmentSchedule(policyId)), [])

    const deactivatePolicy = useCallback(async (policyId: number): Promise<boolean | null> =>
        executeCall(() => globalThis.electronAPI.finance.deactivatePolicy(policyId)), [])

    const getVoteHeadBalances = useCallback(async (invoiceId: number): Promise<VoteHeadBalance[] | null> =>
        executeCall(() => globalThis.electronAPI.finance.getVoteHeadBalances(invoiceId)), [])

    return {
        isLoading,
        error,
        createInstallmentPolicy,
        getPoliciesForTerm,
        getInstallmentSchedule,
        deactivatePolicy,
        getVoteHeadBalances
    }
}
