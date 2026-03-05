import { useState, useCallback } from 'react'

export type JssAccountType = 'TUITION' | 'OPERATIONS' | 'INFRASTRUCTURE'

export interface VirementValidationResult {
    allowed: boolean
    reason?: string
    from_account: JssAccountType
    to_account: JssAccountType
}

export interface VirementRequest {
    id: number
    from_account_type: JssAccountType
    to_account_type: JssAccountType
    amount: number
    reason: string
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    requested_by_user_id: number
    reviewed_by_user_id: number | null
    created_at: string
}

export interface AccountSummary {
    account_type: JssAccountType
    total_invoiced: number
    total_collected: number
    total_expenditure: number
    balance: number
}

export function useVirement() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const executeCall = async <T,>(apiCall: () => Promise<{ success: boolean; data?: T; id?: number; error?: string }>): Promise<T | null> => {
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

    const validateExpenditure = useCallback(async (expenseAccountType: JssAccountType, fundingCategoryId: number): Promise<VirementValidationResult | null> => {
        return executeCall(() => globalThis.electronAPI.finance.validateExpenditure(expenseAccountType, fundingCategoryId))
    }, [])

    const requestVirement = useCallback(async (fromAccount: JssAccountType, toAccount: JssAccountType, amount: number, reason: string): Promise<number | null> => {
        return executeCall(() => globalThis.electronAPI.finance.requestVirement(fromAccount, toAccount, amount, reason))
    }, [])

    const reviewVirement = useCallback(async (requestId: number, decision: 'APPROVED' | 'REJECTED', reviewNotes: string): Promise<boolean | null> => {
        return executeCall(() => globalThis.electronAPI.finance.reviewVirement(requestId, decision, reviewNotes))
    }, [])

    const getPendingRequests = useCallback(async (): Promise<VirementRequest[] | null> => {
        return executeCall(() => globalThis.electronAPI.finance.getPendingRequests())
    }, [])

    const getAccountSummaries = useCallback(async (): Promise<AccountSummary[] | null> => {
        return executeCall(() => globalThis.electronAPI.finance.getAccountSummaries())
    }, [])

    return {
        isLoading,
        error,
        validateExpenditure,
        requestVirement,
        reviewVirement,
        getPendingRequests,
        getAccountSummaries
    }
}
