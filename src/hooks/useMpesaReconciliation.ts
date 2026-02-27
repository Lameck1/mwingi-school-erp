import { useState, useCallback, useEffect } from 'react'

export interface MpesaTransaction {
    id: number
    transaction_receipt: string
    transaction_date: string
    amount: number
    receiver_party_public_name: string
    sender_party_public_name: string
    sender_msisdn: string
    account_reference: string
    match_status: 'PENDING' | 'MATCHED' | 'FAILED' | 'IGNORED'
    match_confidence_score: number | null
    matched_student_id: number | null
    student_name?: string
    student_admission_number?: string
    is_duplicate: boolean
    created_at: string
}

export interface MpesaSummary {
    totalSummary: {
        total_processed: number
        total_matched: number
        total_pending: number
        total_failed: number
        total_ignored: number
        total_duplicates: number
        total_amount_processed: number
    }
}

export function useMpesaReconciliation() {
    const [unmatchedData, setUnmatchedData] = useState<MpesaTransaction[]>([])
    const [summary, setSummary] = useState<MpesaSummary | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchUnmatched = useCallback(async () => {
        try {
            setIsLoading(true)
            const data = await window.electronAPI.finance.getUnmatchedMpesaTransactions()
            setUnmatchedData(data)
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to fetch unmatched transactions')
        } finally {
            setIsLoading(false)
        }
    }, [])

    const fetchSummary = useCallback(async () => {
        try {
            const data = await window.electronAPI.finance.getMpesaSummary()
            setSummary(data)
        } catch (err: unknown) {
            console.error('Failed to fetch M-Pesa summary:', err)
            setError(err instanceof Error ? err.message : 'Failed to fetch reconciliation summary')
        }
    }, [])

    const refreshData = useCallback(() => {
        void fetchUnmatched()
        void fetchSummary()
    }, [fetchUnmatched, fetchSummary])

    useEffect(() => {
        refreshData()
    }, [refreshData])

    const importCsv = async (rows: ReadonlyArray<Record<string, unknown>>, fileName: string) => {
        try {
            setIsLoading(true)
            await window.electronAPI.finance.importMpesaTransactions(rows, 'CSV', fileName)
            void fetchUnmatched()
            void fetchSummary()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to import CSV'
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }

    const manualMatch = async (transactionId: number, studentId: number) => {
        try {
            setIsLoading(true)
            await window.electronAPI.finance.manualMatchMpesaTransaction(transactionId, studentId)
            void fetchUnmatched()
            void fetchSummary()
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Failed to match manually'
            throw new Error(message)
        } finally {
            setIsLoading(false)
        }
    }

    return {
        unmatchedData,
        summary,
        isLoading,
        error,
        refreshData,
        importCsv,
        manualMatch
    }
}
