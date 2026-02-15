import { randomUUID } from 'node:crypto';

import { getDatabase } from '../../../database';
import { logAudit } from '../../../database/utils/audit';

import type { JournalEntryData, JournalEntryLineData } from '../JournalService.types';
import type Database from 'better-sqlite3';

export class JournalEntryRepository {
  private readonly db: Database.Database;
  private sourceLedgerColumnAvailable: boolean | null = null;

  constructor(db?: Database.Database) {
    this.db = db || getDatabase();
  }

  private hasSourceLedgerTxnColumn(): boolean {
    if (this.sourceLedgerColumnAvailable !== null) {
      return this.sourceLedgerColumnAvailable;
    }
    const columns = this.db.prepare('PRAGMA table_info(journal_entry)').all() as Array<{ name: string }>;
    this.sourceLedgerColumnAvailable = columns.some((column) => column.name === 'source_ledger_txn_id');
    return this.sourceLedgerColumnAvailable;
  }

  tableExists(tableName: string): boolean {
    const row = this.db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(tableName) as { name: string } | undefined;
    return Boolean(row?.name);
  }

  tableHasColumn(tableName: string, columnName: string): boolean {
    if (!this.tableExists(tableName)) {
      return false;
    }

    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return columns.some((column) => column.name === columnName);
  }

  getOrCreateWorkflowId(entityType: string, workflowName: string): number | null {
    if (!this.tableExists('approval_workflow')) {
      return null;
    }

    const existing = this.db.prepare(`
      SELECT id
      FROM approval_workflow
      WHERE entity_type = ?
      LIMIT 1
    `).get(entityType) as { id: number } | undefined;
    if (existing?.id) {
      return existing.id;
    }

    const insert = this.db.prepare(`
      INSERT INTO approval_workflow (workflow_name, entity_type, is_active)
      VALUES (?, ?, 1)
    `).run(workflowName, entityType);
    return insert.lastInsertRowid as number;
  }

  validateGlAccounts(lines: JournalEntryLineData[]): { message?: string; valid: boolean } {
    for (const line of lines) {
      const account = this.db.prepare(`
          SELECT id, account_code, account_name, is_active
          FROM gl_account
          WHERE account_code = ? AND is_active = 1
        `).get(line.gl_account_code);

      if (!account) {
        return {
          valid: false,
          message: `Invalid GL account code: ${line.gl_account_code}. Check Chart of Accounts or verify account is active.`
        };
      }
    }

    return { valid: true };
  }

  insertJournalLines(entryId: number, lines: JournalEntryLineData[]): void {
    const lineStatement = this.db.prepare(`
          INSERT INTO journal_entry_line (
            journal_entry_id, line_number, gl_account_id,
            debit_amount, credit_amount, description
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);

    lines.forEach((line, index) => {
      const account = this.db.prepare(`
            SELECT id FROM gl_account WHERE account_code = ?
          `).get(line.gl_account_code) as { id: number };

      lineStatement.run(
        entryId,
        index + 1,
        account.id,
        line.debit_amount,
        line.credit_amount,
        line.description || null
      );
    });
  }

  insertJournalEntryTransaction(
    data: JournalEntryData,
    entryRef: string,
    requiresApproval: boolean,
    totalCredits: number,
    totalDebits: number
  ): number {
    const insert = this.db.transaction(() => {
      const supportsSourceLedgerLink = this.hasSourceLedgerTxnColumn();
      const headerResult = supportsSourceLedgerLink ? this.db.prepare(`
          INSERT INTO journal_entry (
            entry_ref, entry_date, entry_type, description,
            student_id, staff_id, term_id,
            requires_approval, approval_status,
            created_by_user_id, source_ledger_txn_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        entryRef,
        data.entry_date,
        data.entry_type,
        data.description,
        data.student_id || null,
        data.staff_id || null,
        data.term_id || null,
        requiresApproval ? 1 : 0,
        requiresApproval ? 'PENDING' : 'APPROVED',
        data.created_by_user_id,
        data.source_ledger_txn_id || null
      ) : this.db.prepare(`
          INSERT INTO journal_entry (
            entry_ref, entry_date, entry_type, description,
            student_id, staff_id, term_id,
            requires_approval, approval_status,
            created_by_user_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
        entryRef,
        data.entry_date,
        data.entry_type,
        data.description,
        data.student_id || null,
        data.staff_id || null,
        data.term_id || null,
        requiresApproval ? 1 : 0,
        requiresApproval ? 'PENDING' : 'APPROVED',
        data.created_by_user_id
      );

      const entryId = headerResult.lastInsertRowid as number;
      this.insertJournalLines(entryId, data.lines);

      if (!requiresApproval) {
        this.db.prepare(`
            UPDATE journal_entry
            SET is_posted = 1, posted_by_user_id = ?, posted_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(data.created_by_user_id, entryId);
      }

      logAudit(
        data.created_by_user_id,
        'CREATE',
        'journal_entry',
        entryId,
        null,
        {
          entry_ref: entryRef,
          entry_type: data.entry_type,
          total_debits: totalDebits,
          total_credits: totalCredits,
          requires_approval: requiresApproval,
          source_ledger_txn_id: data.source_ledger_txn_id || null
        }
      );

      return entryId;
    });

    return insert();
  }

  checkApprovalRequiredSync(data: JournalEntryData): boolean {
    const totalAmount = data.lines.reduce((sum, line) => sum + line.debit_amount, 0);

    const rule = this.db.prepare(`
      SELECT id FROM approval_rule
      WHERE transaction_type = ?
        AND is_active = 1
        AND (min_amount IS NULL OR ? >= min_amount)
    `).get(data.entry_type, totalAmount);

    return !!rule;
  }

  generateEntryRef(entryType: string): string {
    const prefix = entryType.substring(0, 3).toUpperCase();
    const timestamp = Date.now();
    const nonce = randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
    return `${prefix}-${timestamp}-${nonce}`;
  }

  getDb(): Database.Database {
    return this.db;
  }
}
