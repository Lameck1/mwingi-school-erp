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
})
