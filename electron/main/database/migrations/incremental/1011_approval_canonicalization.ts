import type Database from 'better-sqlite3'

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { name: string } | undefined
  return Boolean(row?.name)
}

function columnExists(db: Database.Database, tableName: string, columnName: string): boolean {
  try {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
    return columns.some((column) => column.name === columnName)
  } catch {
    return false
  }
}

export function up(db: Database.Database): void {
  if (!tableExists(db, 'approval_request') || !tableExists(db, 'approval_workflow')) {
    return
  }

  db.exec(`
    INSERT INTO approval_workflow (workflow_name, entity_type, is_active)
    SELECT 'Journal Entry Approvals', 'JOURNAL_ENTRY', 1
    WHERE NOT EXISTS (
      SELECT 1
      FROM approval_workflow
      WHERE entity_type = 'JOURNAL_ENTRY'
    )
  `)

  if (!columnExists(db, 'approval_request', 'approval_rule_id')) {
    db.exec(`ALTER TABLE approval_request ADD COLUMN approval_rule_id INTEGER`)
  }
  if (!columnExists(db, 'approval_request', 'legacy_transaction_approval_id')) {
    db.exec(`ALTER TABLE approval_request ADD COLUMN legacy_transaction_approval_id INTEGER`)
  }

  if (tableExists(db, 'transaction_approval') && tableExists(db, 'journal_entry')) {
    db.exec(`
      INSERT INTO approval_request (
        workflow_id,
        entity_type,
        entity_id,
        current_step,
        status,
        requested_by_user_id,
        final_approver_user_id,
        completed_at,
        created_at,
        approval_rule_id,
        legacy_transaction_approval_id
      )
      SELECT
        workflow.id,
        'JOURNAL_ENTRY',
        ta.journal_entry_id,
        1,
        CASE ta.status
          WHEN 'APPROVED' THEN 'APPROVED'
          WHEN 'REJECTED' THEN 'REJECTED'
          ELSE 'PENDING'
        END,
        ta.requested_by_user_id,
        ta.reviewed_by_user_id,
        ta.reviewed_at,
        COALESCE(ta.requested_at, CURRENT_TIMESTAMP),
        ta.approval_rule_id,
        ta.id
      FROM transaction_approval ta
      CROSS JOIN (
        SELECT id
        FROM approval_workflow
        WHERE entity_type = 'JOURNAL_ENTRY'
        LIMIT 1
      ) workflow
      WHERE NOT EXISTS (
        SELECT 1
        FROM approval_request ar
        WHERE ar.legacy_transaction_approval_id = ta.id
      )
    `)
  }

  // Keep one pending request per journal entry.
  db.exec(`
    UPDATE approval_request
    SET status = 'CANCELLED',
        completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
    WHERE id IN (
      SELECT id
      FROM (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY entity_type, entity_id
            ORDER BY created_at ASC, id ASC
          ) AS rn
        FROM approval_request
        WHERE entity_type = 'JOURNAL_ENTRY'
          AND status = 'PENDING'
      )
      WHERE rn > 1
    )
  `)

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_request_journal_pending_unique
    ON approval_request(entity_type, entity_id)
    WHERE entity_type = 'JOURNAL_ENTRY' AND status = 'PENDING'
  `)
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_request_legacy_txn_approval_unique
    ON approval_request(legacy_transaction_approval_id)
    WHERE legacy_transaction_approval_id IS NOT NULL
  `)

  if (tableExists(db, 'approval_history')) {
    db.exec(`
      INSERT INTO approval_history (
        approval_request_id,
        action,
        action_by,
        action_at,
        previous_status,
        new_status,
        notes
      )
      SELECT
        ar.id,
        'REQUESTED',
        ar.requested_by_user_id,
        COALESCE(ar.created_at, CURRENT_TIMESTAMP),
        NULL,
        'PENDING',
        CASE
          WHEN apr.rule_name IS NOT NULL THEN 'Auto-migrated from transaction_approval; rule: ' || apr.rule_name
          ELSE 'Auto-migrated from transaction_approval'
        END
      FROM approval_request ar
      LEFT JOIN approval_rule apr ON apr.id = ar.approval_rule_id
      WHERE ar.entity_type = 'JOURNAL_ENTRY'
        AND ar.legacy_transaction_approval_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM approval_history ah
          WHERE ah.approval_request_id = ar.id
            AND ah.action = 'REQUESTED'
        )
    `)

    if (tableExists(db, 'transaction_approval')) {
      db.exec(`
        INSERT INTO approval_history (
          approval_request_id,
          action,
          action_by,
          action_at,
          previous_status,
          new_status,
          notes
        )
        SELECT
          ar.id,
          CASE ar.status WHEN 'APPROVED' THEN 'APPROVED' ELSE 'REJECTED' END,
          COALESCE(ar.final_approver_user_id, ar.requested_by_user_id),
          COALESCE(ar.completed_at, ar.created_at, CURRENT_TIMESTAMP),
          'PENDING',
          ar.status,
          ta.review_notes
        FROM approval_request ar
        LEFT JOIN transaction_approval ta ON ta.id = ar.legacy_transaction_approval_id
        WHERE ar.entity_type = 'JOURNAL_ENTRY'
          AND ar.status IN ('APPROVED', 'REJECTED')
          AND ar.legacy_transaction_approval_id IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM approval_history ah
            WHERE ah.approval_request_id = ar.id
              AND ah.action = CASE ar.status WHEN 'APPROVED' THEN 'APPROVED' ELSE 'REJECTED' END
          )
      `)
    }
  }
}
