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
})
