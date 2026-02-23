import Database from 'better-sqlite3'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const state = {
    tempDir: '',
    closeDatabaseMock: vi.fn(),
    backupDatabaseMock: vi.fn<(targetPath: string) => Promise<void>>(),
    getDatabasePathMock: vi.fn<() => string>(),
    isDatabaseInitializedMock: vi.fn(() => true),
    appMock: {
      getPath: vi.fn(),
      relaunch: vi.fn(),
      exit: vi.fn(),
    },
  }

  state.getDatabasePathMock.mockImplementation(() => path.join(state.tempDir, 'app.sqlite'))
  state.appMock.getPath.mockImplementation((_name: string) => state.tempDir)
  return state
})

vi.mock('../../database', () => ({
  isDatabaseInitialized: () => mocks.isDatabaseInitializedMock(),
  getDatabasePath: () => mocks.getDatabasePathMock(),
  backupDatabase: (targetPath: string) => mocks.backupDatabaseMock(targetPath),
  closeDatabase: () => mocks.closeDatabaseMock(),
}))

vi.mock('../../database/security', () => ({
  getEncryptionKey: () => '',
}))

vi.mock('../../electron-env', () => ({
  app: mocks.appMock,
}))

vi.mock('../../utils/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}))

import { BackupService } from '../BackupService'

function createSqliteFile(filePath: string): void {
  const db = new Database(filePath)
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

    CREATE TABLE sample (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT);
    INSERT INTO sample (name) VALUES ('ok');
  `)
  db.close()
}

describe('BackupService safety checks', () => {
  beforeEach(() => {
    mocks.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mwingi-backup-test-'))
    mocks.closeDatabaseMock.mockReset()
    mocks.backupDatabaseMock.mockReset()
    mocks.isDatabaseInitializedMock.mockReset()
    mocks.isDatabaseInitializedMock.mockReturnValue(true)
    mocks.appMock.relaunch.mockReset()
    mocks.appMock.exit.mockReset()
    mocks.appMock.getPath.mockImplementation(() => mocks.tempDir)
  })

  afterEach(() => {
    fs.rmSync(mocks.tempDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('restoreBackup rejects path traversal filename input', async () => {
    await expect(BackupService.restoreBackup('../outside.sqlite')).rejects.toThrow('Invalid backup filename')
  })

  it('restoreBackup aborts when pre-restore backup creation fails', async () => {
    const backupsDir = path.join(mocks.tempDir, 'backups')
    fs.mkdirSync(backupsDir, { recursive: true })

    const backupFile = path.join(backupsDir, 'restore-source.sqlite')
    createSqliteFile(backupFile)
    createSqliteFile(mocks.getDatabasePathMock())

    const integritySpy = vi.spyOn(BackupService as unknown as { verifyBackupIntegrity: (backupPath: string) => boolean }, 'verifyBackupIntegrity').mockReturnValue(true)
    const createBackupSpy = vi.spyOn(BackupService, 'createBackup').mockResolvedValue({
      success: false,
      error: 'Disk full'
    })

    const restored = await BackupService.restoreBackup('restore-source.sqlite')
    expect(restored).toBe(false)
    expect(integritySpy).toHaveBeenCalled()
    expect(createBackupSpy).toHaveBeenCalledWith('pre-restore')
    expect(mocks.closeDatabaseMock).not.toHaveBeenCalled()
  })

  it('createBackupToPath does not remove existing target when backupDatabase fails', async () => {
    const targetPath = path.join(mocks.tempDir, 'existing-backup.sqlite')
    fs.writeFileSync(targetPath, 'existing-backup-content', 'utf8')

    mocks.backupDatabaseMock.mockRejectedValueOnce(new Error('write failed'))

    const result = await BackupService.createBackupToPath(targetPath)
    expect(result.success).toBe(false)
    expect(fs.readFileSync(targetPath, 'utf8')).toBe('existing-backup-content')
  })

  it('cleanupOldBackups keeps 7-day backups and one snapshot per older month', async () => {
    const backupsDir = path.join(mocks.tempDir, 'backups')
    fs.mkdirSync(backupsDir, { recursive: true })

    const now = Date.now()
    const createBackdatedBackup = (filename: string, daysAgo: number) => {
      const filePath = path.join(backupsDir, filename)
      fs.writeFileSync(filePath, 'backup')
      const timestamp = new Date(now - daysAgo * 24 * 60 * 60 * 1000)
      fs.utimesSync(filePath, timestamp, timestamp)
    }

    // Recent daily backups (expected to stay)
    createBackdatedBackup('backup-day-0.sqlite', 0)
    createBackdatedBackup('backup-day-1.sqlite', 1)
    createBackdatedBackup('backup-day-2.sqlite', 2)
    createBackdatedBackup('backup-day-3.sqlite', 3)
    createBackdatedBackup('backup-day-4.sqlite', 4)
    createBackdatedBackup('backup-day-5.sqlite', 5)
    createBackdatedBackup('backup-day-6.sqlite', 6)

    // Older backups from the same month (only newest should remain)
    createBackdatedBackup('backup-month-a.sqlite', 40)
    createBackdatedBackup('backup-month-a-older.sqlite', 45)

    // Older backup from another month
    createBackdatedBackup('backup-month-b.sqlite', 75)

    // Trigger private cleanup function directly for deterministic testing.
    await (BackupService as unknown as { cleanupOldBackups: () => Promise<void> }).cleanupOldBackups()

    const remaining = fs.readdirSync(backupsDir)
    expect(remaining).toContain('backup-day-0.sqlite')
    expect(remaining).toContain('backup-day-6.sqlite')
    expect(remaining).toContain('backup-month-a.sqlite')
    expect(remaining).toContain('backup-month-b.sqlite')
    expect(remaining).not.toContain('backup-month-a-older.sqlite')
  })
})
