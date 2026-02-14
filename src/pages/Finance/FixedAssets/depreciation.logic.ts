import type { FinancialPeriod } from '../../../types/electron-api/FixedAssetAPI'

export interface DepreciationPrecheck {
    allowed: boolean
    reason?: string
}

export function getUnlockedPeriods(periods: FinancialPeriod[]): FinancialPeriod[] {
    return periods.filter(period => !period.is_locked)
}

export function getDefaultPeriodId(periods: FinancialPeriod[]): number | null {
    if (periods.length === 0) {
        return null
    }
    return periods[0].id
}

export function canRunDepreciation(userId: number | undefined, periodId: number | null): DepreciationPrecheck {
    if (!userId) {
        return {
            allowed: false,
            reason: 'You must be signed in to run depreciation'
        }
    }

    if (!periodId) {
        return {
            allowed: false,
            reason: 'Select an unlocked financial period first'
        }
    }

    return { allowed: true }
}
