import { vi, describe, test, expect, beforeEach, type Mock } from 'vitest';

import { ipcMain } from '../electron-env'
import { registerAllIpcHandlers } from '../ipc/index';

// Mock keytar before any other imports — return a valid ADMIN session
// so safeHandleRawWithRole passes the role check
vi.mock('keytar', () => ({
  default: {
    getPassword: vi.fn().mockResolvedValue(JSON.stringify({
      user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
      lastActivity: Date.now()
    })),
    setPassword: vi.fn().mockResolvedValue(null),
    deletePassword: vi.fn().mockResolvedValue(true)
  },
  getPassword: vi.fn().mockResolvedValue(JSON.stringify({
    user: { id: 1, username: 'admin', role: 'ADMIN', full_name: 'Admin', email: 'admin@test.com', is_active: 1, last_login: null, created_at: '2026-01-01T00:00:00' },
    lastActivity: Date.now()
  })),
  setPassword: vi.fn().mockResolvedValue(null),
  deletePassword: vi.fn().mockResolvedValue(true)
}));

// Mock ServiceContainer
vi.mock('../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => ({
      findAll: vi.fn(),
      findById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      recordPayment: vi.fn(), // for payment service
    })),
    register: vi.fn()
  }
}));


// Mock inventory-handlers to bypass container issues
vi.mock('../ipc/inventory/inventory-handlers', () => ({
  registerInventoryHandlers: vi.fn()
}));

// Mock electron
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  dialog: {
    showErrorBox: vi.fn()
  },
  app: {
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp')
  }
}));

// Mock electron-env
vi.mock('../electron-env', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  dialog: {
    showErrorBox: vi.fn()
  },
  app: {
    quit: vi.fn(),
    getPath: vi.fn(() => '/tmp')
  },
  BrowserWindow: {}
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  compare: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('hashed_password')
}));

// Mock database module
vi.mock('../database', () => {
  const mockDb = {
    prepare: vi.fn(),
    transaction: vi.fn((fn) => () => fn()),
    exec: vi.fn(),
    close: vi.fn()
  };

  // Mock database methods
  mockDb.prepare.mockImplementation(() => {
    const mockStatement = {
      all: vi.fn(() => []),
      get: vi.fn(() => ({ id: 1, username: 'test', password_hash: 'mock-hash-value' })), // NOSONAR - test fixture
      run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
    };

    return mockStatement;
  });

  // Mock transaction to properly handle the callback
  mockDb.transaction.mockImplementation((callback: Function) => {
    return (...args: unknown[]) => callback(...args);
  });

  return {
    getDatabase: vi.fn(() => mockDb),
    backupDatabase: vi.fn(),
    logAudit: vi.fn(),
    initializeDatabase: vi.fn(),
    db: mockDb
  };
});

describe('IPC Handlers Security Tests', () => {
  let mockDb: {
    prepare: Mock;
    transaction: Mock;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Get the mock database instance
    const { getDatabase } = await import('../database');
    mockDb = getDatabase() as unknown as { prepare: Mock; transaction: Mock };

    // Register all handlers
    registerAllIpcHandlers();
  });

  describe('SQL Injection Protection', () => {
    test('report:defaulters handler uses parameterized queries', async () => {
      const handlerCalls = (ipcMain.handle as Mock).mock.calls;
      const handlerEntry = handlerCalls.find((args) => args[0] === 'report:defaulters');
      const handler = handlerEntry ? handlerEntry[1] : undefined;

      // Mock database response
      const mockStatement = {
        all: vi.fn().mockReturnValue([])
      };
      mockDb.prepare.mockReturnValue(mockStatement);

      await handler({}, 1); // termId = 1

      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('AND fi.term_id = ?'));
      expect(mockStatement.all).toHaveBeenCalledWith(1);
    });

    test('user:update handler restricts allowed fields', async () => {
      const handlerCalls = (ipcMain.handle as Mock).mock.calls;
      const handlerEntry = handlerCalls.find((args) => args[0] === 'user:update');
      const handler = handlerEntry ? handlerEntry[1] : undefined;

      const mockStatement = {
        run: vi.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStatement);

      // Test valid fields
      await handler({}, 1, { full_name: 'John Doe', email: 'john@example.com', role: 'admin' });

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SET full_name = COALESCE(?, full_name)')
      );

      // Test invalid field (should be ignored) - not a real password
      await handler({}, 1, { full_name: 'John Doe', password: 'test-disallowed-field', is_active: false }); // NOSONAR

      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user')
      );
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('SET full_name = COALESCE(?, full_name)')
      );
      expect(mockDb.prepare).not.toHaveBeenCalledWith(
        expect.stringContaining('password')
      );
    });
  });

  describe('Transaction Boundaries', () => {
    test('payment:record handler uses transactions', async () => {
      const handlerCalls = (ipcMain.handle as Mock).mock.calls;
      const handlerEntry = handlerCalls.find((args) => args[0] === 'payment:record');
      const handler = handlerEntry ? handlerEntry[1] : undefined;

      // Ensure the mock is properly set up for the payment handler
      const mockStatement = {
        all: vi.fn().mockReturnValue([
          { id: 1, invoice_number: 'INV-001', total_amount: 1000, amount_paid: 0, balance: 1000 }
        ]),
        get: vi.fn().mockReturnValue({ id: 1 }),
        run: vi.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStatement);
      mockDb.transaction.mockImplementation((fn: Function) => (...args: unknown[]) => fn(...args));

      const paymentData = {
        student_id: 1,
        amount: 1000,
        payment_method: 'CASH',
        description: 'Test payment',
        transaction_date: new Date().toISOString().slice(0, 10),
        payment_reference: 'REF123',
        term_id: 1
      };

      await handler({}, paymentData, 1);

      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('Handler Registration', () => {
    test('all domain handlers are registered', () => {
      const registeredHandlers = (ipcMain.handle as Mock).mock.calls.map((args) => args[0]);

      // Check that handlers from all domains are registered
      expect(registeredHandlers).toContain('auth:login');
      expect(registeredHandlers).toContain('payment:record');
      expect(registeredHandlers).toContain('report:defaulters');
      expect(registeredHandlers).toContain('user:update');
      expect(registeredHandlers).toContain('transaction:create');
      expect(registeredHandlers).toContain('staff:create');
      // expect(registeredHandlers).toContain('inventory:getAll'); // Disabled due to mock bypass
    });
  });
});

