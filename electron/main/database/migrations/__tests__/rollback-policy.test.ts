import { describe, expect, it } from 'vitest'
import {
  getRollbackStrategy,
  IRREVERSIBLE_INCREMENTAL_MIGRATIONS,
  REVERSIBLE_INCREMENTAL_MIGRATIONS,
  verifyRollbackCoverage,
} from '../rollback-policy'
import { getRegisteredMigrationNames } from '../index'

describe('rollback-policy', () => {
  it('getRollbackStrategy returns not-applicable for non-incremental migrations', () => {
    expect(getRollbackStrategy('0001_initial_schema')).toBe('not-applicable')
    expect(getRollbackStrategy('0010_seed_core_data')).toBe('not-applicable')
    expect(getRollbackStrategy('0020_seed_academic_data')).toBe('not-applicable')
  })

  it('getRollbackStrategy returns down for reversible migrations', () => {
    for (const name of REVERSIBLE_INCREMENTAL_MIGRATIONS) {
      expect(getRollbackStrategy(name)).toBe('down')
    }
  })

  it('getRollbackStrategy returns backup-restore for irreversible migrations', () => {
    for (const name of IRREVERSIBLE_INCREMENTAL_MIGRATIONS) {
      expect(getRollbackStrategy(name)).toBe('backup-restore')
    }
  })

  it('getRollbackStrategy returns backup-restore for unknown incremental migration', () => {
    // An incremental that's not in either set defaults to backup-restore
    expect(getRollbackStrategy('1999_unknown_migration')).toBe('backup-restore')
  })

  it('verifyRollbackCoverage returns empty for proper coverage', () => {
    // Every registered incremental migration should be covered
    const uncovered = verifyRollbackCoverage()
    expect(uncovered).toEqual([])
  })

  it('all registered incremental migrations have a strategy', () => {
    const incremental = getRegisteredMigrationNames().filter(n => /^1\d{3}_/.test(n))
    expect(incremental.length).toBeGreaterThan(0)
    for (const name of incremental) {
      const strategy = getRollbackStrategy(name)
      expect(['down', 'backup-restore']).toContain(strategy)
    }
  })

  it('every migration is registered in either reversible or irreversible set (or falls back)', () => {
    const incremental = getRegisteredMigrationNames().filter(n => /^1\d{3}_/.test(n))
    for (const name of incremental) {
      const inReversible = REVERSIBLE_INCREMENTAL_MIGRATIONS.has(name)
      const inIrreversible = IRREVERSIBLE_INCREMENTAL_MIGRATIONS.has(name)
      // It's in at least one, or it falls back to backup-restore
      const strategy = getRollbackStrategy(name)
      expect(strategy === 'down' || strategy === 'backup-restore').toBe(true)
      // Should not be in both
      expect(inReversible && inIrreversible).toBe(false)
    }
  })
})
