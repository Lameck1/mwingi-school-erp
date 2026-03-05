import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let db: Database.Database

vi.mock('../../../database', () => ({
  getDatabase: () => db,
}))

import { HireService } from '../HireService'

describe('HireService status transitions', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT NOT NULL UNIQUE,
      description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99,
      gl_account_id INTEGER
    );
    CREATE TABLE IF NOT EXISTS invoice_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT, invoice_id INTEGER NOT NULL,
      fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS receipt (
      id INTEGER PRIMARY KEY AUTOINCREMENT, receipt_number TEXT NOT NULL UNIQUE,
      transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL,
      student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT,
      payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0,
      created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
          CREATE TABLE IF NOT EXISTS gl_account (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_code TEXT NOT NULL UNIQUE,
            account_name TEXT NOT NULL,
            account_type TEXT NOT NULL,
            normal_balance TEXT NOT NULL,
            is_active BOOLEAN DEFAULT 1
          );
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1100', 'Accounts Receivable', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('2020', 'Student Credit Balance', 'LIABILITY', 'CREDIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1020', 'Bank', 'ASSET', 'DEBIT');
          INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4010', 'Tuition Revenue', 'REVENUE', 'CREDIT');
          
          CREATE TABLE IF NOT EXISTS journal_entry (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_ref TEXT NOT NULL UNIQUE,
            entry_date DATE NOT NULL,
            entry_type TEXT NOT NULL,
            description TEXT NOT NULL,
            student_id INTEGER,
            staff_id INTEGER,
            term_id INTEGER,
            is_posted BOOLEAN DEFAULT 0,
            posted_by_user_id INTEGER,
            posted_at DATETIME,
            is_voided BOOLEAN DEFAULT 0,
            voided_reason TEXT,
            voided_by_user_id INTEGER,
            voided_at DATETIME,
            requires_approval BOOLEAN DEFAULT 0,
            approval_status TEXT DEFAULT 'PENDING',
            approved_by_user_id INTEGER,
            approved_at DATETIME,
            created_by_user_id INTEGER NOT NULL,
            source_ledger_txn_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
          CREATE TABLE IF NOT EXISTS journal_entry_line (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_entry_id INTEGER NOT NULL,
            line_number INTEGER NOT NULL,
            gl_account_id INTEGER NOT NULL,
            debit_amount INTEGER DEFAULT 0,
            credit_amount INTEGER DEFAULT 0,
            description TEXT
          );
          CREATE TABLE IF NOT EXISTS approval_rule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_name TEXT NOT NULL UNIQUE,
            description TEXT,
            transaction_type TEXT NOT NULL,
            min_amount INTEGER,
            max_amount INTEGER,
            days_since_transaction INTEGER,
            required_role_id INTEGER,
            is_active BOOLEAN DEFAULT 1,
            created_by_user_id INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );

      CREATE TABLE hire_asset (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asset_name TEXT
      );
      CREATE TABLE hire_client (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_name TEXT
      );
      CREATE TABLE hire_booking (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_number TEXT UNIQUE NOT NULL,
        asset_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        hire_date TEXT NOT NULL,
        total_amount INTEGER NOT NULL,
        amount_paid INTEGER DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'PENDING',
        updated_at TEXT
      );
      CREATE TABLE hire_payment (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_id INTEGER NOT NULL,
        receipt_number TEXT UNIQUE NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT NOT NULL,
        payment_reference TEXT,
        payment_date TEXT NOT NULL,
        notes TEXT,
        is_voided INTEGER DEFAULT 0,
        recorded_by_user_id INTEGER
      );
      CREATE TABLE transaction_category (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        category_name TEXT
      );
      CREATE TABLE ledger_transaction (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_ref TEXT NOT NULL,
        amount INTEGER NOT NULL,
        payment_method TEXT,
        payment_reference TEXT,
        transaction_date TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        debit_credit TEXT NOT NULL,
        description TEXT,
        recorded_by_user_id INTEGER
      );
    `)

    db.prepare(`INSERT INTO hire_asset (id, asset_name) VALUES (1, 'School Bus')`).run()
    db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Jane Doe')`).run()
    db.prepare(`INSERT INTO transaction_category (id, category_name) VALUES (1, 'Other Income')`).run()
  })

  afterEach(() => {
    db.close()
  })

  it('rejects invalid status transition from COMPLETED to PENDING', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (10, 'HB-10', 1, 1, '2026-02-14', 10000, 10000, 'COMPLETED')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(10, 'PENDING')

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('Invalid status transition')
  })

  it('prevents marking booking as COMPLETED when outstanding balance exists', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (11, 'HB-11', 1, 1, '2026-02-14', 12000, 2000, 'IN_PROGRESS')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(11, 'COMPLETED')

    expect(result.success).toBe(false)
    expect(result.errors?.[0]).toContain('before full payment')
  })

  it('allows valid transition from PENDING to CONFIRMED', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (12, 'HB-12', 1, 1, '2026-02-14', 12000, 0, 'PENDING')
    `).run()

    const service = new HireService()
    const result = service.updateBookingStatus(12, 'CONFIRMED')

    expect(result.success).toBe(true)

    const updated = db.prepare(`SELECT status FROM hire_booking WHERE id = 12`).get() as { status: string }
    expect(updated.status).toBe('CONFIRMED')
  })

  it('clamps pending hire stats to zero for overpaid bookings', () => {
    db.prepare(`
      INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status)
      VALUES (13, 'HB-13', 1, 1, '2026-02-14', 10000, 15000, 'COMPLETED')
    `).run()

    const service = new HireService()
    const stats = service.getHireStats()

    expect(stats.pendingAmount).toBe(0)
  })
})

// ======= Expanded coverage: CRUD operations =======
describe('HireService CRUD operations', () => {
  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
    CREATE TABLE IF NOT EXISTS fee_category (id INTEGER PRIMARY KEY, category_name TEXT NOT NULL UNIQUE, description TEXT, is_active BOOLEAN DEFAULT 1, priority INTEGER DEFAULT 99, gl_account_id INTEGER);
    CREATE TABLE IF NOT EXISTS invoice_item (id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL, fee_category_id INTEGER NOT NULL, description TEXT NOT NULL, amount INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS receipt (id INTEGER PRIMARY KEY, receipt_number TEXT NOT NULL UNIQUE, transaction_id INTEGER NOT NULL UNIQUE, receipt_date DATE NOT NULL, student_id INTEGER NOT NULL, amount INTEGER NOT NULL, amount_in_words TEXT, payment_method TEXT NOT NULL, payment_reference TEXT, printed_count INTEGER DEFAULT 0, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS gl_account (id INTEGER PRIMARY KEY, account_code TEXT NOT NULL UNIQUE, account_name TEXT NOT NULL, account_type TEXT NOT NULL, normal_balance TEXT NOT NULL, is_active BOOLEAN DEFAULT 1);
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('1010', 'Cash', 'ASSET', 'DEBIT');
    INSERT INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4200', 'Hire Revenue', 'REVENUE', 'CREDIT');
    CREATE TABLE IF NOT EXISTS journal_entry (id INTEGER PRIMARY KEY, entry_ref TEXT NOT NULL UNIQUE, entry_date DATE NOT NULL, entry_type TEXT NOT NULL, description TEXT NOT NULL, student_id INTEGER, staff_id INTEGER, term_id INTEGER, is_posted BOOLEAN DEFAULT 0, posted_by_user_id INTEGER, posted_at DATETIME, is_voided BOOLEAN DEFAULT 0, voided_reason TEXT, voided_by_user_id INTEGER, voided_at DATETIME, requires_approval BOOLEAN DEFAULT 0, approval_status TEXT DEFAULT 'PENDING', approved_by_user_id INTEGER, approved_at DATETIME, created_by_user_id INTEGER NOT NULL, source_ledger_txn_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS journal_entry_line (id INTEGER PRIMARY KEY, journal_entry_id INTEGER NOT NULL, line_number INTEGER NOT NULL, gl_account_id INTEGER NOT NULL, debit_amount INTEGER DEFAULT 0, credit_amount INTEGER DEFAULT 0, description TEXT);
    CREATE TABLE IF NOT EXISTS approval_rule (id INTEGER PRIMARY KEY, rule_name TEXT NOT NULL UNIQUE, description TEXT, transaction_type TEXT NOT NULL, min_amount INTEGER, max_amount INTEGER, days_since_transaction INTEGER, required_role_id INTEGER, is_active BOOLEAN DEFAULT 1, created_by_user_id INTEGER NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE hire_asset (id INTEGER PRIMARY KEY AUTOINCREMENT, asset_name TEXT, asset_type TEXT, registration_number TEXT, description TEXT, default_rate INTEGER, rate_type TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
    CREATE TABLE hire_client (id INTEGER PRIMARY KEY AUTOINCREMENT, client_name TEXT, contact_phone TEXT, contact_email TEXT, organization TEXT, address TEXT, notes TEXT, is_active INTEGER DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
    CREATE TABLE hire_booking (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_number TEXT UNIQUE NOT NULL, asset_id INTEGER NOT NULL, client_id INTEGER NOT NULL, hire_date TEXT NOT NULL, return_date TEXT, hire_start_time TEXT, hire_end_time TEXT, purpose TEXT, destination TEXT, distance_km INTEGER, hours INTEGER, total_amount INTEGER NOT NULL, amount_paid INTEGER DEFAULT 0, status TEXT NOT NULL DEFAULT 'PENDING', notes TEXT, recorded_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at TEXT);
    CREATE TABLE hire_payment (id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER NOT NULL, receipt_number TEXT UNIQUE NOT NULL, amount INTEGER NOT NULL, payment_method TEXT NOT NULL, payment_reference TEXT, payment_date TEXT NOT NULL, notes TEXT, is_voided INTEGER DEFAULT 0, recorded_by_user_id INTEGER, created_at DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE transaction_category (id INTEGER PRIMARY KEY AUTOINCREMENT, category_name TEXT);
    CREATE TABLE ledger_transaction (id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_ref TEXT NOT NULL, amount INTEGER NOT NULL, payment_method TEXT, payment_reference TEXT, transaction_date TEXT NOT NULL, transaction_type TEXT NOT NULL, category_id INTEGER NOT NULL, debit_credit TEXT NOT NULL, description TEXT, recorded_by_user_id INTEGER);
    INSERT INTO transaction_category (id, category_name) VALUES (1, 'Other Income');
    `)
  })

  afterEach(() => { db.close() })

  // ======= Client CRUD =======
  describe('Client operations', () => {
    it('creates a client', () => {
      const svc = new HireService()
      const result = svc.createClient({ client_name: 'Test Corp', organization: 'Test Org' })
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('rejects client without name', () => {
      const svc = new HireService()
      const result = svc.createClient({})
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('getClients returns all clients', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'Client A' })
      svc.createClient({ client_name: 'Client B' })
      const clients = svc.getClients()
      expect(clients.length).toBe(2)
    })

    it('getClients filters by search on client_name', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'Alpha Corp' })
      svc.createClient({ client_name: 'Beta Inc' })
      const clients = svc.getClients({ search: 'Alpha' })
      expect(clients.length).toBe(1)
      expect(clients[0].client_name).toBe('Alpha Corp')
    })

    it('getClients filters by search on organization', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'John', organization: 'Acme Ltd' })
      svc.createClient({ client_name: 'Jane', organization: 'Beta Inc' })
      const clients = svc.getClients({ search: 'Acme' })
      expect(clients.length).toBe(1)
      expect(clients[0].organization).toBe('Acme Ltd')
    })

    it('getClients filters by isActive', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'Active Client' })
      const inactive = svc.createClient({ client_name: 'Inactive Client' })
      svc.updateClient(inactive.id!, { is_active: 0 })
      const activeClients = svc.getClients({ isActive: true })
      expect(activeClients.length).toBe(1)
      expect(activeClients[0].client_name).toBe('Active Client')
    })

    // ── branch coverage: isActive false pushes 0 (L99 alternate) ──
    it('getClients filters by isActive=false', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'Active Client' })
      const inactive = svc.createClient({ client_name: 'Inactive Client' })
      svc.updateClient(inactive.id!, { is_active: 0 })
      const inactiveClients = svc.getClients({ isActive: false })
      expect(inactiveClients.length).toBe(1)
      expect(inactiveClients[0].client_name).toBe('Inactive Client')
    })

    it('getClientById returns matching client', () => {
      const svc = new HireService()
      const created = svc.createClient({ client_name: 'Lookup Client' })
      const client = svc.getClientById(created.id!)
      expect(client).toBeDefined()
      expect(client!.client_name).toBe('Lookup Client')
    })

    it('getClientById returns undefined for non-existent id', () => {
      const svc = new HireService()
      const client = svc.getClientById(999)
      expect(client).toBeUndefined()
    })

    it('updateClient modifies client data', () => {
      const svc = new HireService()
      const created = svc.createClient({ client_name: 'Old Name' })
      const result = svc.updateClient(created.id!, { client_name: 'New Name', organization: 'New Org' })
      expect(result.success).toBe(true)
      const updated = svc.getClientById(created.id!)
      expect(updated!.client_name).toBe('New Name')
      expect(updated!.organization).toBe('New Org')
    })
  })

  // ======= Asset CRUD =======
  describe('Asset operations', () => {
    it('creates an asset', () => {
      const svc = new HireService()
      const result = svc.createAsset({ asset_name: 'Projector', asset_type: 'EQUIPMENT' })
      expect(result.success).toBe(true)
      expect(result.id).toBeGreaterThan(0)
    })

    it('rejects asset without name', () => {
      const svc = new HireService()
      const result = svc.createAsset({ asset_type: 'EQUIPMENT' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Asset name and type are required')
    })

    it('rejects asset without type', () => {
      const svc = new HireService()
      const result = svc.createAsset({ asset_name: 'Projector' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Asset name and type are required')
    })

    it('getAssets returns all assets', () => {
      const svc = new HireService()
      svc.createAsset({ asset_name: 'Projector', asset_type: 'EQUIPMENT' })
      svc.createAsset({ asset_name: 'Speaker', asset_type: 'EQUIPMENT' })
      const assets = svc.getAssets()
      expect(assets.length).toBe(2)
    })

    it('getAssets filters by type', () => {
      const svc = new HireService()
      svc.createAsset({ asset_name: 'Projector', asset_type: 'EQUIPMENT' })
      svc.createAsset({ asset_name: 'School Bus', asset_type: 'VEHICLE' })
      const vehicles = svc.getAssets({ type: 'VEHICLE' })
      expect(vehicles.length).toBe(1)
      expect(vehicles[0].asset_name).toBe('School Bus')
    })

    it('getAssets filters by isActive', () => {
      const svc = new HireService()
      svc.createAsset({ asset_name: 'Active', asset_type: 'EQUIPMENT' })
      const deactivated = svc.createAsset({ asset_name: 'Inactive', asset_type: 'OTHER' })
      svc.updateAsset(deactivated.id!, { is_active: 0 })
      const active = svc.getAssets({ isActive: true })
      expect(active.length).toBe(1)
      expect(active[0].asset_name).toBe('Active')
    })

    it('getAssetById returns matching asset', () => {
      const svc = new HireService()
      const created = svc.createAsset({ asset_name: 'Tent', asset_type: 'OTHER' })
      const asset = svc.getAssetById(created.id!)
      expect(asset).toBeDefined()
      expect(asset!.asset_name).toBe('Tent')
    })

    it('getAssetById returns undefined for non-existent id', () => {
      const svc = new HireService()
      expect(svc.getAssetById(999)).toBeUndefined()
    })

    it('updateAsset modifies asset data', () => {
      const svc = new HireService()
      const created = svc.createAsset({ asset_name: 'Old Name', asset_type: 'FACILITY' })
      const result = svc.updateAsset(created.id!, { asset_name: 'New Asset Name', asset_type: 'VEHICLE' })
      expect(result.success).toBe(true)
      const updated = svc.getAssetById(created.id!)
      expect(updated!.asset_name).toBe('New Asset Name')
    })
  })

  // ======= Booking operations =======
  describe('Booking operations', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('creates a booking with unique booking number', () => {
      const svc = new HireService()
      const result = svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      expect(result.success).toBe(true)
      expect(result.booking_number).toMatch(/^HB-/)
      expect(result.id).toBeGreaterThan(0)
    })

    it('rejects booking without required fields', () => {
      const svc = new HireService()
      const result = svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01' }, 7) // missing total_amount
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('required')
    })

    it('rejects booking when asset is not available', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', return_date: '2026-03-10', total_amount: 5000 }, 7)
      const result = svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-05', return_date: '2026-03-08', total_amount: 3000 }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not available')
    })

    it('getBookings returns all bookings with joined fields', () => {
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-A', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-B', 1, 1, '2026-04-01', 8000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const bookings = svc.getBookings()
      expect(bookings.length).toBe(2)
      expect(bookings[0].asset_name).toBe('Bus')
      expect(bookings[0].client_name).toBe('Church X')
    })

    it('getBookingById returns correct booking with balance', () => {
      const svc = new HireService()
      const created = svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      const booking = svc.getBookingById(created.id!)
      expect(booking).toBeDefined()
      expect(booking!.total_amount).toBe(5000)
      expect(booking!.balance).toBe(5000) // total - 0 paid
    })

    it('getBookingById returns undefined for non-existent id', () => {
      const svc = new HireService()
      expect(svc.getBookingById(999)).toBeUndefined()
    })

    it('checkAssetAvailability returns true when no overlapping bookings', () => {
      const svc = new HireService()
      const available = svc.checkAssetAvailability(1, '2026-05-01', '2026-05-10')
      expect(available).toBe(true)
    })

    it('checkAssetAvailability returns false when overlapping booking exists', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-05-01', return_date: '2026-05-10', total_amount: 5000 }, 7)
      const available = svc.checkAssetAvailability(1, '2026-05-05', '2026-05-08')
      expect(available).toBe(false)
    })

    it('getBookings filters by status', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      const bookings = svc.getBookings({ status: 'CONFIRMED' })
      expect(bookings.length).toBe(0)
    })

    it('getBookings filters by assetId', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (2, 'Van', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-C', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-D', 2, 1, '2026-04-01', 3000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const bookings = svc.getBookings({ assetId: 2 })
      expect(bookings.length).toBe(1)
    })

    it('getBookings filters by clientId', () => {
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (2, 'School Y')`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-E', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-F', 1, 2, '2026-04-01', 3000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const bookings = svc.getBookings({ clientId: 2 })
      expect(bookings.length).toBe(1)
    })

    it('getBookings filters by date range', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-01-15', total_amount: 5000 }, 7)
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-06-15', total_amount: 3000 }, 7)
      const bookings = svc.getBookings({ fromDate: '2026-01-01', toDate: '2026-03-31' })
      expect(bookings.length).toBe(1)
    })

    it('updateBookingStatus rejects invalid status string', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      const result = svc.updateBookingStatus(1, 'BOGUS')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Invalid booking status')
    })

    it('updateBookingStatus returns success(true) for same status (no-op)', () => {
      const svc = new HireService()
      svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      const result = svc.updateBookingStatus(1, 'PENDING')
      expect(result.success).toBe(true)
    })

    it('updateBookingStatus returns error for non-existent booking', () => {
      const svc = new HireService()
      const result = svc.updateBookingStatus(999, 'CONFIRMED')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Booking not found')
    })
  })

  // ======= Payment operations =======
  describe('Payment operations', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status) VALUES (1, 'HB-1', 1, 1, '2026-03-01', 10000, 0, 'CONFIRMED')`).run()
    })

    it('records a payment for a booking', () => {
      const svc = new HireService()
      const result = svc.recordPayment(1, { amount: 5000, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      expect(result.success).toBe(true)
      expect(result.receipt_number).toMatch(/^HR-/)
    })

    it('rejects payment with missing required fields', () => {
      const svc = new HireService()
      const result = svc.recordPayment(1, { amount: 5000, payment_method: 'CASH' } as any, 7) // missing payment_date
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('required')
    })

    it('rejects payment exceeding outstanding balance', () => {
      const svc = new HireService()
      const result = svc.recordPayment(1, { amount: 99999, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('exceeds outstanding balance')
    })

    it('rejects payment for non-existent booking', () => {
      const svc = new HireService()
      const result = svc.recordPayment(999, { amount: 100, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Booking not found')
    })

    it('updates amount_paid on booking after payment', () => {
      const svc = new HireService()
      svc.recordPayment(1, { amount: 3000, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      const booking = svc.getBookingById(1)
      expect(booking!.amount_paid).toBe(3000)
    })

    it('getPaymentsByBooking returns booking payments', () => {
      const svc = new HireService()
      svc.recordPayment(1, { amount: 3000, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      const payments = svc.getPaymentsByBooking(1)
      expect(payments.length).toBe(1)
      expect(payments[0].amount).toBe(3000)
    })

    it('getPaymentsByBooking excludes voided payments', () => {
      const svc = new HireService()
      svc.recordPayment(1, { amount: 3000, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      // Manually void the payment
      db.prepare('UPDATE hire_payment SET is_voided = 1 WHERE booking_id = 1').run()
      const payments = svc.getPaymentsByBooking(1)
      expect(payments.length).toBe(0)
    })

    it('getHireStats aggregates booking data', () => {
      const svc = new HireService()
      const stats = svc.getHireStats()
      expect(stats.totalBookings).toBeGreaterThanOrEqual(1)
      expect(stats.pendingAmount).toBeGreaterThanOrEqual(0)
      expect(typeof stats.totalIncome).toBe('number')
      expect(typeof stats.thisMonth).toBe('number')
    })

    it('auto-completes booking when full payment is received and status allows', () => {
      // Booking is CONFIRMED with total_amount=10000, amount_paid=0
      const svc = new HireService()
      const result = svc.recordPayment(1, { amount: 10000, payment_method: 'CASH', payment_date: '2026-03-02' }, 7)
      expect(result.success).toBe(true)
      const booking = svc.getBookingById(1)
      expect(booking!.amount_paid).toBe(10000)
      // Status should auto-transition to COMPLETED since full amount paid
      expect(booking!.status).toBe('COMPLETED')
    })
  })

  // ======= Error handling branches =======
  describe('Error handling in create/update operations', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('createClient returns error on DB constraint violation', () => {
      const svc = new HireService()
      svc.createClient({ client_name: 'Dup' })
      // Second insert with same name shouldn't crash (no unique on client_name), but let's test error branch
      // Force an error by closing DB
      db.close()
      const result = svc.createClient({ client_name: 'Test' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('updateClient returns error on DB failure', () => {
      const svc = new HireService()
      db.close()
      const result = svc.updateClient(1, { client_name: 'New Name' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('createAsset returns error on DB failure', () => {
      const svc = new HireService()
      db.close()
      const result = svc.createAsset({ asset_name: 'Tent', asset_type: 'EQUIPMENT' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('updateAsset returns error on DB failure', () => {
      const svc = new HireService()
      db.close()
      const result = svc.updateAsset(1, { asset_name: 'Updated' })
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('createBooking returns error on DB failure', () => {
      const svc = new HireService()
      // Use a trigger to force an error during INSERT (after checkAssetAvailability passes)
      db.exec(`CREATE TRIGGER fail_hire_booking BEFORE INSERT ON hire_booking BEGIN SELECT RAISE(FAIL, 'forced error'); END`)
      const result = svc.createBooking({ asset_id: 1, client_id: 1, hire_date: '2026-03-01', total_amount: 5000 }, 7)
      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
    })
  })

  // ======= Asset availability without return date =======
  describe('checkAssetAvailability', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('checks availability without return date', () => {
      const svc = new HireService()
      const available = svc.checkAssetAvailability(1, '2026-03-01')
      expect(available).toBe(true)
    })

    it('detects conflict without return date when existing booking overlaps', () => {
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES ('HB-1', 1, 1, '2026-03-01', 5000, 0, 'CONFIRMED', 7)`).run()
      const svc = new HireService()
      const available = svc.checkAssetAvailability(1, '2026-03-01')
      expect(available).toBe(false)
    })
  })

  // ======= getBookings with combined filters =======
  describe('getBookings – multi-filter', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (2, 'Van', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('getBookings with fromDate only returns future bookings', () => {
      const svc = new HireService()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, return_date, total_amount, amount_paid, status) VALUES ('HB-A1', 1, 1, '2026-01-15', '2026-01-15', 5000, 0, 'PENDING')`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, return_date, total_amount, amount_paid, status) VALUES ('HB-A2', 2, 1, '2026-06-15', '2026-06-15', 3000, 0, 'PENDING')`).run()
      const bookings = svc.getBookings({ fromDate: '2026-06-01' })
      expect(bookings.length).toBe(1)
    })

    it('getBookings with toDate only returns past bookings', () => {
      const svc = new HireService()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, return_date, total_amount, amount_paid, status) VALUES ('HB-B1', 1, 1, '2026-01-15', '2026-01-15', 5000, 0, 'PENDING')`).run()
      db.prepare(`INSERT INTO hire_booking (booking_number, asset_id, client_id, hire_date, return_date, total_amount, amount_paid, status) VALUES ('HB-B2', 2, 1, '2026-06-15', '2026-06-15', 3000, 0, 'PENDING')`).run()
      const bookings = svc.getBookings({ toDate: '2026-03-01' })
      expect(bookings.length).toBe(1)
    })
  })

  // ======= isValidBookingStatus and canTransitionStatus branch coverage =======
  describe('status validation and transitions', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('updateBookingStatus rejects invalid status string', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (10, 'HB-ST1', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(10, 'INVALID_STATUS')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Invalid booking status')
    })

    it('updateBookingStatus rejects invalid transition from COMPLETED', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (11, 'HB-ST2', 1, 1, '2026-03-01', 5000, 5000, 'COMPLETED', 7)`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(11, 'PENDING')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Invalid status transition')
    })

    it('updateBookingStatus rejects completing booking with outstanding balance', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (12, 'HB-ST3', 1, 1, '2026-03-01', 5000, 1000, 'IN_PROGRESS', 7)`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(12, 'COMPLETED')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Cannot mark booking as completed')
    })

    it('updateBookingStatus succeeds for valid transition PENDING → CONFIRMED', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (13, 'HB-ST4', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(13, 'CONFIRMED')
      expect(result.success).toBe(true)
    })

    it('updateBookingStatus returns success when status is already the same', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (14, 'HB-ST5', 1, 1, '2026-03-01', 5000, 0, 'PENDING', 7)`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(14, 'PENDING')
      expect(result.success).toBe(true)
    })

    it('updateBookingStatus returns error for non-existent booking', () => {
      const svc = new HireService()
      const result = svc.updateBookingStatus(9999, 'CONFIRMED')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Booking not found')
    })
  })

  // ======= recordPayment branch coverage =======
  describe('recordPayment validation branches', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (1, 'Bus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (1, 'Church X')`).run()
    })

    it('recordPayment rejects missing required fields', () => {
      const svc = new HireService()
      const result = svc.recordPayment(1, { amount: 1000 } as any, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('required')
    })

    it('recordPayment rejects payment exceeding balance', () => {
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (20, 'HB-PAY1', 1, 1, '2026-03-01', 5000, 4000, 'CONFIRMED', 7)`).run()
      const svc = new HireService()
      const result = svc.recordPayment(20, { amount: 2000, payment_method: 'CASH', payment_date: '2026-03-01' }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('exceeds outstanding balance')
    })

    it('recordPayment rejects payment for non-existent booking', () => {
      const svc = new HireService()
      const result = svc.recordPayment(9999, { amount: 1000, payment_method: 'CASH', payment_date: '2026-03-01' }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Booking not found')
    })
  })

  // ======= createBooking missing fields =======
  describe('createBooking validation', () => {
    it('createBooking rejects when required fields missing', () => {
      const svc = new HireService()
      const result = svc.createBooking({ asset_id: 1 } as any, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('required')
    })
  })

  // ======= getHireStats =======
  describe('getHireStats', () => {
    it('returns zero stats when no bookings exist', () => {
      const svc = new HireService()
      const stats = svc.getHireStats()
      expect(stats.totalBookings).toBe(0)
      expect(stats.totalIncome).toBe(0)
    })
  })

  // ======= createClient non-Error catch (L120 cond-expr) =======
  describe('createClient error handling', () => {
    it('returns fallback error message for non-Error exception', () => {
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO hire_client')) { return { run: () => { throw 42 } } as any } // NOSONAR
        return origPrepare(sql)
      })
      const svc = new HireService()
      const result = svc.createClient({ client_name: 'ErrClient' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Failed to create client')
      vi.restoreAllMocks()
    })
  })

  // ======= updateClient non-Error catch (L139 cond-expr) =======
  describe('updateClient error handling', () => {
    it('returns fallback error message for non-Error exception', () => {
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (50, 'UpdClient')`).run()
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE hire_client')) { return { run: () => { throw 'string error' } } as any } // NOSONAR
        return origPrepare(sql)
      })
      const svc = new HireService()
      const result = svc.updateClient(50, { client_name: 'New' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Failed to update client')
      vi.restoreAllMocks()
    })
  })

  // ======= createAsset non-Error catch (L175 cond-expr) =======
  describe('createAsset error handling', () => {
    it('returns fallback error for non-Error exception', () => {
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO hire_asset')) { return { run: () => { throw null } } as any } // NOSONAR
        return origPrepare(sql)
      })
      const svc = new HireService()
      const result = svc.createAsset({ asset_name: 'Fail', asset_type: 'VEHICLE' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Failed to create asset')
      vi.restoreAllMocks()
    })
  })

  // ======= updateAsset non-Error catch (L193 cond-expr) =======
  describe('updateAsset error handling', () => {
    it('returns fallback error for non-Error exception', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (50, 'UpdAsset', 'VEHICLE')`).run()
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE hire_asset')) { return { run: () => { throw undefined } } as any } // NOSONAR
        return origPrepare(sql)
      })
      const svc = new HireService()
      const result = svc.updateAsset(50, { asset_name: 'New' })
      expect(result.success).toBe(false)
      expect(result.errors![0]).toBe('Failed to update asset')
      vi.restoreAllMocks()
    })
  })

  // ======= createBooking unavailable asset (L284) =======
  describe('createBooking availability check', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (60, 'BusB', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (60, 'Church Y')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, return_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (60, 'HB-AVAIL', 60, 60, '2026-03-01', '2026-03-05', 5000, 0, 'CONFIRMED', 7)`).run()
    })

    it('rejects booking when asset is unavailable for the date range', () => {
      const svc = new HireService()
      const result = svc.createBooking({
        asset_id: 60, client_id: 60, hire_date: '2026-03-02',
        return_date: '2026-03-04', total_amount: 3000
      }, 7)
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('not available')
    })
  })

  // ======= updateBookingStatus invalid transition (L322 cond-expr) =======
  describe('updateBookingStatus transitions', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (70, 'BusC', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (70, 'Church Z')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (70, 'HB-TRANS', 70, 70, '2026-04-01', 5000, 0, 'PENDING', 7)`).run()
    })

    it('rejects invalid status value', () => {
      const svc = new HireService()
      const result = svc.updateBookingStatus(70, 'NONEXISTENT_STATUS')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('Invalid booking status')
    })

    it('returns success when status is already the target', () => {
      const svc = new HireService()
      const result = svc.updateBookingStatus(70, 'PENDING')
      expect(result.success).toBe(true)
    })

    it('rejects COMPLETED status when amount_paid < total_amount', () => {
      db.prepare(`UPDATE hire_booking SET status = 'CONFIRMED' WHERE id = 70`).run()
      const svc = new HireService()
      const result = svc.updateBookingStatus(70, 'COMPLETED')
      expect(result.success).toBe(false)
      expect(result.errors![0]).toContain('full payment')
    })
  })

  // ======= getAssets with filters (L154 type filter, isActive filter) =======
  describe('getAssets filters', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type, is_active) VALUES (80, 'Hall', 'FACILITY', 1)`).run()
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type, is_active) VALUES (81, 'OldBus', 'VEHICLE', 0)`).run()
    })

    it('filters by asset type', () => {
      const svc = new HireService()
      const results = svc.getAssets({ type: 'FACILITY' })
      expect(results.every(a => a.asset_type === 'FACILITY')).toBe(true)
    })

    it('filters by isActive', () => {
      const svc = new HireService()
      const results = svc.getAssets({ isActive: false })
      expect(results.every(a => a.is_active === 0)).toBe(true)
    })
  })

  // ======= getBookings with various filters =======
  describe('getBookings filters', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (90, 'FilterBus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (90, 'FilterClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (90, 'HB-FILT', 90, 90, '2026-05-15', 8000, 0, 'CONFIRMED', 7)`).run()
    })

    it('filters by status', () => {
      const svc = new HireService()
      const results = svc.getBookings({ status: 'CONFIRMED' })
      expect(results.length).toBeGreaterThan(0)
    })

    it('filters by assetId', () => {
      const svc = new HireService()
      const results = svc.getBookings({ assetId: 90 })
      expect(results.every(b => b.asset_id === 90)).toBe(true)
    })

    it('filters by clientId', () => {
      const svc = new HireService()
      const results = svc.getBookings({ clientId: 90 })
      expect(results.length).toBeGreaterThan(0)
    })

    it('filters by fromDate and toDate', () => {
      const svc = new HireService()
      const results = svc.getBookings({ fromDate: '2026-05-01', toDate: '2026-05-31' })
      expect(results.length).toBeGreaterThan(0)
    })
  })

  // ======= recordPayment non-Error catch (L410 cond-expr) =======
  describe('recordPayment error handling', () => {
    it('returns fallback error for non-Error exception', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (100, 'ErrBus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (100, 'ErrClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (100, 'HB-ERR', 100, 100, '2026-06-01', 10000, 0, 'CONFIRMED', 7)`).run()
      const _origTransaction = db.transaction
      vi.spyOn(db, 'transaction').mockImplementation(() => (() => { throw 'raw string error' }) as any) // NOSONAR
      const svc = new HireService()
      const result = svc.recordPayment(100, { amount: 5000, payment_method: 'CASH', payment_date: '2026-06-01' }, 7)
      expect(result.success).toBe(false)
      vi.restoreAllMocks()
    })
  })

  // ======= getClients with search filter =======
  describe('getClients filters', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (110, 'SearchableChurch')`).run()
    })

    it('filters clients by search term', () => {
      const svc = new HireService()
      const results = svc.getClients({ search: 'Searchable' })
      expect(results.length).toBeGreaterThan(0)
    })

    it('filters clients by isActive', () => {
      const svc = new HireService()
      const results = svc.getClients({ isActive: true })
      expect(results.every(c => c.is_active === 1)).toBe(true)
    })
  })

  /* ==================================================================
   *  Branch coverage: successful recordPayment auto-completes booking (L387)
   * ================================================================== */
  describe('recordPayment – success with auto-complete', () => {
    beforeEach(() => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (120, 'AutoBus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (120, 'AutoClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (120, 'HB-AUTO', 120, 120, '2026-07-01', 10000, 0, 'CONFIRMED', 7)`).run()
      // Add GL account for HIRE_REVENUE (4300)
      db.prepare(`INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4300', 'Hire Revenue', 'REVENUE', 'CREDIT')`).run()
    })

    it('records payment and auto-completes booking when fully paid', () => {
      const svc = new HireService()
      const result = svc.recordPayment(120, { amount: 10000, payment_method: 'CASH', payment_date: '2026-07-01' }, 7)
      expect(result.success).toBe(true)
      expect(result.receipt_number).toBeDefined()
      // Booking should be auto-completed
      const booking = db.prepare('SELECT status, amount_paid FROM hire_booking WHERE id = 120').get() as any
      expect(booking.amount_paid).toBe(10000)
      expect(booking.status).toBe('COMPLETED')
    })

    it('records partial payment without auto-completing booking', () => {
      const svc = new HireService()
      const result = svc.recordPayment(120, { amount: 5000, payment_method: 'CASH', payment_date: '2026-07-01' }, 7)
      expect(result.success).toBe(true)
      const booking = db.prepare('SELECT status, amount_paid FROM hire_booking WHERE id = 120').get() as any
      expect(booking.amount_paid).toBe(5000)
      expect(booking.status).toBe('CONFIRMED')
    })
  })

  /* ==================================================================
   *  Branch coverage: getPaymentsByBooking (L423)
   * ================================================================== */
  describe('getPaymentsByBooking', () => {
    it('returns empty array when no payments exist', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (130, 'NoPay', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (130, 'NoPayClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (130, 'HB-NP', 130, 130, '2026-08-01', 5000, 0, 'CONFIRMED', 7)`).run()
      const svc = new HireService()
      const payments = svc.getPaymentsByBooking(130)
      expect(payments).toEqual([])
    })
  })

  /* ==================================================================
   *  Branch coverage: updateBookingStatus concurrent race (L318)
   * ================================================================== */
  describe('updateBookingStatus – concurrent race condition', () => {
    it('returns race condition error when status changed between read and write', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (200, 'RaceBus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (200, 'RaceClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status) VALUES (200, 'HB-RACE', 200, 200, '2026-03-01', 5000, 0, 'PENDING')`).run()
      const svc = new HireService()
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE hire_booking') && sql.includes('SET status')) {
          return { run: () => ({ changes: 0, lastInsertRowid: 0 }) } as any
        }
        return origPrepare(sql)
      })
      const result = svc.updateBookingStatus(200, 'CONFIRMED')
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toContain('changed by another operation')
      vi.restoreAllMocks()
    })
  })

  /* ==================================================================
   *  Branch coverage: updateBookingStatus non-Error catch (L322)
   * ================================================================== */
  describe('updateBookingStatus – non-Error exception', () => {
    it('returns fallback error message for non-Error exception', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (210, 'ErrBus2', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (210, 'ErrClient2')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status) VALUES (210, 'HB-NEERR', 210, 210, '2026-03-01', 5000, 0, 'PENDING')`).run()
      const svc = new HireService()
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('UPDATE hire_booking') && sql.includes('SET status')) {
          throw 42 // NOSONAR
        }
        return origPrepare(sql)
      })
      const result = svc.updateBookingStatus(210, 'CONFIRMED')
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Failed to update status')
      vi.restoreAllMocks()
    })
  })

  /* ==================================================================
   *  Branch coverage: updateBookingStatus real Error catch (L322 true)
   * ================================================================== */
  describe('updateBookingStatus – real Error in UPDATE', () => {
    it('returns error message when UPDATE throws a real Error', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name, asset_type) VALUES (220, 'TrigBus', 'VEHICLE')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (220, 'TrigClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status) VALUES (220, 'HB-TRIG', 220, 220, '2026-03-01', 5000, 0, 'PENDING')`).run()
      db.exec("CREATE TRIGGER fail_hire_upd BEFORE UPDATE ON hire_booking BEGIN SELECT RAISE(FAIL, 'forced update error'); END")
      const svc = new HireService()
      const result = svc.updateBookingStatus(220, 'CONFIRMED')
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toContain('forced update error')
      db.exec('DROP TRIGGER IF EXISTS fail_hire_upd')
    })
  })

  /* ==================================================================
   *  Branch coverage: createBooking non-Error exception (L284)
   * ================================================================== */
  describe('createBooking – non-Error exception', () => {
    it('returns fallback message when createBooking catches non-Error', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name) VALUES (300, 'NonErrBus')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (300, 'NonErrClient')`).run()
      const svc = new HireService()
      const origPrepare = db.prepare.bind(db)
      vi.spyOn(db, 'prepare').mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO hire_booking')) { throw 'non-error-value' } // NOSONAR
        return origPrepare(sql)
      })
      const result = svc.createBooking({ asset_id: 300, client_id: 300, hire_date: '2026-03-01', total_amount: 5000 } as any, 7)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Failed to create booking')
      vi.restoreAllMocks()
    })
  })

  /* ==================================================================
   *  Branch coverage: recordPayment without transaction_category (L381)
   *  Exercises catId?.id || 1 when catId is undefined
   * ================================================================== */
  describe('recordPayment – missing transaction_category', () => {
    it('uses fallback category_id=1 when Other Income category is absent', () => {
      db.exec('DELETE FROM transaction_category')
      db.prepare(`INSERT INTO hire_asset (id, asset_name) VALUES (310, 'CatBus')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (310, 'CatClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (310, 'HB-CAT', 310, 310, '2026-07-01', 10000, 0, 'CONFIRMED', 7)`).run()
      db.prepare(`INSERT OR IGNORE INTO gl_account (account_code, account_name, account_type, normal_balance) VALUES ('4300', 'Hire Revenue', 'REVENUE', 'CREDIT')`).run()
      const svc = new HireService()
      const result = svc.recordPayment(310, { amount: 5000, payment_method: 'CASH', payment_date: '2026-07-01' }, 7)
      expect(result.success).toBe(true)
      const ledger = db.prepare('SELECT category_id FROM ledger_transaction WHERE description LIKE ?').get('%CatBus%') as any
      expect(ledger.category_id).toBe(1)
    })
  })

  /* ==================================================================
   *  Branch coverage: recordPayment non-Error exception (L410)
   * ================================================================== */
  describe('recordPayment – non-Error exception', () => {
    it('returns fallback error for non-Error exception in recordPayment', () => {
      db.prepare(`INSERT INTO hire_asset (id, asset_name) VALUES (320, 'PayErrBus')`).run()
      db.prepare(`INSERT INTO hire_client (id, client_name) VALUES (320, 'PayErrClient')`).run()
      db.prepare(`INSERT INTO hire_booking (id, booking_number, asset_id, client_id, hire_date, total_amount, amount_paid, status, recorded_by_user_id) VALUES (320, 'HB-PERR', 320, 320, '2026-07-01', 10000, 0, 'CONFIRMED', 7)`).run()
      const svc = new HireService()
      const _origTransaction = db.transaction.bind(db)
      vi.spyOn(db, 'transaction').mockImplementation(() => {
        return (() => { throw 42 }) as any // NOSONAR
      })
      const result = svc.recordPayment(320, { amount: 5000, payment_method: 'CASH', payment_date: '2026-07-01' }, 7)
      expect(result.success).toBe(false)
      expect(result.errors?.[0]).toBe('Failed to record payment')
      vi.restoreAllMocks()
    })
  })
})
