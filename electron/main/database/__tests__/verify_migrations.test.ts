import { describe, expect, it } from 'vitest'

import { computeMigrationDriftFromSets } from '../verify_migrations'

describe('computeMigrationDriftFromSets', () => {
  it('returns no drift when file, registry, and applied sets align', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta']
    )

    expect(result).toEqual({
      fileOnly: [],
      registryOnly: [],
      appliedButUnregistered: []
    })
  })

  it('detects file-only, registry-only, and applied-but-unregistered drift', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1003_gamma'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1004_delta']
    )

    expect(result.fileOnly).toEqual(['1002_beta'])
    expect(result.registryOnly).toEqual(['1004_delta'])
    expect(result.appliedButUnregistered).toEqual(['1003_gamma'])
  })

  it('ignores non-incremental migration names when checking applied-but-unregistered drift', () => {
    const result = computeMigrationDriftFromSets(
      ['0001_initial_schema', '1003_gamma'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta']
    )

    expect(result.appliedButUnregistered).toEqual(['1003_gamma'])
  })

  it('treats names with numeric prefix below 1000 as non-incremental', () => {
    const result = computeMigrationDriftFromSets(
      ['0001_initial', '0500_middle', '0999_boundary'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    expect(result.appliedButUnregistered).toEqual([])
  })

  it('treats names without numeric prefix as non-incremental', () => {
    const result = computeMigrationDriftFromSets(
      ['initial_schema', 'add_users_table', 'no_number'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    expect(result.appliedButUnregistered).toEqual([])
  })

  it('handles empty input sets', () => {
    const result = computeMigrationDriftFromSets([], [], [])
    expect(result.fileOnly).toEqual([])
    expect(result.registryOnly).toEqual([])
    expect(result.appliedButUnregistered).toEqual([])
  })

  it('flags all incremental applied names when registry is empty', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1002_beta', '1003_gamma'],
      ['1001_alpha', '1002_beta', '1003_gamma'],
      []
    )
    expect(result.appliedButUnregistered).toEqual(['1001_alpha', '1002_beta', '1003_gamma'])
    expect(result.fileOnly).toEqual(['1001_alpha', '1002_beta', '1003_gamma'])
    expect(result.registryOnly).toEqual([])
  })

  it('handles exact boundary of 1000 prefix as incremental', () => {
    const result = computeMigrationDriftFromSets(
      ['1000_boundary'],
      ['1000_boundary'],
      []
    )
    expect(result.appliedButUnregistered).toEqual(['1000_boundary'])
  })

  it('does not flag applied names that are in registry', () => {
    const result = computeMigrationDriftFromSets(
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta'],
      ['1001_alpha', '1002_beta']
    )
    expect(result.appliedButUnregistered).toEqual([])
  })

  // ── Branch coverage: applied names with mixed incremental/non-incremental ──
  it('filters out non-incremental applied names while flagging incremental ones', () => {
    const result = computeMigrationDriftFromSets(
      ['0001_initial', '1001_alpha', '1002_beta', 'add_users'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    // Only 1002_beta is incremental and not in registry
    expect(result.appliedButUnregistered).toEqual(['1002_beta'])
  })

  // ── Branch coverage: isIncrementalMigrationName with prefix exactly 999 ──
  it('treats prefix 999 as non-incremental', () => {
    const result = computeMigrationDriftFromSets(
      ['0999_almost'],
      ['1001_alpha'],
      ['1001_alpha']
    )
    expect(result.appliedButUnregistered).toEqual([])
  })

  // ── Branch coverage: fileOnly and registryOnly together ──
  it('detects file-only and registry-only simultaneously', () => {
    const result = computeMigrationDriftFromSets(
      [],
      ['1001_alpha', '1002_beta'],
      ['1003_gamma', '1004_delta']
    )
    expect(result.fileOnly).toEqual(['1001_alpha', '1002_beta'])
    expect(result.registryOnly).toEqual(['1003_gamma', '1004_delta'])
    expect(result.appliedButUnregistered).toEqual([])
  })

  // ── Branch coverage: all sets identical ──
  it('handles all sets with identical entries', () => {
    const names = ['1001_a', '1002_b', '1003_c']
    const result = computeMigrationDriftFromSets(names, names, names)
    expect(result.fileOnly).toEqual([])
    expect(result.registryOnly).toEqual([])
    expect(result.appliedButUnregistered).toEqual([])
  })

  // ── Branch coverage: name with no underscore after digits ──
  it('treats name with all digits and no underscore as non-incremental', () => {
    const result = computeMigrationDriftFromSets(
      ['1234'],
      [],
      []
    )
    // '1234' has no underscore after digits, so /^(\d+)_/ won't match → non-incremental
    expect(result.appliedButUnregistered).toEqual([])
  })
})
