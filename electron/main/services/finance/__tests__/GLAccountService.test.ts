/**
 * GLAccountService tests — CRUD with computed balance, system account guards,
 * soft-delete behaviour, and filter logic.
 */
import Database from 'better-sqlite3'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { GLAccountService, type GLAccountData } from '../GLAccountService'

/* ------------------------------------------------------------------ */
/*  Mocks                                                             */
/* ------------------------------------------------------------------ */
let testDb: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => testDb,
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: vi.fn(),
}))

/* ------------------------------------------------------------------ */
/*  Schema + seed                                                     */
/* ------------------------------------------------------------------ */
function createSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE gl_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_code TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      account_type TEXT NOT NULL CHECK(account_type IN ('ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE')),
      account_subtype TEXT,
      parent_account_id INTEGER,
      is_system_account BOOLEAN DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      requires_subsidiary BOOLEAN DEFAULT 0,
      normal_balance TEXT NOT NULL CHECK(normal_balance IN ('DEBIT','CREDIT')),
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_account_id) REFERENCES gl_account(id)
    );

    CREATE TABLE journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_ref TEXT NOT NULL UNIQUE,
      entry_date DATE NOT NULL,
      entry_type TEXT NOT NULL,
      description TEXT NOT NULL,
      is_posted BOOLEAN DEFAULT 0,
      is_voided BOOLEAN DEFAULT 0,
      created_by_user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE journal_entry_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      gl_account_id INTEGER NOT NULL,
      debit_amount INTEGER DEFAULT 0,
      credit_amount INTEGER DEFAULT 0,
      description TEXT,
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id) ON DELETE CASCADE,
      FOREIGN KEY (gl_account_id) REFERENCES gl_account(id)
    );

    CREATE TABLE user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL
    );
    CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action_type TEXT NOT NULL,
      table_name TEXT NOT NULL,
      record_id INTEGER,
      old_values TEXT,
      new_values TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT INTO user (id, username, password_hash, full_name, role) VALUES (1, 'admin', 'h', 'Admin', 'ADMIN');

    -- System account
    INSERT INTO gl_account (id, account_code, account_name, account_type, normal_balance, is_system_account)
    VALUES (1, '1000', 'Cash', 'ASSET', 'DEBIT', 1);

    -- Regular accounts
    INSERT INTO gl_account (id, account_code, account_name, account_type, normal_balance)
    VALUES (2, '4000', 'Tuition Revenue', 'REVENUE', 'CREDIT');

    INSERT INTO gl_account (id, account_code, account_name, account_type, normal_balance)
    VALUES (3, '5000', 'Salaries', 'EXPENSE', 'DEBIT');

    INSERT INTO gl_account (id, account_code, account_name, account_type, normal_balance, is_active)
    VALUES (4, '9999', 'Inactive Acc', 'EQUITY', 'CREDIT', 0);
  `)
}

const VALID_ACCOUNT: GLAccountData = {
  account_code: '2000',
  account_name: 'Accounts Payable',
  account_type: 'LIABILITY',
  normal_balance: 'CREDIT',
}

/* ================================================================== */
describe('GLAccountService', () => {
  let db: Database.Database
  let service: GLAccountService

  beforeEach(() => {
    db = new Database(':memory:')
    testDb = db
    createSchema(db)
    service = new GLAccountService()
  })

  afterEach(() => { db.close() })

  /* ============================================================== */
  /*  getAll                                                        */
  /* ============================================================== */
  describe('getAll', () => {
    it('returns all accounts', async () => {
      const result = await service.getAll()
      expect(result.success).toBe(true)
      expect(result.data.length).toBe(4)
    })

    it('computes current_balance = 0 when no journal entries', async () => {
      const result = await service.getAll()
      expect(result.data[0].current_balance).toBe(0)
    })

    it('computes current_balance from posted, non-voided entries', async () => {
      // Create posted journal entry that debits Cash 1000
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, is_posted, is_voided, created_by_user_id)
        VALUES (1, 'JE-001', '2025-01-01', 'FEE_PAYMENT', 'Test', 1, 0, 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 1, 5000, 0);
      `)
      const result = await service.getAll()
      const cashAccount = result.data.find(a => a.account_code === '1000')!
      expect(cashAccount.current_balance).toBe(5000) // DEBIT normal, debit_amount=5000
    })

    it('ignores voided journal entries in balance calculation', async () => {
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, is_posted, is_voided, created_by_user_id)
        VALUES (1, 'JE-V01', '2025-01-01', 'ADJUSTMENT', 'Voided', 1, 1, 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 1, 9999, 0);
      `)
      const result = await service.getAll()
      const cashAccount = result.data.find(a => a.account_code === '1000')!
      expect(cashAccount.current_balance).toBe(0)
    })

    it('ignores un-posted journal entries', async () => {
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, is_posted, is_voided, created_by_user_id)
        VALUES (1, 'JE-U01', '2025-01-01', 'ADJUSTMENT', 'Unposted', 0, 0, 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 1, 8000, 0);
      `)
      const result = await service.getAll()
      const cashAccount = result.data.find(a => a.account_code === '1000')!
      expect(cashAccount.current_balance).toBe(0)
    })

    it('handles CREDIT normal_balance correctly', async () => {
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, is_posted, is_voided, created_by_user_id)
        VALUES (1, 'JE-C01', '2025-01-01', 'FEE_PAYMENT', 'Rev', 1, 0, 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 2, 0, 3000);
      `)
      const result = await service.getAll()
      const revenueAccount = result.data.find(a => a.account_code === '4000')!
      expect(revenueAccount.current_balance).toBe(3000)
    })

    it('filters by account_type', async () => {
      const result = await service.getAll({ type: 'ASSET' })
      expect(result.data.length).toBe(1)
      expect(result.data[0].account_code).toBe('1000')
    })

    it('filters by isActive', async () => {
      const result = await service.getAll({ isActive: false })
      expect(result.data.length).toBe(1)
      expect(result.data[0].account_code).toBe('9999')
    })

    it('orders by account_code ASC', async () => {
      const result = await service.getAll()
      const codes = result.data.map(a => a.account_code)
      expect(codes).toEqual([...codes].sort((a, b) => a.localeCompare(b)))
    })
  })

  /* ============================================================== */
  /*  getById                                                       */
  /* ============================================================== */
  describe('getById', () => {
    it('returns account when found', async () => {
      const result = await service.getById(1)
      expect(result.success).toBe(true)
      expect(result.data!.account_code).toBe('1000')
    })

    it('returns error when not found', async () => {
      const result = await service.getById(999)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })
  })

  /* ============================================================== */
  /*  create                                                        */
  /* ============================================================== */
  describe('create', () => {
    it('creates a new account', async () => {
      const result = await service.create(VALID_ACCOUNT, 1)
      expect(result.success).toBe(true)
      expect(result.data!.account_code).toBe('2000')
      expect(result.message).toBe('Account created successfully')
    })

    it('defaults is_active to true', async () => {
      await service.create(VALID_ACCOUNT, 1)
      const row = db.prepare('SELECT is_active FROM gl_account WHERE account_code = ?').get('2000') as { is_active: number }
      expect(row.is_active).toBe(1)
    })

    it('defaults is_system_account to false', async () => {
      await service.create(VALID_ACCOUNT, 1)
      const row = db.prepare('SELECT is_system_account FROM gl_account WHERE account_code = ?').get('2000') as { is_system_account: number }
      expect(row.is_system_account).toBe(0)
    })

    it('returns error for duplicate account_code', async () => {
      const result = await service.create({ ...VALID_ACCOUNT, account_code: '1000' }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toContain('UNIQUE constraint')
    })

    it('calls logAudit on success', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      ;(logAudit as ReturnType<typeof vi.fn>).mockClear()
      await service.create(VALID_ACCOUNT, 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'CREATE', 'gl_account', expect.any(Number), null, VALID_ACCOUNT,
      )
    })
  })

  /* ============================================================== */
  /*  update                                                        */
  /* ============================================================== */
  describe('update', () => {
    it('updates account_name', async () => {
      const result = await service.update(2, { account_name: 'Fees Revenue' }, 1)
      expect(result.success).toBe(true)
      expect(result.data!.account_name).toBe('Fees Revenue')
    })

    it('returns not-found for missing id', async () => {
      const result = await service.update(999, { account_name: 'X' }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })

    it('prevents changing account_code of system account', async () => {
      const result = await service.update(1, { account_code: '1001' }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot change account code of a system account')
    })

    it('allows changing account_code of non-system account', async () => {
      const result = await service.update(2, { account_code: '4001' }, 1)
      expect(result.success).toBe(true)
      expect(result.data!.account_code).toBe('4001')
    })

    it('allows updating other fields of a system account', async () => {
      const result = await service.update(1, { description: 'Main cash account' }, 1)
      expect(result.success).toBe(true)
    })

    it('returns "No changes provided" when payload is empty', async () => {
      const result = await service.update(2, {}, 1)
      expect(result.success).toBe(true)
      expect(result.message).toBe('No changes provided')
    })
  })

  /* ============================================================== */
  /*  delete                                                        */
  /* ============================================================== */
  describe('delete', () => {
    it('hard-deletes account with no journal entries', async () => {
      const result = await service.delete(3, 1) // Salaries, no entries
      expect(result.success).toBe(true)
      expect(result.message).toBe('Account deleted successfully')
      expect(db.prepare('SELECT * FROM gl_account WHERE id=3').get()).toBeUndefined()
    })

    it('returns error when deleting non-existent account', async () => {
      const result = await service.delete(999, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBe('Account not found')
    })

    it('prevents deleting a system account', async () => {
      const result = await service.delete(1, 1) // Cash is system
      expect(result.success).toBe(false)
      expect(result.error).toBe('Cannot delete a system account')
    })

    it('soft-deletes (deactivates) account with journal entries', async () => {
      // Add a journal entry line referencing account 2
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, created_by_user_id)
        VALUES (1, 'JE-001', '2025-01-01', 'FEE_PAYMENT', 'test', 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 2, 1000, 0);
      `)
      const result = await service.delete(2, 1)
      expect(result.success).toBe(true)
      expect(result.message).toContain('deactivated instead of deleted')

      // Account still exists but is inactive
      const row = db.prepare('SELECT is_active FROM gl_account WHERE id=2').get() as { is_active: number }
      expect(row.is_active).toBe(0)
    })

    it('calls logAudit with DEACTIVATE action for soft delete', async () => {
      const { logAudit } = await import('../../../database/utils/audit')
      db.exec(`
        INSERT INTO journal_entry (id, entry_ref, entry_date, entry_type, description, created_by_user_id)
        VALUES (1, 'JE-002', '2025-01-01', 'FEE_PAYMENT', 'test', 1);
        INSERT INTO journal_entry_line (journal_entry_id, line_number, gl_account_id, debit_amount, credit_amount)
        VALUES (1, 1, 2, 500, 0);
      `)
      ;(logAudit as ReturnType<typeof vi.fn>).mockClear()
      await service.delete(2, 1)
      expect(logAudit).toHaveBeenCalledWith(
        1, 'DEACTIVATE', 'gl_account', 2,
        expect.objectContaining({ account_code: '4000' }),
        { is_active: false },
      )
    })
  })

  /* ============================================================== */
  /*  update – boolean fields & edge cases                          */
  /* ============================================================== */
  describe('update – boolean and edge-case branches', () => {
    it('updates is_active to false', async () => {
      const result = await service.update(2, { is_active: false }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT is_active FROM gl_account WHERE id=2').get() as { is_active: number }
      expect(row.is_active).toBe(0)
    })

    it('updates is_active to true', async () => {
      // account 4 starts inactive
      const result = await service.update(4, { is_active: true }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT is_active FROM gl_account WHERE id=4').get() as { is_active: number }
      expect(row.is_active).toBe(1)
    })

    it('updates requires_subsidiary', async () => {
      const result = await service.update(2, { requires_subsidiary: true }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT requires_subsidiary FROM gl_account WHERE id=2').get() as { requires_subsidiary: number }
      expect(row.requires_subsidiary).toBe(1)
    })

    it('updates multiple fields simultaneously', async () => {
      const result = await service.update(2, {
        account_name: 'Updated Revenue',
        account_subtype: 'FEE_REVENUE',
        description: 'Fee income',
        normal_balance: 'CREDIT',
      }, 1)
      expect(result.success).toBe(true)
      expect(result.data!.account_name).toBe('Updated Revenue')
    })

    it('allows system account update if account_code unchanged', async () => {
      const result = await service.update(1, { account_code: '1000', description: 'Same code OK' }, 1)
      expect(result.success).toBe(true)
    })
  })

  /* ============================================================== */
  /*  create – edge cases                                           */
  /* ============================================================== */
  describe('create – additional branches', () => {
    it('creates with is_active = false', async () => {
      const result = await service.create({ ...VALID_ACCOUNT, account_code: '2001', is_active: false }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT is_active FROM gl_account WHERE account_code = ?').get('2001') as { is_active: number }
      expect(row.is_active).toBe(0)
    })

    it('creates system account', async () => {
      const result = await service.create({
        ...VALID_ACCOUNT, account_code: '2002', is_system_account: true, requires_subsidiary: true,
      }, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT is_system_account, requires_subsidiary FROM gl_account WHERE account_code=?').get('2002') as { is_system_account: number; requires_subsidiary: number }
      expect(row.is_system_account).toBe(1)
      expect(row.requires_subsidiary).toBe(1)
    })

    it('creates with optional subtype and parent id', async () => {
      const result = await service.create({
        ...VALID_ACCOUNT, account_code: '2010', account_subtype: 'CURRENT', parent_account_id: 1, description: 'Sub-account',
      }, 1)
      expect(result.success).toBe(true)
      expect(result.data!.account_subtype).toBe('CURRENT')
    })
  })

  /* ============================================================== */
  /*  getAll – error handling                                       */
  /* ============================================================== */
  describe('getAll – error branch', () => {
    it('returns error result when DB query fails', async () => {
      db.close()
      const result = await service.getAll()
      expect(result.success).toBe(false)
      expect(result.data).toEqual([])
      expect(result.message).toBeDefined()
      // Re-open for afterEach
      db = new Database(':memory:')
      testDb = db
      createSchema(db)
    })
  })

  /* ============================================================== */
  /*  getById – error handling                                      */
  /* ============================================================== */
  describe('getById – error branch', () => {
    it('returns error when DB throws', async () => {
      db.close()
      const result = await service.getById(1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      db = new Database(':memory:')
      testDb = db
      createSchema(db)
    })
  })

  /* ============================================================== */
  /*  delete – error handling                                       */
  /* ============================================================== */
  describe('delete – error branch', () => {
    it('returns error when DB throws', async () => {
      db.close()
      const result = await service.delete(1, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      db = new Database(':memory:')
      testDb = db
      createSchema(db)
    })
  })

  /* ============================================================== */
  /*  update – error handling                                       */
  /* ============================================================== */
  describe('update – error branch', () => {
    it('returns error when DB throws', async () => {
      db.close()
      const result = await service.update(2, { account_name: 'fail' }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      db = new Database(':memory:')
      testDb = db
      createSchema(db)
    })
  })

  /* ============================================================== */
  /*  create – error handling                                       */
  /* ============================================================== */
  describe('create – error branch', () => {
    it('returns error when DB throws', async () => {
      db.close()
      const result = await service.create(VALID_ACCOUNT, 1)
      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
      db = new Database(':memory:')
      testDb = db
      createSchema(db)
    })
  })

  /* ============================================================== */
  /*  getAll – combined filters                                     */
  /* ============================================================== */
  describe('getAll – combined filters', () => {
    it('filters by both type and isActive', async () => {
      const result = await service.getAll({ type: 'EQUITY', isActive: false })
      expect(result.success).toBe(true)
      expect(result.data.length).toBe(1)
      expect(result.data[0].account_code).toBe('9999')
    })

    it('returns empty when no match', async () => {
      const result = await service.getAll({ type: 'EQUITY', isActive: true })
      expect(result.success).toBe(true)
      expect(result.data.length).toBe(0)
    })
  })

  /* ============================================================== */
  /*  create – getById returns undefined after insert (L110)        */
  /* ============================================================== */
  describe('create – getById undefined after insert', () => {
    it('returns ACCOUNT_NOT_FOUND when getById returns no data after create', async () => {
      const spy = vi.spyOn(service, 'getById').mockResolvedValueOnce({ success: true, data: undefined as any })
      const result = await service.create({
        account_code: '6000',
        account_name: 'Phantom',
        account_type: 'EXPENSE' as any,
        normal_balance: 'DEBIT' as any,
      } as GLAccountData, 1)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
      spy.mockRestore()
    })
  })

  /* ============================================================== */
  /*  update – getById returns undefined after update (L145)        */
  /* ============================================================== */
  describe('update – getById undefined after update', () => {
    it('returns ACCOUNT_NOT_FOUND when getById returns no data after update', async () => {
      // First call to getById in update finds the account (via findAccountById, not spied)
      // Second call after SQL UPDATE uses getById → mock it
      const spy = vi.spyOn(service, 'getById').mockResolvedValueOnce({ success: true, data: undefined as any })
      const result = await service.update(2, { account_name: 'Updated Revenue' }, 1)
      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
      spy.mockRestore()
    })
  })

  /* ============================================================== */
  /*  buildUpdatePayload – requires_subsidiary false branch (L208)  */
  /* ============================================================== */
  describe('update – requires_subsidiary false', () => {
    it('sets requires_subsidiary to 0 when passed as false', async () => {
      const result = await service.update(2, { requires_subsidiary: false } as any, 1)
      expect(result.success).toBe(true)
      const row = db.prepare('SELECT requires_subsidiary FROM gl_account WHERE id = 2').get() as { requires_subsidiary: number }
      expect(row.requires_subsidiary).toBe(0)
    })
  })
})
