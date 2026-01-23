import { app, BrowserWindow, dialog, ipcMain } from './electron-env'
import from './electron-env';
import { registerAllIpcHandlers } from '../ipc/index';

// Mock electron
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    removeHandler: jest.fn()
  },
  dialog: {
    showErrorBox: jest.fn()
  },
  app: {
    quit: jest.fn()
  }
}));

// Mock bcryptjs
jest.mock('bcryptjs', () => ({
  compare: jest.fn().mockResolvedValue(true),
  hash: jest.fn().mockResolvedValue('hashed_password')
}));

// Mock database module
jest.mock('../database/index', () => {
  const mockDb = {
    prepare: jest.fn(),
    transaction: jest.fn((fn) => () => fn()),
    exec: jest.fn(),
    close: jest.fn()
  };
  
  // Mock database methods
  mockDb.prepare.mockImplementation(() => {
    const mockStatement = {
      all: jest.fn(() => []),
      get: jest.fn(() => ({ id: 1, username: 'test', password_hash: 'hashed' })),
      run: jest.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
    };
    
    return mockStatement;
  });
  
  // Mock transaction to properly handle the callback
  mockDb.transaction.mockImplementation((callback: Function) => {
    return (...args: unknown[]) => callback(...args);
  });
  
  return {
    getDatabase: jest.fn(() => mockDb),
    backupDatabase: jest.fn(),
    logAudit: jest.fn(),
    initializeDatabase: jest.fn(),
    db: mockDb
  };
});

describe('Modular IPC Handlers Security Tests', () => {
  let mockDb: {
    prepare: jest.Mock;
    transaction: jest.Mock;
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mock database instance
    const { getDatabase } = require('../database/index');
    mockDb = getDatabase();
    
    // Register all handlers
    registerAllIpcHandlers();
  });

  describe('SQL Injection Protection', () => {
    test('report:defaulters handler uses parameterized queries', async () => {
      const handler = (ipcMain.handle as jest.Mock).mock.calls
        .find(([channel]) => channel === 'report:defaulters')[1];
      
      // Mock database response
      const mockStatement = {
        all: jest.fn().mockReturnValue([])
      };
      mockDb.prepare.mockReturnValue(mockStatement);
      
      await handler({}, 1); // termId = 1
      
      expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('AND fi.term_id = ?'));
      expect(mockStatement.all).toHaveBeenCalledWith(1);
    });

    test('user:update handler restricts allowed fields', async () => {
      const handler = (ipcMain.handle as jest.Mock).mock.calls
        .find(([channel]) => channel === 'user:update')[1];
      
      const mockStatement = {
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStatement);
      
      // Test valid fields
      await handler({}, 1, { full_name: 'John Doe', email: 'john@example.com', role: 'admin' });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user SET full_name = ?, email = ?, role = ?')
      );
      
      // Test invalid field (should be ignored)
      await handler({}, 1, { full_name: 'John Doe', password: 'hackattempt', is_active: false });
      
      expect(mockDb.prepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE user SET full_name = ?')
      );
      expect(mockDb.prepare).not.toHaveBeenCalledWith(
        expect.stringContaining('password')
      );
    });
  });

  describe('Transaction Boundaries', () => {
    test('payment:record handler uses transactions', async () => {
      const handler = (ipcMain.handle as jest.Mock).mock.calls
        .find(([channel]) => channel === 'payment:record')[1];
      
      // Ensure the mock is properly set up for the payment handler
      const mockStatement = {
        all: jest.fn().mockReturnValue([
          { id: 1, invoice_number: 'INV-001', total_amount: 1000, amount_paid: 0, balance: 1000 }
        ]),
        get: jest.fn().mockReturnValue({ id: 1 }),
        run: jest.fn().mockReturnValue({ changes: 1 })
      };
      mockDb.prepare.mockReturnValue(mockStatement);
      mockDb.transaction.mockImplementation((fn: Function) => (...args: unknown[]) => fn(...args));
      
      const paymentData = {
        studentId: 1,
        amount: 1000,
        paymentMethod: 'CASH',
        description: 'Test payment'
      };
      
      await handler({}, paymentData, 1);
      
      expect(mockDb.transaction).toHaveBeenCalled();
    });
  });

  describe('Handler Registration', () => {
    test('all domain handlers are registered', () => {
      const registeredHandlers = (ipcMain.handle as jest.Mock).mock.calls.map(([channel]) => channel);
      
      // Check that handlers from all domains are registered
      expect(registeredHandlers).toContain('auth:login');
      expect(registeredHandlers).toContain('payment:record');
      expect(registeredHandlers).toContain('report:defaulters');
      expect(registeredHandlers).toContain('user:update');
      expect(registeredHandlers).toContain('transaction:create');
      expect(registeredHandlers).toContain('staff:create');
      expect(registeredHandlers).toContain('inventory:getAll');
    });
  });
});













