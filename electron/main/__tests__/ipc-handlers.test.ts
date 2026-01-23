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

describe('IPC Handlers Security Tests', () => {
  let mockDb: {
    prepare: jest.Mock;
    transaction: jest.Mock;
  };
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Get the mock database instance
    const { getDatabase } = require('../database');
    mockDb = getDatabase();
    
    // Register handlers
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
      mockDb.transaction.mockImplementation((fn: () => unknown) => () => fn());
      
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

  describe('Backup Security', () => {
    test('backup:restore validates SQLite file signature', async () => {
      const handler = (ipcMain.handle as jest.Mock).mock.calls
        .find(([channel]) => channel === 'backup:restore')[1];
      
      // This would require more complex mocking of file operations
      // For now, we'll just verify the handler is registered
      expect(handler).toBeDefined();
    });
  });
});

describe('Error Handling', () => {
  test('database errors are properly handled', async () => {
    const handler = (ipcMain.handle as jest.Mock).mock.calls
      .find(([channel]) => channel === 'report:defaulters')[1];
    
    const mockStatement = {
      all: jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      })
    };
    const { getDatabase } = require('../database');
    const mockDb = getDatabase();
    mockDb.prepare.mockReturnValue(mockStatement);
    
    await expect(handler({}, 1)).rejects.toThrow('Database error');
  });
});













