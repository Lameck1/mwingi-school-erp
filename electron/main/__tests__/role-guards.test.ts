import { vi, describe, test, expect, beforeEach, type Mock } from 'vitest'

import { ipcMain } from '../electron-env'
import { registerAllIpcHandlers } from '../ipc/index'

// Mock the session module to return the mocked session data
vi.mock('../../../security/session', () => ({
    getSession: vi.fn().mockResolvedValue({
        user: { id: 99, username: 'testuser', role: 'TEACHER', full_name: 'Test', email: 't@t.com', is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
        lastActivity: Date.now()
    }),
    setSession: vi.fn(),
    clearSession: vi.fn()
}))

// Start with TEACHER role (should be denied most finance/admin/management handlers)
vi.mock('keytar', () => ({
    default: {
        getPassword: vi.fn().mockResolvedValue(JSON.stringify({
            user: { id: 99, username: 'testuser', role: 'TEACHER', full_name: 'Test', email: 't@t.com', is_active: 1, last_login: null, created_at: new Date().toISOString() },
            lastActivity: Date.now()
        })),
        setPassword: vi.fn().mockResolvedValue(null),
        deletePassword: vi.fn().mockResolvedValue(true)
    }
}))

vi.mock('../services/base/ServiceContainer', () => ({
    container: {
        resolve: vi.fn(() => ({
            findAll: vi.fn(),
            findById: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
            recordPayment: vi.fn(),
            getStudentCreditBalance: vi.fn().mockResolvedValue(0),
            getCreditTransactions: vi.fn().mockResolvedValue([]),
            calculateProRatedFee: vi.fn(),
            validateEnrollmentDate: vi.fn(),
            getActiveScholarships: vi.fn().mockResolvedValue([]),
            getStudentScholarships: vi.fn().mockResolvedValue([]),
            getScholarshipAllocations: vi.fn().mockResolvedValue([]),
            getCashFlowStatement: vi.fn(),
            getForecast: vi.fn(),
        })),
        register: vi.fn()
    }
}))

vi.mock('../ipc/inventory/inventory-handlers', () => ({
    registerInventoryHandlers: vi.fn()
}))

vi.mock('electron', () => ({
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    app: { quit: vi.fn(), getPath: vi.fn(() => '/tmp'), isPackaged: false }
}))

vi.mock('../electron-env', () => ({
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
    dialog: { showErrorBox: vi.fn() },
    app: { quit: vi.fn(), getPath: vi.fn(() => '/tmp'), isPackaged: false },
    BrowserWindow: {},
    safeStorage: { isEncryptionAvailable: vi.fn(() => false), encryptString: vi.fn(), decryptString: vi.fn() }
}))

vi.mock('bcryptjs', () => ({
    compare: vi.fn().mockResolvedValue(true),
    hash: vi.fn().mockResolvedValue('hashed_password')
}))

vi.mock('../database', () => {
    const mockDb = {
        prepare: vi.fn(),
        transaction: vi.fn((fn: Function) => (...args: unknown[]) => fn(...args)),
        exec: vi.fn(),
        close: vi.fn()
    }
    mockDb.prepare.mockImplementation(() => ({
        all: vi.fn(() => []),
        get: vi.fn(() => ({ id: 1, username: 'test', password_hash: 'mock-hash' })),
        run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
    }))
    return {
        getDatabase: vi.fn(() => mockDb),
        backupDatabase: vi.fn(),
        logAudit: vi.fn(),
        initializeDatabase: vi.fn(),
        db: mockDb
    }
})

/**
 * Helper to find and invoke a registered IPC handler by channel name.
 */
function getHandler(channel: string): ((...args: unknown[]) => Promise<unknown>) | undefined {
    const calls = (ipcMain.handle as Mock).mock.calls
    const entry = calls.find((args) => args[0] === channel)
    return entry ? entry[1] : undefined
}

describe('Role Guard Authorization Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        registerAllIpcHandlers()
    })

    describe('TEACHER role should be denied FINANCE-only handlers', () => {
        const financeOnlyChannels = [
            'transaction:getAll',
            'transaction:getSummary',
            'transaction:createCategory',
            'transaction:create',
            'budget:getAll',
            'budget:getById',
            'budget:validateTransaction',
            'budget:getAllocations',
            'budget:varianceReport',
            'budget:alerts',
            'gl:get-accounts',
            'gl:get-account',
            'assets:get-categories',
            'assets:get-financial-periods',
            'assets:get-all',
            'assets:get-one',
            'bank:getAccounts',
            'bank:getAccountById',
            'bank:getStatements',
            'bank:getStatementWithLines',
        ]

        for (const channel of financeOnlyChannels) {
            test(`${channel} rejects TEACHER role`, async () => {
                const handler = getHandler(channel)
                expect(handler).toBeDefined()
                const result = await handler!({})
                expect(result).toHaveProperty('success', false)
                expect(result).toHaveProperty('error')
                expect((result as { error: string }).error).toContain('Unauthorized')
            })
        }
    })

    describe('TEACHER role should be denied MANAGEMENT-only handlers', () => {
        const managementChannels = [
            'audit:getLog',
            'message:saveTemplate',
        ]

        for (const channel of managementChannels) {
            test(`${channel} rejects TEACHER role`, async () => {
                const handler = getHandler(channel)
                expect(handler).toBeDefined()
                const result = await handler!({})
                expect(result).toHaveProperty('success', false)
                expect((result as { error: string }).error).toContain('Unauthorized')
            })
        }
    })

    describe('TEACHER role should be denied ADMIN-only handlers', () => {
        const adminChannels = [
            'backup:create',
            'backup:getList',
            'backup:restore',
            'backup:openFolder',
            'settings:getSecure',
            'settings:saveSecure',
            'settings:getAllConfigs',
            'system:resetAndSeed',
            'system:normalizeCurrencyScale',
        ]

        for (const channel of adminChannels) {
            test(`${channel} rejects TEACHER role`, async () => {
                const handler = getHandler(channel)
                expect(handler).toBeDefined()
                const result = await handler!({})
                expect(result).toHaveProperty('success', false)
                expect((result as { error: string }).error).toContain('Unauthorized')
            })
        }
    })

    describe('TEACHER role should be ALLOWED on STAFF-level handlers', () => {
        const staffChannels = [
            'transaction:getCategories',
            'student:getAll',
            'student:getById',
            'staff:getAll',
            'staff:getById',
            'period:getAll',
            'period:getForDate',
            'period:isTransactionAllowed',
            'settings:get',
            'system:logError',
            'message:getTemplates',
        ]

        for (const channel of staffChannels) {
            test(`${channel} allows TEACHER role`, async () => {
                const handler = getHandler(channel)
                expect(handler).toBeDefined()
                const result = await handler!({})
                // Should NOT return unauthorized error
                if (result && typeof result === 'object' && 'error' in result) {
                    expect((result as { error: string }).error).not.toContain('Unauthorized')
                }
            })
        }
    })
})
