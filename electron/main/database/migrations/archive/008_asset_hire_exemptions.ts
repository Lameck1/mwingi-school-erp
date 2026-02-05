import Database from 'better-sqlite3'

export function migrate_008_asset_hire_exemptions(db: Database.Database): void {
    // ================================================================
    // ASSET HIRE SYSTEM TABLES
    // ================================================================

    // Clients who hire school assets
    db.exec(`
        CREATE TABLE IF NOT EXISTS hire_client (
            id INTEGER PRIMARY KEY,
            client_name TEXT NOT NULL,
            contact_phone TEXT,
            contact_email TEXT,
            organization TEXT,
            address TEXT,
            notes TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // Assets available for hire (bus, hall, equipment, etc.)
    db.exec(`
        CREATE TABLE IF NOT EXISTS hire_asset (
            id INTEGER PRIMARY KEY,
            asset_name TEXT NOT NULL,
            asset_type TEXT NOT NULL CHECK (asset_type IN ('VEHICLE', 'FACILITY', 'EQUIPMENT', 'OTHER')),
            registration_number TEXT,
            description TEXT,
            default_rate REAL,
            rate_type TEXT CHECK (rate_type IN ('PER_DAY', 'PER_KM', 'PER_HOUR', 'FIXED')),
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // Bookings/Hires
    db.exec(`
        CREATE TABLE IF NOT EXISTS hire_booking (
            id INTEGER PRIMARY KEY,
            booking_number TEXT UNIQUE NOT NULL,
            asset_id INTEGER NOT NULL REFERENCES hire_asset(id),
            client_id INTEGER NOT NULL REFERENCES hire_client(id),
            hire_date DATE NOT NULL,
            return_date DATE,
            hire_start_time TEXT,
            hire_end_time TEXT,
            purpose TEXT,
            destination TEXT,
            distance_km REAL,
            hours REAL,
            total_amount REAL NOT NULL,
            amount_paid REAL DEFAULT 0,
            status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
            notes TEXT,
            recorded_by_user_id INTEGER REFERENCES user(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // Payments for bookings (allows partial payments with receipts)
    db.exec(`
        CREATE TABLE IF NOT EXISTS hire_payment (
            id INTEGER PRIMARY KEY,
            booking_id INTEGER NOT NULL REFERENCES hire_booking(id),
            receipt_number TEXT UNIQUE NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT NOT NULL,
            payment_reference TEXT,
            payment_date DATE NOT NULL,
            notes TEXT,
            is_voided INTEGER DEFAULT 0,
            void_reason TEXT,
            recorded_by_user_id INTEGER REFERENCES user(id),
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // ================================================================
    // FEE EXEMPTION SYSTEM TABLES
    // ================================================================

    // Fee exemptions granted to students
    db.exec(`
        CREATE TABLE IF NOT EXISTS fee_exemption (
            id INTEGER PRIMARY KEY,
            student_id INTEGER NOT NULL REFERENCES student(id),
            academic_year_id INTEGER NOT NULL REFERENCES academic_year(id),
            term_id INTEGER REFERENCES term(id),
            fee_category_id INTEGER REFERENCES fee_category(id),
            exemption_type TEXT NOT NULL CHECK (exemption_type IN ('FULL', 'PARTIAL')),
            exemption_percentage REAL NOT NULL CHECK (exemption_percentage > 0 AND exemption_percentage <= 100),
            exemption_reason TEXT NOT NULL,
            supporting_document TEXT,
            notes TEXT,
            approved_by_user_id INTEGER REFERENCES user(id),
            approved_at DATETIME,
            status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVOKED')),
            revoked_by_user_id INTEGER REFERENCES user(id),
            revoked_at DATETIME,
            revoke_reason TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `)

    // Track exemption application on invoice items
    db.exec(`
        ALTER TABLE invoice_item ADD COLUMN exemption_id INTEGER REFERENCES fee_exemption(id)
    `)
    db.exec(`
        ALTER TABLE invoice_item ADD COLUMN original_amount REAL
    `)
    db.exec(`
        ALTER TABLE invoice_item ADD COLUMN exemption_amount REAL DEFAULT 0
    `)

    // ================================================================
    // SEED DEFAULT ASSETS
    // ================================================================

    // Add the school bus as default asset
    db.exec(`
        INSERT OR IGNORE INTO hire_asset (id, asset_name, asset_type, description, default_rate, rate_type, is_active)
        VALUES (1, 'School Bus', 'VEHICLE', 'Main school bus for hire', 50, 'PER_KM', 1)
    `)

    // ================================================================
    // INDEXES FOR PERFORMANCE
    // ================================================================

    db.exec(`CREATE INDEX IF NOT EXISTS idx_hire_booking_date ON hire_booking(hire_date)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hire_booking_status ON hire_booking(status)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hire_booking_client ON hire_booking(client_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_hire_booking_asset ON hire_booking(asset_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fee_exemption_student ON fee_exemption(student_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fee_exemption_year_term ON fee_exemption(academic_year_id, term_id)`)
    db.exec(`CREATE INDEX IF NOT EXISTS idx_fee_exemption_status ON fee_exemption(status)`)
}
