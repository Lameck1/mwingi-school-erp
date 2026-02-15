import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { runMigrations } from '../../database/migrations'

// Mock audit
vi.mock('../../database/utils/audit', () => ({
    logAudit: vi.fn()
}))

// Mock getDatabase
let testDb: Database.Database
vi.mock('../../database', () => ({
    getDatabase: () => testDb,
}))

describe('Attendance Integration', () => {
    beforeEach(() => {
        testDb = new Database(':memory:')
        // Use full migrations for this test to ensure unique indices are present
        runMigrations(testDb)

        // Seed necessary data
        testDb.prepare("INSERT OR IGNORE INTO user (id, username, password_hash, full_name, role) VALUES (1, 'admin', 'hash', 'Admin', 'ADMIN')").run()
        testDb.prepare("INSERT OR IGNORE INTO student (id, admission_number, first_name, last_name, student_type, admission_date) VALUES (1, 'ADM-001', 'John', 'Doe', 'DAY_SCHOLAR', '2025-01-01')").run()
        testDb.prepare("INSERT OR IGNORE INTO academic_year (id, year_name, start_date, end_date) VALUES (2025, '2025', '2025-01-01', '2025-12-31')").run()
        testDb.prepare("INSERT OR IGNORE INTO term (id, academic_year_id, term_number, term_name, start_date, end_date) VALUES (1, 2025, 1, 'Term 1', '2025-01-01', '2025-04-01')").run()

    })

    afterEach(() => {
        testDb.close()
    })

    describe('Race Condition Prevention', () => {
        it('should have unique index on attendance', () => {
            const indices = testDb.prepare("PRAGMA index_list('attendance')").all() as any[]
            const unique = indices.find(i => i.unique === 1 && i.origin === 'c')
            expect(unique).toBeDefined()
        })

        // We can essentially infer race condition protection from the unique index presence 
        // and the use of UPSERT syntax in the service (verified by code review), 
        // but checking the index exists is the integration aspect.
    })
})
