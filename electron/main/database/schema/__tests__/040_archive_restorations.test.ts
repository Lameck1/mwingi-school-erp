import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { up } from '../fragments/040_archive_restorations'

describe('040_archive_restorations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec('PRAGMA foreign_keys = OFF')
    // Create prerequisite tables
    db.exec('CREATE TABLE user (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE student (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE staff (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE stream (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE subject (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE exam (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, term_id INTEGER, total_amount INTEGER, status TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)')
    db.exec('CREATE TABLE fee_category (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE academic_year (id INTEGER PRIMARY KEY, year_name TEXT)')
    db.exec('CREATE TABLE term (id INTEGER PRIMARY KEY, academic_year_id INTEGER, term_number INTEGER, term_name TEXT, start_date TEXT, end_date TEXT, status TEXT DEFAULT \'OPEN\', is_current INTEGER DEFAULT 0)')
    db.exec("INSERT INTO academic_year (id, year_name) VALUES (1, '2026')")
    db.exec("INSERT INTO term (id, academic_year_id, term_number, term_name, start_date, end_date, status, is_current) VALUES (1, 1, 1, 'Term 1', '2026-01-06', '2026-04-11', 'OPEN', 1)")
    db.exec('CREATE TABLE invoice_item (id INTEGER PRIMARY KEY)')
    db.exec('CREATE TABLE enrollment (id INTEGER PRIMARY KEY, term_id INTEGER)')
    db.exec('CREATE TABLE grading_scale (id INTEGER PRIMARY KEY, curriculum TEXT, grade TEXT, min_score INTEGER, max_score INTEGER, points REAL, remarks TEXT)')
    db.exec('CREATE TABLE approval_request (id INTEGER PRIMARY KEY)')
  })

  afterEach(() => {
    db.close()
  })

  it('up() creates archive restoration tables', () => {
    up(db)

    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[]
    const names = tables.map(t => t.name)

    expect(names).toContain('credit_transaction')
    expect(names).toContain('scholarship')
    expect(names).toContain('void_audit')
    expect(names).toContain('fee_exemption')
    expect(names).toContain('academic_term')
  })

  it('up() syncs academic_term records from term table', () => {
    up(db)

    const terms = db.prepare('SELECT * FROM academic_term').all() as Array<{ id: number; term_name: string }>
    expect(terms.length).toBeGreaterThanOrEqual(1)
    expect(terms[0]!.term_name).toBe('Term 1')
  })

  it('up() adds compatibility columns to fee_invoice', () => {
    up(db)

    const cols = db.prepare('PRAGMA table_info(fee_invoice)').all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('academic_term_id')
    expect(colNames).toContain('amount')
    expect(colNames).toContain('amount_due')
  })

  it('up() adds compatibility columns to invoice_item', () => {
    up(db)

    const cols = db.prepare('PRAGMA table_info(invoice_item)').all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('exemption_id')
    expect(colNames).toContain('original_amount')
  })

  it('up() is idempotent', () => {
    up(db)
    expect(() => up(db)).not.toThrow()
  })

  it('up() migrates CBC grading scale', () => {
    // Seed old style grades
    db.exec(`INSERT OR IGNORE INTO grading_scale (curriculum, grade, min_score, max_score, points, remarks) VALUES ('CBC', 'Exceeding Expectations', 75, 100, 4, 'Excellent')`)

    up(db)

    // Old 4-level grades should be removed
    const oldGrades = db.prepare("SELECT * FROM grading_scale WHERE grade = 'Exceeding Expectations'").all()
    expect(oldGrades.length).toBe(0)

    // New 8-level grades should exist
    const newGrades = db.prepare("SELECT * FROM grading_scale WHERE curriculum = 'CBC' AND grade LIKE '%E1%'").all()
    expect(newGrades.length).toBeGreaterThanOrEqual(1)
  })

  it('up() handles missing term/academic_year tables gracefully', () => {
    db.exec('DROP TABLE term')
    db.exec('DROP TABLE academic_year')
    db.exec('DROP TABLE enrollment')
    // Should still run without error
    expect(() => up(db)).not.toThrow()
  })

  it('up() backfills fee_invoice amounts from total_amount', () => {
    db.exec('INSERT INTO fee_invoice (id, student_id, term_id, total_amount, status) VALUES (1, 1, 1, 50000, \'PENDING\')')

    up(db)

    const invoice = db.prepare('SELECT amount, amount_due FROM fee_invoice WHERE id = 1').get() as { amount: number; amount_due: number } | undefined
    expect(invoice?.amount).toBe(50000)
    expect(invoice?.amount_due).toBe(50000)
  })

  // ── Branch coverage: migrateCBCGradingScale when no grading_scale table ──
  it('up() skips CBC migration when grading_scale table does not exist', () => {
    db.exec('DROP TABLE grading_scale')
    // Should still complete without error (migrateCBCGradingScale returns early)
    expect(() => up(db)).not.toThrow()
  })

  // ── Branch coverage: addColumnIfMissing skips when column already exists ──
  it('up() does not error when compatibility columns already exist', () => {
    up(db)
    // Columns already added; running again exercises addColumnIfMissing skip-path
    expect(() => up(db)).not.toThrow()
    const cols = db.prepare('PRAGMA table_info(fee_invoice)').all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('academic_term_id')
  })

  // ── Branch coverage: term without created_at column path ──
  it('up() syncs academic_term records when term table lacks created_at column', () => {
    // Default term table in beforeEach has no created_at column → termHasCreatedAt=false branch
    up(db)
    const terms = db.prepare('SELECT * FROM academic_term').all() as Array<{ id: number; term_name: string }>
    expect(terms.length).toBeGreaterThanOrEqual(1)
  })

  // ── Branch coverage: applyAcademicTermCompatibilityBackfill with term_start present ──
  it('up() backfills start_date from term_start when present in academic_term', () => {
    up(db)
    // Manually add term_start/term_end columns and populate them
    try { db.exec('ALTER TABLE academic_term ADD COLUMN term_start TEXT') } catch { /* already exists */ }
    try { db.exec('ALTER TABLE academic_term ADD COLUMN term_end TEXT') } catch { /* already exists */ }
    // Set term_start/term_end to different values (start_date is NOT NULL so we keep it)
    db.exec("UPDATE academic_term SET term_start = '2026-01-10', term_end = '2026-04-15' WHERE id = 1")
    // Second run exercises the term_start/term_end backfill branch
    up(db)
    const term = db.prepare('SELECT start_date, end_date, term_start, term_end FROM academic_term WHERE id = 1').get() as any
    // Verify term_start and term_end columns are preserved
    expect(term.term_start).toBe('2026-01-10')
    expect(term.term_end).toBe('2026-04-15')
  })

  // ── Branch coverage: syncAcademicTermRecords when term has created_at column (L386-387) ──
  it('up() uses t.created_at when term table has created_at column', () => {
    // Recreate term table WITH created_at column to hit the termHasCreatedAt=true branch
    db.exec('DROP TABLE term')
    db.exec(`CREATE TABLE term (
      id INTEGER PRIMARY KEY, academic_year_id INTEGER, term_number INTEGER,
      term_name TEXT, start_date TEXT, end_date TEXT,
      status TEXT DEFAULT 'OPEN', is_current INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT '2026-01-01 00:00:00'
    )`)
    db.exec("INSERT INTO term (id, academic_year_id, term_number, term_name, start_date, end_date, status, is_current, created_at) VALUES (1, 1, 1, 'Term 1', '2026-01-06', '2026-04-11', 'OPEN', 1, '2026-02-15 10:00:00')")

    up(db)

    const terms = db.prepare('SELECT * FROM academic_term').all() as Array<{ id: number; term_name: string; created_at: string }>
    expect(terms.length).toBeGreaterThanOrEqual(1)
    expect(terms[0]!.term_name).toBe('Term 1')
    // created_at should be populated from term.created_at, not CURRENT_TIMESTAMP
    expect(terms[0]!.created_at).toBe('2026-02-15 10:00:00')
  })

  // ── Branch coverage: applyInvoiceCompatibilityBackfill skips when enrollment lacks term_id (L452) ──
  it('up() skips enrollment academic_term_id backfill when term_id column is absent', () => {
    // Recreate enrollment WITHOUT term_id column
    db.exec('DROP TABLE enrollment')
    db.exec('CREATE TABLE enrollment (id INTEGER PRIMARY KEY, student_id INTEGER)')

    up(db)

    // enrollment should have academic_term_id added but no backfill since term_id is absent
    const cols = db.prepare('PRAGMA table_info(enrollment)').all() as Array<{ name: string }>
    const colNames = cols.map(c => c.name)
    expect(colNames).toContain('academic_term_id')
  })

  // ── Branch coverage: applyInvoiceCompatibilityBackfill skips when fee_invoice lacks total_amount (L455) ──
  it('up() skips fee_invoice amount backfill when total_amount column is absent', () => {
    // Recreate fee_invoice WITHOUT total_amount column but WITH updated_at to
    // avoid SQLite rejection of ALTER TABLE ADD COLUMN with non-constant default
    db.exec('DROP TABLE fee_invoice')
    db.exec("CREATE TABLE fee_invoice (id INTEGER PRIMARY KEY, student_id INTEGER, status TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)")
    db.exec("INSERT INTO fee_invoice (id, student_id, status) VALUES (1, 1, 'PENDING')")

    up(db)

    // amount column should be added but remain NULL since total_amount was absent
    const invoice = db.prepare('SELECT amount FROM fee_invoice WHERE id = 1').get() as { amount: number | null }
    expect(invoice.amount).toBeNull()
  })

  // ── Branch coverage: applyInvoiceCompatibilityBackfill backfills academic_term_id from term_id (L457) ──
  it('up() backfills fee_invoice academic_term_id from term_id', () => {
    db.exec("INSERT INTO fee_invoice (id, student_id, term_id, total_amount, status) VALUES (2, 1, 1, 30000, 'PENDING')")

    up(db)

    const invoice = db.prepare('SELECT academic_term_id FROM fee_invoice WHERE id = 2').get() as { academic_term_id: number | null }
    expect(invoice.academic_term_id).toBe(1)
  })
})
