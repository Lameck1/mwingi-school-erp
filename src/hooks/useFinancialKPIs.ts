import { useState, useCallback } from 'react'

export interface KpiMetric {
    name: string
    value: number
    label: string
    unit: string
    trend?: 'UP' | 'DOWN' | 'STABLE'
    target?: number
}

export interface KpiDashboard {
    generated_at: string
    metrics: KpiMetric[]
}

export interface NetAssetsChange {
    category: string
    opening_balance: number
    additions: number
    disposals: number
    revaluations: number
    closing_balance: number
}

export interface ChangesInNetAssetsReport {
    report_date: string
    period_start: string
    period_end: string
    opening_net_assets: number
    surplus_deficit: number
    asset_changes: NetAssetsChange[]
    liability_changes: NetAssetsChange[]
    closing_net_assets: number
}

export function useFinancialKPIs() {
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const fetchKpiDashboard = useCallback(async (): Promise<KpiDashboard | null> => {
        try {
            setIsLoading(true)
            setError(null)
            const res = await window.electronAPI.reports.getKpiDashboard()
            if (res.success) {
                return res.data
            } else {
                setError(res.error || 'Failed to fetch KPIs')
                return null
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to fetch KPIs')
            return null
        } finally {
            setIsLoading(false)
        }
    }, [])

    const fetchChangesInNetAssets = useCallback(async (startDate: string, endDate: string): Promise<ChangesInNetAssetsReport | null> => {
        try {
            setIsLoading(true)
            setError(null)
            const res = await window.electronAPI.reports.getChangesInNetAssets(startDate, endDate)
            if (res.success) {
                return res.data
            } else {
                setError(res.error || 'Failed to fetch Changes in Net Assets')
                return null
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Failed to fetch Changes in Net Assets')
            return null
        } finally {
            setIsLoading(false)
        }
    }, [])

    return {
        isLoading,
        error,
        fetchKpiDashboard,
        fetchChangesInNetAssets
    }
}
