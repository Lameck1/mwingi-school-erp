import type Database from 'better-sqlite3'

/**
 * Migration 1026: Vote-Head Priority + Payment Item Allocation + Installment Policies
 *
 * 1. Adds `priority` column to `fee_category` for vote-head spreading order
 * 2. Creates `payment_item_allocation` for per-invoice-item payment tracking
 * 3. Creates `installment_policy` and `installment_schedule` for configurable fee payment plans
 */
export function up(db: Database.Database): void {
    // 1. Add priority column to fee_category (lower = higher priority)
    const columns = db.prepare('PRAGMA table_info(fee_category)').all() as Array<{ name: string }>
    if (!columns.some(col => col.name === 'priority')) {
        db.exec('ALTER TABLE fee_category ADD COLUMN priority INTEGER NOT NULL DEFAULT 99')
    }

    // Seed sensible defaults for common Kenyan school fee categories
    const updatePriority = db.prepare(
        'UPDATE fee_category SET priority = ? WHERE LOWER(category_name) LIKE ? AND priority = 99'
    )
    const priorityDefaults: ReadonlyArray<[number, string]> = [
        [1, '%tuition%'],
        [2, '%lunch%'],
        [3, '%boarding%'],
        [4, '%transport%'],
        [5, '%exam%'],
        [6, '%library%'],
        [7, '%ict%'],
        [8, '%activity%'],
        [9, '%uniform%'],
        [10, '%development%'],
    ]
    for (const [priority, pattern] of priorityDefaults) {
        updatePriority.run(priority, pattern)
    }

    // 2. Per-invoice-item payment allocation (vote-head tracking)
    db.exec(`
    CREATE TABLE IF NOT EXISTS payment_item_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_allocation_id INTEGER NOT NULL,
      invoice_item_id INTEGER NOT NULL,
      applied_amount INTEGER NOT NULL CHECK (applied_amount > 0),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_allocation_id) REFERENCES payment_invoice_allocation(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_item_id) REFERENCES invoice_item(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_payment_item_alloc_payment
      ON payment_item_allocation(payment_allocation_id);
    CREATE INDEX IF NOT EXISTS idx_payment_item_alloc_item
      ON payment_item_allocation(invoice_item_id);
  `)

    // 3. Installment policies
    db.exec(`
    CREATE TABLE IF NOT EXISTS installment_policy (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_name TEXT NOT NULL,
      academic_year_id INTEGER NOT NULL,
      stream_id INTEGER,
      student_type TEXT CHECK(student_type IN ('DAY_SCHOLAR', 'BOARDER', 'ALL')),
      number_of_installments INTEGER NOT NULL CHECK (number_of_installments >= 2),
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (academic_year_id) REFERENCES academic_year(id),
      FOREIGN KEY (stream_id) REFERENCES stream(id),
      FOREIGN KEY (created_by_user_id) REFERENCES user(id)
    );

    CREATE TABLE IF NOT EXISTS installment_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      policy_id INTEGER NOT NULL,
      installment_number INTEGER NOT NULL CHECK (installment_number >= 1),
      percentage INTEGER NOT NULL CHECK (percentage > 0 AND percentage <= 100),
      due_date DATE NOT NULL,
      description TEXT,
      FOREIGN KEY (policy_id) REFERENCES installment_policy(id) ON DELETE CASCADE,
      UNIQUE(policy_id, installment_number)
    );
    CREATE INDEX IF NOT EXISTS idx_installment_schedule_policy
      ON installment_schedule(policy_id);
  `)
}
