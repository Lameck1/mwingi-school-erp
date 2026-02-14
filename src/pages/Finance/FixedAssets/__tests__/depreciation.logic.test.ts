import { describe, expect, it } from 'vitest'

import { canRunDepreciation, getDefaultPeriodId, getUnlockedPeriods } from '../depreciation.logic'

import type { FinancialPeriod } from '../../../../types/electron-api/FixedAssetAPI'

const periods: FinancialPeriod[] = [
    {
        id: 1,
        period_name: 'Jan 2026',
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        is_locked: true
    },
    {
        id: 2,
        period_name: 'Feb 2026',
        start_date: '2026-02-01',
        end_date: '2026-02-28',
        is_locked: false
    }
]

describe('depreciation logic', () => {
    it('returns only unlocked periods', () => {
        const unlocked = getUnlockedPeriods(periods)
        expect(unlocked).toHaveLength(1)
        expect(unlocked[0].id).toBe(2)
    })

    it('returns first unlocked period as default', () => {
        const unlocked = getUnlockedPeriods(periods)
        expect(getDefaultPeriodId(unlocked)).toBe(2)
    })

    it('returns null default period when no unlocked periods exist', () => {
        const unlocked = getUnlockedPeriods([{ ...periods[0] }])
        expect(getDefaultPeriodId(unlocked)).toBeNull()
    })

    it('blocks depreciation when user is not signed in', () => {
        const result = canRunDepreciation(undefined, 2)
        expect(result.allowed).toBe(false)
        expect(result.reason).toBe('You must be signed in to run depreciation')
    })

    it('blocks depreciation when period is not selected', () => {
        const result = canRunDepreciation(3, null)
        expect(result.allowed).toBe(false)
        expect(result.reason).toBe('Select an unlocked financial period first')
    })

    it('allows depreciation when user and period are valid', () => {
        const result = canRunDepreciation(3, 2)
        expect(result.allowed).toBe(true)
        expect(result.reason).toBeUndefined()
    })
})
