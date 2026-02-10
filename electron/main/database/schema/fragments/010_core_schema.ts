import { type Database } from 'better-sqlite3';

import { CORE_SCHEMA_PART1 } from './010_core_schema_part1';
import { CORE_SCHEMA_PART2 } from './010_core_schema_part2';
import { CORE_SCHEMA_PART3 } from './010_core_schema_part3';
import { CORE_SCHEMA_PART4 } from './010_core_schema_part4';

const CORE_SCHEMA_SECTIONS: readonly string[] = [
  ...CORE_SCHEMA_PART1,
  ...CORE_SCHEMA_PART2,
  ...CORE_SCHEMA_PART3,
  ...CORE_SCHEMA_PART4
];

function executeSchemaSections(db: Database, sections: readonly string[]): void {
  for (const section of sections) {
    db.exec(section);
  }
}

export function up(db: Database): void {
  console.warn('Running Migration 001: Initial Schema');
  executeSchemaSections(db, CORE_SCHEMA_SECTIONS);
}

export function down(db: Database): void {
  const tables = [
    'attendance', 'financial_period', 'fixed_asset', 'asset_category', 'staff_allowance',
    'performance_improvement', 'student_award', 'award_category', 'subject_merit_entry', 'merit_list_entry', 'merit_list',
    'student_activity_participation', 'cbc_strand_expense', 'fee_category_strand', 'cbc_strand',
    'report_card_summary', 'exam_result', 'exam', 'grading_scale', 'subject_allocation', 'subject',
    'stock_movement', 'inventory_item', 'supplier', 'inventory_category',
    'payroll_allowance', 'payroll_deduction', 'payroll', 'payroll_period', 'statutory_rates',
    'receipt', 'ledger_transaction', 'transaction_category', 'invoice_item', 'fee_invoice', 'fee_structure', 'fee_category',
    'transaction_approval', 'approval_rule', 'ledger_reconciliation', 'opening_balance', 'journal_entry_line', 'journal_entry', 'gl_account',
    'staff', 'enrollment', 'student', 'stream', 'term', 'academic_year',
    'message_log', 'message_template', 'backup_log', 'audit_log', 'user', 'school_settings',
    'budget_revision', 'budget_line_item', 'budget', 'reconciliation_adjustment', 'bank_statement_line', 'bank_statement', 'bank_account',
    'approval_history', 'approval_request', 'approval_workflow'
  ];

  for (const table of tables) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
}
