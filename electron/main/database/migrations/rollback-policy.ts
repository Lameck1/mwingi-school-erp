import { getRegisteredMigrationNames } from './index'

export type RollbackStrategy = 'down' | 'backup-restore' | 'not-applicable'

export const REVERSIBLE_INCREMENTAL_MIGRATIONS = new Set<string>([
  '1002_fix_subject_names',
  '1003_fix_grading_scale',
  '1021_accounting_periods',
  '1022_expand_journal_entry_types',
  '1023_add_department_to_journal_entry',
  '1032_performance_indexes',
])

export const IRREVERSIBLE_INCREMENTAL_MIGRATIONS = new Set<string>([
  '1001_journal_entry_bridge',
  '1002_finance_schema_fixes',
  '1003_budget_allocation',
  '1004_enrollment_active_uniqueness',
  '1005_journal_entry_type_expansion',
  '1006_payment_invoice_allocation',
  '1007_payment_idempotency_and_invoice_uniqueness',
  '1008_attendance_and_reconciliation_uniqueness',
  '1009_grant_expiry_date',
  '1010_bank_reconciliation_constraints',
  '1011_approval_canonicalization',
  '1012_add_void_reversal_type',
  '1013_financial_period_status',
  '1014_remediation_schema_fixes',
  '1015_seed_missing_system_accounts',
  '1016_migrate_sms_credentials',
  '1017_data_retention_policy',
  '1018_seed_asset_categories',
  '1019_seed_fixed_asset_gl_accounts',
  '1020_add_supplier_id_to_journal',
  '1024_login_rate_limit',
])

export function getRollbackStrategy(migrationName: string): RollbackStrategy {
  const isIncremental = /^1\d{3}_/.test(migrationName)
  if (!isIncremental) {
    return 'not-applicable'
  }
  if (REVERSIBLE_INCREMENTAL_MIGRATIONS.has(migrationName)) {
    return 'down'
  }
  return 'backup-restore'
}

export function verifyRollbackCoverage(): string[] {
  const incrementalMigrations = getRegisteredMigrationNames().filter((name) => /^1\d{3}_/.test(name))
  return incrementalMigrations.filter((name) => {
    const strategy = getRollbackStrategy(name)
    return strategy !== 'down' && strategy !== 'backup-restore'
  })
}
