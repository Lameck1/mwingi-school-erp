/**
 * Consolidated tests for the remaining preload API modules:
 *   - events.ts       (menu/system event listeners)
 *   - operations.ts   (inventory, hire, boarding, transport, grants, student cost)
 *   - reports.ts      (fee collection, ledger, defaulters, dashboards, scheduled)
 *   - system.ts       (backup, users, approvals, data import, errors, updates)
 *   - staff.ts        (staff CRUD, payroll)
 *   - students.ts     (student CRUD, photos, balance, purge)
 *   - communications.ts (SMS, email, templates, notifications)
 *   - auth.ts         (login, password, session, admin setup)
 *   - settings.ts     (settings, logo, configs, system admin)
 *
 * All modules follow the same pattern: thin wrappers around ipcRenderer.invoke
 * (or ipcRenderer.on for events). We mock electron and verify channel/arg mapping.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mock electron ──────────────────────────────────────────────────────────
const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()

vi.mock('electron', () => ({
  ipcRenderer: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args),
  },
}))

// ─── Imports (after mock) ───────────────────────────────────────────────────
import { createMenuEventAPI } from '../events'
import { createOperationsAPI } from '../operations'
import { createReportsAPI } from '../reports'
import { createSystemAPI } from '../system'
import { createStaffAPI } from '../staff'
import { createStudentAPI } from '../students'
import { createCommunicationsAPI } from '../communications'
import { createAuthAPI } from '../auth'
import { createSettingsAPI } from '../settings'

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue({ success: true })
})

// ═══════════════════════════════════════════════════════════════════════════
// 1. events.ts – createMenuEventAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createMenuEventAPI', () => {
  const api = createMenuEventAPI()

  const eventMethods: Array<[string, string]> = [
    ['onNavigate', 'navigate'],
    ['onOpenImportDialog', 'open-import-dialog'],
    ['onTriggerPrint', 'trigger-print'],
    ['onBackupDatabase', 'backup-database'],
    ['onOpenCommandPalette', 'open-command-palette'],
    ['onCheckForUpdates', 'check-for-updates'],
    ['onUpdateStatus', 'update-status'],
    ['onDatabaseError', 'db-error'],
  ]

  it.each(eventMethods)('%s registers listener on channel "%s"', (method, channel) => {
    const cb = vi.fn()
    ;(api as Record<string, (cb: unknown) => unknown>)[method](cb)
    expect(mockOn).toHaveBeenCalledWith(channel, expect.any(Function))
  })

  it.each(eventMethods)('%s returns an unsubscribe function for "%s"', (method, channel) => {
    const cb = vi.fn()
    const unsub = (api as Record<string, (cb: unknown) => () => void>)[method](cb)
    expect(typeof unsub).toBe('function')
    unsub()
    expect(mockRemoveListener).toHaveBeenCalledWith(channel, expect.any(Function))
  })

  it('onNavigate callback receives the path argument', () => {
    const cb = vi.fn()
    api.onNavigate(cb)
    // Grab the listener that was registered
    const [, listener] = mockOn.mock.calls.find(([ch]: string[]) => ch === 'navigate')!
    listener({} /* IpcRendererEvent */, '/students')
    expect(cb).toHaveBeenCalledWith('/students')
  })

  it('onBackupDatabase callback receives the path argument', () => {
    const cb = vi.fn()
    api.onBackupDatabase(cb)
    const [, listener] = mockOn.mock.calls.find(([ch]: string[]) => ch === 'backup-database')!
    listener({}, '/backups/db.sqlite')
    expect(cb).toHaveBeenCalledWith('/backups/db.sqlite')
  })

  it('onUpdateStatus callback receives data object', () => {
    const cb = vi.fn()
    api.onUpdateStatus(cb)
    const [, listener] = mockOn.mock.calls.find(([ch]: string[]) => ch === 'update-status')!
    const data = { status: 'available', version: '1.2.0' }
    listener({}, data)
    expect(cb).toHaveBeenCalledWith(data)
  })

  it('onDatabaseError callback receives message string', () => {
    const cb = vi.fn()
    api.onDatabaseError(cb)
    const [, listener] = mockOn.mock.calls.find(([ch]: string[]) => ch === 'db-error')!
    listener({}, 'disk full')
    expect(cb).toHaveBeenCalledWith('disk full')
  })

  it('multiple listeners on same channel each get their own unsubscribe', () => {
    const cb1 = vi.fn()
    const cb2 = vi.fn()
    const unsub1 = api.onNavigate(cb1)
    const unsub2 = api.onNavigate(cb2)

    unsub1()
    // Only the first listener reference should have been removed
    expect(mockRemoveListener).toHaveBeenCalledTimes(1)
    unsub2()
    expect(mockRemoveListener).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 2. operations.ts – createOperationsAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createOperationsAPI', () => {
  const api = createOperationsAPI()

  // --- Inventory ----------------------------------------------------------
  describe('Inventory', () => {
    it('getInventory calls inventory:getAll', async () => {
      await api.getInventory()
      expect(mockInvoke).toHaveBeenCalledWith('inventory:getAll')
    })

    it('getLowStockItems calls inventory:getLowStock', async () => {
      await api.getLowStockItems()
      expect(mockInvoke).toHaveBeenCalledWith('inventory:getLowStock')
    })

    it('getInventoryCategories calls inventory:getCategories', async () => {
      await api.getInventoryCategories()
      expect(mockInvoke).toHaveBeenCalledWith('inventory:getCategories')
    })

    it('createInventoryItem forwards data', async () => {
      const data = { name: 'Chalk', quantity: 100 } as any
      await api.createInventoryItem(data)
      expect(mockInvoke).toHaveBeenCalledWith('inventory:createItem', data)
    })

    it('recordStockMovement forwards data and userId', async () => {
      const data = { itemId: 1, quantity: 5, type: 'IN' } as any
      await api.recordStockMovement(data, 42)
      expect(mockInvoke).toHaveBeenCalledWith('inventory:recordMovement', data, 42)
    })

    it('getSuppliers calls inventory:getSuppliers', async () => {
      await api.getSuppliers()
      expect(mockInvoke).toHaveBeenCalledWith('inventory:getSuppliers')
    })
  })

  // --- Hire ---------------------------------------------------------------
  describe('Asset Hire', () => {
    it('getHireClients forwards filters', async () => {
      await api.getHireClients({ search: 'acme', isActive: true })
      expect(mockInvoke).toHaveBeenCalledWith('hire:getClients', { search: 'acme', isActive: true })
    })

    it('getHireClientById forwards id', async () => {
      await api.getHireClientById(7)
      expect(mockInvoke).toHaveBeenCalledWith('hire:getClientById', 7)
    })

    it('createHireClient forwards data', async () => {
      const data = { name: 'Client A' } as any
      await api.createHireClient(data)
      expect(mockInvoke).toHaveBeenCalledWith('hire:createClient', data)
    })

    it('updateHireClient forwards id and data', async () => {
      await api.updateHireClient(5, { name: 'Updated' } as any)
      expect(mockInvoke).toHaveBeenCalledWith('hire:updateClient', 5, { name: 'Updated' })
    })

    it('getHireAssets forwards filters', async () => {
      await api.getHireAssets({ type: 'bus' })
      expect(mockInvoke).toHaveBeenCalledWith('hire:getAssets', { type: 'bus' })
    })

    it('getHireAssetById forwards id', async () => {
      await api.getHireAssetById(3)
      expect(mockInvoke).toHaveBeenCalledWith('hire:getAssetById', 3)
    })

    it('createHireAsset forwards data', async () => {
      await api.createHireAsset({ name: 'Bus 1' } as any)
      expect(mockInvoke).toHaveBeenCalledWith('hire:createAsset', { name: 'Bus 1' })
    })

    it('updateHireAsset forwards id and data', async () => {
      await api.updateHireAsset(2, { name: 'Bus 2' } as any)
      expect(mockInvoke).toHaveBeenCalledWith('hire:updateAsset', 2, { name: 'Bus 2' })
    })

    it('checkHireAvailability forwards assetId, dates', async () => {
      await api.checkHireAvailability(1, '2024-06-01', '2024-06-05')
      expect(mockInvoke).toHaveBeenCalledWith('hire:checkAvailability', 1, '2024-06-01', '2024-06-05')
    })

    it('getHireBookings forwards filters', async () => {
      await api.getHireBookings({ status: 'confirmed' })
      expect(mockInvoke).toHaveBeenCalledWith('hire:getBookings', { status: 'confirmed' })
    })

    it('getHireBookingById forwards id', async () => {
      await api.getHireBookingById(11)
      expect(mockInvoke).toHaveBeenCalledWith('hire:getBookingById', 11)
    })

    it('createHireBooking forwards data and userId', async () => {
      const data = { assetId: 1, clientId: 2 } as any
      await api.createHireBooking(data, 10)
      expect(mockInvoke).toHaveBeenCalledWith('hire:createBooking', data, 10)
    })

    it('updateHireBookingStatus forwards id and status', async () => {
      await api.updateHireBookingStatus(5, 'completed')
      expect(mockInvoke).toHaveBeenCalledWith('hire:updateBookingStatus', 5, 'completed')
    })

    it('recordHirePayment forwards bookingId, data, userId', async () => {
      const data = { amount: 500 } as any
      await api.recordHirePayment(5, data, 10)
      expect(mockInvoke).toHaveBeenCalledWith('hire:recordPayment', 5, data, 10)
    })

    it('getHirePaymentsByBooking forwards bookingId', async () => {
      await api.getHirePaymentsByBooking(9)
      expect(mockInvoke).toHaveBeenCalledWith('hire:getPaymentsByBooking', 9)
    })

    it('getHireStats calls hire:getStats', async () => {
      await api.getHireStats()
      expect(mockInvoke).toHaveBeenCalledWith('hire:getStats')
    })
  })

  // --- Boarding -----------------------------------------------------------
  describe('Boarding', () => {
    it('getBoardingFacilities calls correct channel', async () => {
      await api.getBoardingFacilities()
      expect(mockInvoke).toHaveBeenCalledWith('operations:boarding:getAllFacilities')
    })

    it('getActiveBoardingFacilities calls correct channel', async () => {
      await api.getActiveBoardingFacilities()
      expect(mockInvoke).toHaveBeenCalledWith('operations:boarding:getActiveFacilities')
    })

    it('recordBoardingExpense uses invokeOrThrow and forwards data', async () => {
      mockInvoke.mockResolvedValue({ success: true, id: 42 })
      const params = { facilityId: 1, amount: 1000, category: 'food' } as any
      const result = await api.recordBoardingExpense(params)
      expect(mockInvoke).toHaveBeenCalledWith('operations:boarding:recordExpense', params)
      expect(result).toEqual({ success: true, id: 42 })
    })

    it('recordBoardingExpense throws when result has success:false', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'Facility not found' })
      await expect(api.recordBoardingExpense({} as any)).rejects.toThrow('Facility not found')
    })
  })

  // --- Transport ----------------------------------------------------------
  describe('Transport', () => {
    it('getTransportRoutes calls correct channel', async () => {
      await api.getTransportRoutes()
      expect(mockInvoke).toHaveBeenCalledWith('operations:transport:getAllRoutes')
    })

    it('getActiveTransportRoutes calls correct channel', async () => {
      await api.getActiveTransportRoutes()
      expect(mockInvoke).toHaveBeenCalledWith('operations:transport:getActiveRoutes')
    })

    it('createTransportRoute forwards data', async () => {
      const data = { routeName: 'Route A' } as any
      await api.createTransportRoute(data)
      expect(mockInvoke).toHaveBeenCalledWith('operations:transport:createRoute', data)
    })

    it('recordTransportExpense uses invokeOrThrow', async () => {
      mockInvoke.mockResolvedValue({ success: true, id: 7 })
      const params = { routeId: 1, amount: 500 } as any
      await api.recordTransportExpense(params)
      expect(mockInvoke).toHaveBeenCalledWith('operations:transport:recordExpense', params)
    })

    it('recordTransportExpense throws on failure', async () => {
      mockInvoke.mockResolvedValue({ success: false, message: 'Route inactive' })
      await expect(api.recordTransportExpense({} as any)).rejects.toThrow('Route inactive')
    })
  })

  // --- Grants -------------------------------------------------------------
  describe('Grants', () => {
    it('getGrantsByStatus forwards status', async () => {
      await api.getGrantsByStatus('active')
      expect(mockInvoke).toHaveBeenCalledWith('operations:grants:getByStatus', 'active')
    })

    it('createGrant forwards data and userId', async () => {
      const data = { name: 'CDF Grant', amount: 100000 } as any
      await api.createGrant(data, 1)
      expect(mockInvoke).toHaveBeenCalledWith('operations:grants:create', data, 1)
    })

    it('recordGrantUtilization forwards payload', async () => {
      const payload = { grantId: 1, amount: 5000, description: 'Books', glAccountCode: null, utilizationDate: '2024-01-15', userId: 1 }
      await api.recordGrantUtilization(payload)
      expect(mockInvoke).toHaveBeenCalledWith('operations:grants:recordUtilization', payload)
    })

    it('generateNEMISExport forwards fiscalYear', async () => {
      await api.generateNEMISExport(2024)
      expect(mockInvoke).toHaveBeenCalledWith('operations:grants:generateNEMISExport', 2024)
    })
  })

  // --- Student Cost -------------------------------------------------------
  describe('Student Cost Analysis', () => {
    it('calculateStudentCost forwards all args', async () => {
      await api.calculateStudentCost(1, 2, 3)
      expect(mockInvoke).toHaveBeenCalledWith('operations:studentCost:calculate', 1, 2, 3)
    })

    it('getStudentCostVsRevenue forwards studentId and termId', async () => {
      await api.getStudentCostVsRevenue(10, 2)
      expect(mockInvoke).toHaveBeenCalledWith('operations:studentCost:getVsRevenue', 10, 2)
    })
  })

  // --- invokeOrThrow edge: fallback error message -------------------------
  describe('invokeOrThrow edge cases', () => {
    it('throws "Operation failed" when no error/message field', async () => {
      mockInvoke.mockResolvedValue({ success: false })
      await expect(api.recordBoardingExpense({} as any)).rejects.toThrow('Operation failed')
    })

    it('uses message field when error is absent', async () => {
      mockInvoke.mockResolvedValue({ success: false, message: 'custom msg' })
      await expect(api.recordBoardingExpense({} as any)).rejects.toThrow('custom msg')
    })

    it('prefers error field over message field', async () => {
      mockInvoke.mockResolvedValue({ success: false, error: 'err', message: 'msg' })
      await expect(api.recordBoardingExpense({} as any)).rejects.toThrow('err')
    })

    it('passes through non-object results', async () => {
      mockInvoke.mockResolvedValue(42)
      const result = await api.recordBoardingExpense({} as any)
      expect(result).toBe(42)
    })

    it('passes through null results', async () => {
      mockInvoke.mockResolvedValue(null)
      const result = await api.recordBoardingExpense({} as any)
      expect(result).toBeNull()
    })

    it('passes through objects without success field', async () => {
      mockInvoke.mockResolvedValue({ data: [1, 2, 3] })
      const result = await api.recordBoardingExpense({} as any)
      expect(result).toEqual({ data: [1, 2, 3] })
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. reports.ts – createReportsAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createReportsAPI', () => {
  const api = createReportsAPI()

  describe('simple channel mapping', () => {
    it('getFeeCollectionReport forwards dates', async () => {
      await api.getFeeCollectionReport('2024-01-01', '2024-01-31')
      expect(mockInvoke).toHaveBeenCalledWith('report:feeCollection', '2024-01-01', '2024-01-31')
    })

    it('getDefaulters forwards termId', async () => {
      await api.getDefaulters(5)
      expect(mockInvoke).toHaveBeenCalledWith('report:defaulters', 5)
    })

    it('getDefaulters works without termId', async () => {
      await api.getDefaulters()
      expect(mockInvoke).toHaveBeenCalledWith('report:defaulters', undefined)
    })

    it('getDashboardData calls report:dashboard', async () => {
      await api.getDashboardData()
      expect(mockInvoke).toHaveBeenCalledWith('report:dashboard')
    })

    it('getFeeCategoryBreakdown calls report:feeCategoryBreakdown', async () => {
      await api.getFeeCategoryBreakdown()
      expect(mockInvoke).toHaveBeenCalledWith('report:feeCategoryBreakdown')
    })

    it('getRevenueByCategory forwards dates', async () => {
      await api.getRevenueByCategory('2024-01-01', '2024-12-31')
      expect(mockInvoke).toHaveBeenCalledWith('report:revenueByCategory', '2024-01-01', '2024-12-31')
    })

    it('getExpenseByCategory forwards dates', async () => {
      await api.getExpenseByCategory('2024-01-01', '2024-12-31')
      expect(mockInvoke).toHaveBeenCalledWith('report:expenseByCategory', '2024-01-01', '2024-12-31')
    })

    it('getDailyCollection forwards date', async () => {
      await api.getDailyCollection('2024-06-15')
      expect(mockInvoke).toHaveBeenCalledWith('report:dailyCollection', '2024-06-15')
    })

    it('getAuditLog forwards limit', async () => {
      await api.getAuditLog(50)
      expect(mockInvoke).toHaveBeenCalledWith('audit:getLog', 50)
    })

    it('getAuditLog works without limit', async () => {
      await api.getAuditLog()
      expect(mockInvoke).toHaveBeenCalledWith('audit:getLog', undefined)
    })
  })

  describe('Scheduled Reports', () => {
    it('getScheduledReports calls scheduler:getAll', async () => {
      await api.getScheduledReports()
      expect(mockInvoke).toHaveBeenCalledWith('scheduler:getAll')
    })

    it('createScheduledReport forwards data and userId', async () => {
      const data = { name: 'Weekly Fee' } as any
      await api.createScheduledReport(data, 1)
      expect(mockInvoke).toHaveBeenCalledWith('scheduler:create', data, 1)
    })

    it('updateScheduledReport forwards id, data and userId', async () => {
      await api.updateScheduledReport(3, { name: 'Daily' } as any, 1)
      expect(mockInvoke).toHaveBeenCalledWith('scheduler:update', 3, { name: 'Daily' }, 1)
    })

    it('deleteScheduledReport forwards id and userId', async () => {
      await api.deleteScheduledReport(3, 1)
      expect(mockInvoke).toHaveBeenCalledWith('scheduler:delete', 3, 1)
    })

    it('downloadReportCardPDF forwards html and optional filename', async () => {
      await api.downloadReportCardPDF('<html></html>', 'report.pdf')
      expect(mockInvoke).toHaveBeenCalledWith('reportcard:download-pdf', '<html></html>', 'report.pdf')
    })

    it('downloadReportCardPDF works without filename', async () => {
      await api.downloadReportCardPDF('<html></html>')
      expect(mockInvoke).toHaveBeenCalledWith('reportcard:download-pdf', '<html></html>', undefined)
    })
  })

  describe('getStudentLedgerReport', () => {
    it('returns error when no academic year is configured', async () => {
      // eslint-disable-next-line unicorn/no-useless-undefined
      mockInvoke.mockResolvedValueOnce(undefined) // academicYear:getCurrent
      const result = await api.getStudentLedgerReport(1)
      expect(mockInvoke).toHaveBeenCalledWith('academicYear:getCurrent')
      expect(result).toEqual({
        student: undefined,
        ledger: [],
        openingBalance: 0,
        closingBalance: 0,
        error: 'No academic year configured',
      })
    })

    it('returns error when academic year has no id', async () => {
      mockInvoke.mockResolvedValueOnce({}) // no id
      const result = await api.getStudentLedgerReport(1)
      expect(result.error).toBe('No academic year configured')
    })

    it('returns error when ledger fetch fails', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 10 }) // academicYear:getCurrent
      mockInvoke.mockResolvedValueOnce({ success: false, error: 'Student not found' })
      const result = await api.getStudentLedgerReport(99)
      expect(result.error).toBe('Student not found')
    })

    it('returns error with default message when no error field', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 10 })
      mockInvoke.mockResolvedValueOnce({ success: false })
      const result = await api.getStudentLedgerReport(99)
      expect(result.error).toBe('Failed to generate student ledger')
    })

    it('returns error when success is true but data is missing', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 10 })
      mockInvoke.mockResolvedValueOnce({ success: true, data: undefined })
      const result = await api.getStudentLedgerReport(1)
      expect(result.error).toBe('Failed to generate student ledger')
    })

    it('transforms transactions correctly on success', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 10 }) // getCurrent
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: {
          student: { full_name: 'Jane Doe', admission_number: 'ADM001' },
          opening_balance: 1000,
          closing_balance: 500,
          transactions: [
            { date: '2024-01-15', debit: 2000, credit: 0, description: 'Tuition Fee', ref: 'INV001', balance: 3000 },
            { date: '2024-01-20', debit: 0, credit: 1500, description: 'Payment', balance: 1500 },
          ],
        },
      })

      const result = await api.getStudentLedgerReport(42)

      expect(mockInvoke).toHaveBeenCalledWith('reports:getStudentLedger', 42, 10, '1900-01-01', '2999-12-31')
      expect(result.student).toEqual({ full_name: 'Jane Doe', admission_number: 'ADM001' })
      expect(result.openingBalance).toBe(1000)
      expect(result.closingBalance).toBe(500)
      expect(result.ledger).toHaveLength(2)

      // Debit transaction
      expect(result.ledger[0]).toEqual({
        transaction_date: '2024-01-15',
        debit_credit: 'DEBIT',
        amount: 2000,
        description: 'Tuition Fee',
        ref: 'INV001',
        runningBalance: 3000,
      })

      // Credit transaction (no ref → empty string)
      expect(result.ledger[1]).toEqual({
        transaction_date: '2024-01-20',
        debit_credit: 'CREDIT',
        amount: 1500,
        description: 'Payment',
        ref: '',
        runningBalance: 1500,
      })
    })

    it('handles transaction with zero debit and zero credit', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 10 })
      mockInvoke.mockResolvedValueOnce({
        success: true,
        data: {
          student: { full_name: 'X', admission_number: 'Y' },
          opening_balance: 0,
          closing_balance: 0,
          transactions: [
            { date: '2024-01-01', debit: 0, credit: 0, description: 'Adjustment', balance: 0 },
          ],
        },
      })

      const result = await api.getStudentLedgerReport(1)
      // debit is 0, so debit_credit = 'CREDIT', amount = 0
      expect(result.ledger[0].debit_credit).toBe('CREDIT')
      expect(result.ledger[0].amount).toBe(0)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 4. system.ts – createSystemAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createSystemAPI', () => {
  const api = createSystemAPI()

  describe('Backup', () => {
    it('createBackup calls backup:create', async () => {
      await api.createBackup()
      expect(mockInvoke).toHaveBeenCalledWith('backup:create')
    })

    it('createBackupTo forwards filePath', async () => {
      // eslint-disable-next-line sonarjs/publicly-writable-directories
      await api.createBackupTo('/tmp/backup.db')
      // eslint-disable-next-line sonarjs/publicly-writable-directories
      expect(mockInvoke).toHaveBeenCalledWith('backup:createTo', '/tmp/backup.db')
    })

    it('restoreBackup forwards filePath', async () => {
      // eslint-disable-next-line sonarjs/publicly-writable-directories
      await api.restoreBackup('/tmp/backup.db')
      // eslint-disable-next-line sonarjs/publicly-writable-directories
      expect(mockInvoke).toHaveBeenCalledWith('backup:restore', '/tmp/backup.db')
    })

    it('getBackupList calls backup:getList', async () => {
      await api.getBackupList()
      expect(mockInvoke).toHaveBeenCalledWith('backup:getList')
    })

    it('openBackupFolder calls backup:openFolder', async () => {
      await api.openBackupFolder()
      expect(mockInvoke).toHaveBeenCalledWith('backup:openFolder')
    })
  })

  describe('Users', () => {
    it('getUsers calls user:getAll', async () => {
      await api.getUsers()
      expect(mockInvoke).toHaveBeenCalledWith('user:getAll')
    })

    it('createUser forwards data', async () => {
      const data = { username: 'admin', password: 'pass', full_name: 'Admin', email: 'a@b.com', role: 'ADMIN' } as any
      await api.createUser(data)
      expect(mockInvoke).toHaveBeenCalledWith('user:create', data)
    })

    it('updateUser forwards id and data', async () => {
      await api.updateUser(1, { full_name: 'New Name' } as any)
      expect(mockInvoke).toHaveBeenCalledWith('user:update', 1, { full_name: 'New Name' })
    })

    it('toggleUserStatus forwards id and isActive', async () => {
      await api.toggleUserStatus(3, false)
      expect(mockInvoke).toHaveBeenCalledWith('user:toggleStatus', 3, false)
    })

    it('resetUserPassword forwards id and newPassword', async () => {
      await api.resetUserPassword(3, 'newpass')
      expect(mockInvoke).toHaveBeenCalledWith('user:resetPassword', 3, 'newpass')
    })
  })

  describe('Approval Workflows', () => {
    it('getPendingApprovals forwards optional userId', async () => {
      await api.getPendingApprovals(5)
      expect(mockInvoke).toHaveBeenCalledWith('approval:getPending', 5)
    })

    it('getPendingApprovals works without userId', async () => {
      await api.getPendingApprovals()
      expect(mockInvoke).toHaveBeenCalledWith('approval:getPending', undefined)
    })

    it('getAllApprovals forwards filters', async () => {
      await api.getAllApprovals({ status: 'pending', entity_type: 'payment' })
      expect(mockInvoke).toHaveBeenCalledWith('approval:getAll', { status: 'pending', entity_type: 'payment' })
    })

    it('getApprovalCounts calls approval:getCounts', async () => {
      await api.getApprovalCounts()
      expect(mockInvoke).toHaveBeenCalledWith('approval:getCounts')
    })

    it('createApprovalRequest forwards entityType, entityId, userId', async () => {
      await api.createApprovalRequest('payment', 10, 1)
      expect(mockInvoke).toHaveBeenCalledWith('approval:create', 'payment', 10, 1)
    })

    it('approveRequest forwards requestId and approverId', async () => {
      await api.approveRequest(5, 1)
      expect(mockInvoke).toHaveBeenCalledWith('approval:approve', 5, 1)
    })

    it('rejectRequest forwards requestId, approverId, reason', async () => {
      await api.rejectRequest(5, 1, 'Too expensive')
      expect(mockInvoke).toHaveBeenCalledWith('approval:reject', 5, 1, 'Too expensive')
    })

    it('cancelApprovalRequest forwards requestId and userId', async () => {
      await api.cancelApprovalRequest(5, 1)
      expect(mockInvoke).toHaveBeenCalledWith('approval:cancel', 5, 1)
    })
  })

  describe('Data Import', () => {
    it('pickImportFile calls data:pickImportFile', async () => {
      await api.pickImportFile()
      expect(mockInvoke).toHaveBeenCalledWith('data:pickImportFile')
    })

    it('importData forwards token, config, userId', async () => {
      const config = { entityType: 'students', mapping: {} } as any
      await api.importData('token-123', config, 1)
      expect(mockInvoke).toHaveBeenCalledWith('data:import', 'token-123', config, 1)
    })

    it('getImportTemplate forwards entityType', async () => {
      await api.getImportTemplate('students')
      expect(mockInvoke).toHaveBeenCalledWith('data:getTemplate', 'students')
    })

    it('downloadImportTemplate forwards entityType', async () => {
      await api.downloadImportTemplate('staff')
      expect(mockInvoke).toHaveBeenCalledWith('data:downloadTemplate', 'staff')
    })
  })

  describe('Error Logging', () => {
    it('logError forwards error data', async () => {
      const data = { error: 'TypeError', stack: 'at line 1', componentStack: null, timestamp: '2024-01-01' }
      await api.logError(data)
      expect(mockInvoke).toHaveBeenCalledWith('system:logError', data)
    })
  })

  describe('Updates', () => {
    it('checkForUpdates calls check-for-updates', async () => {
      await api.checkForUpdates()
      expect(mockInvoke).toHaveBeenCalledWith('check-for-updates')
    })

    it('downloadUpdate calls download-update', async () => {
      await api.downloadUpdate()
      expect(mockInvoke).toHaveBeenCalledWith('download-update')
    })

    it('installUpdate calls install-update', async () => {
      await api.installUpdate()
      expect(mockInvoke).toHaveBeenCalledWith('install-update')
    })

    it('getUpdateStatus calls get-update-status', async () => {
      await api.getUpdateStatus()
      expect(mockInvoke).toHaveBeenCalledWith('get-update-status')
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 5. staff.ts – createStaffAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createStaffAPI', () => {
  const api = createStaffAPI()

  describe('Staff CRUD', () => {
    it('getStaff forwards activeOnly', async () => {
      await api.getStaff(true)
      expect(mockInvoke).toHaveBeenCalledWith('staff:getAll', true)
    })

    it('getStaff works without args', async () => {
      await api.getStaff()
      expect(mockInvoke).toHaveBeenCalledWith('staff:getAll', undefined)
    })

    it('getStaffById forwards id', async () => {
      await api.getStaffById(3)
      expect(mockInvoke).toHaveBeenCalledWith('staff:getById', 3)
    })

    it('createStaff forwards data', async () => {
      const data = { name: 'John', tsc_number: '123' } as any
      await api.createStaff(data)
      expect(mockInvoke).toHaveBeenCalledWith('staff:create', data)
    })

    it('updateStaff forwards id and data', async () => {
      await api.updateStaff(3, { name: 'Updated' } as any)
      expect(mockInvoke).toHaveBeenCalledWith('staff:update', 3, { name: 'Updated' })
    })

    it('setStaffActive forwards id and isActive', async () => {
      await api.setStaffActive(3, false)
      expect(mockInvoke).toHaveBeenCalledWith('staff:setActive', 3, false)
    })

    it('getStaffAllowances forwards staffId', async () => {
      await api.getStaffAllowances(5)
      expect(mockInvoke).toHaveBeenCalledWith('staff:getAllowances', 5)
    })

    it('addStaffAllowance forwards staffId, name, amount', async () => {
      await api.addStaffAllowance(5, 'Housing', 10000)
      expect(mockInvoke).toHaveBeenCalledWith('staff:addAllowance', 5, 'Housing', 10000)
    })

    it('deleteStaffAllowance forwards allowanceId', async () => {
      await api.deleteStaffAllowance(7)
      expect(mockInvoke).toHaveBeenCalledWith('staff:deleteAllowance', 7)
    })
  })

  describe('Payroll', () => {
    it('getPayrollHistory calls payroll:getHistory', async () => {
      await api.getPayrollHistory()
      expect(mockInvoke).toHaveBeenCalledWith('payroll:getHistory')
    })

    it('getPayrollDetails forwards periodId', async () => {
      await api.getPayrollDetails(12)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:getDetails', 12)
    })

    it('runPayroll forwards month, year, userId', async () => {
      await api.runPayroll(6, 2024, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:run', 6, 2024, 1)
    })

    it('confirmPayroll forwards periodId and userId', async () => {
      await api.confirmPayroll(12, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:confirm', 12, 1)
    })

    it('markPayrollPaid forwards periodId and userId', async () => {
      await api.markPayrollPaid(12, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:markPaid', 12, 1)
    })

    it('revertPayrollToDraft forwards periodId and userId', async () => {
      await api.revertPayrollToDraft(12, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:revertToDraft', 12, 1)
    })

    it('deletePayroll forwards periodId and userId', async () => {
      await api.deletePayroll(12, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:delete', 12, 1)
    })

    it('recalculatePayroll forwards periodId and userId', async () => {
      await api.recalculatePayroll(12, 1)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:recalculate', 12, 1)
    })

    it('generateP10Csv forwards periodId', async () => {
      await api.generateP10Csv(12)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:generateP10Csv', 12)
    })

    it('getPayrollIdsForPeriod forwards periodId', async () => {
      await api.getPayrollIdsForPeriod(12)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:getPayrollIdsForPeriod', 12)
    })

    it('generatePayslip forwards payrollId', async () => {
      await api.generatePayslip(55)
      expect(mockInvoke).toHaveBeenCalledWith('payroll:generatePayslip', 55)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6. students.ts – createStudentAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createStudentAPI', () => {
  const api = createStudentAPI()

  it('getStudents forwards filters', async () => {
    const filters = { classId: 5, search: 'Jane' } as any
    await api.getStudents(filters)
    expect(mockInvoke).toHaveBeenCalledWith('student:getAll', filters)
  })

  it('getStudents works without filters', async () => {
    await api.getStudents()
    expect(mockInvoke).toHaveBeenCalledWith('student:getAll', undefined)
  })

  it('getStudentById forwards id', async () => {
    await api.getStudentById(42)
    expect(mockInvoke).toHaveBeenCalledWith('student:getById', 42)
  })

  it('createStudent forwards data and optional userId', async () => {
    const data = { full_name: 'Jane' } as any
    await api.createStudent(data, 1)
    expect(mockInvoke).toHaveBeenCalledWith('student:create', data, 1)
  })

  it('createStudent works without userId', async () => {
    await api.createStudent({ full_name: 'Jane' } as any)
    expect(mockInvoke).toHaveBeenCalledWith('student:create', { full_name: 'Jane' }, undefined)
  })

  it('updateStudent forwards id and data', async () => {
    await api.updateStudent(42, { full_name: 'Updated' } as any)
    expect(mockInvoke).toHaveBeenCalledWith('student:update', 42, { full_name: 'Updated' })
  })

  it('uploadStudentPhoto forwards studentId and dataUrl', async () => {
    await api.uploadStudentPhoto(42, 'data:image/png;base64,...')
    expect(mockInvoke).toHaveBeenCalledWith('student:uploadPhoto', 42, 'data:image/png;base64,...')
  })

  it('removeStudentPhoto forwards studentId', async () => {
    await api.removeStudentPhoto(42)
    expect(mockInvoke).toHaveBeenCalledWith('student:removePhoto', 42)
  })

  it('getStudentPhotoDataUrl forwards studentId', async () => {
    await api.getStudentPhotoDataUrl(42)
    expect(mockInvoke).toHaveBeenCalledWith('student:getPhotoDataUrl', 42)
  })

  it('getStudentBalance forwards studentId', async () => {
    await api.getStudentBalance(42)
    expect(mockInvoke).toHaveBeenCalledWith('student:getBalance', 42)
  })

  it('purgeStudent forwards id and optional reason', async () => {
    await api.purgeStudent(42, 'Duplicate entry')
    expect(mockInvoke).toHaveBeenCalledWith('student:purge', 42, 'Duplicate entry')
  })

  it('purgeStudent works without reason', async () => {
    await api.purgeStudent(42)
    expect(mockInvoke).toHaveBeenCalledWith('student:purge', 42, undefined)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 7. communications.ts – createCommunicationsAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createCommunicationsAPI', () => {
  const api = createCommunicationsAPI()

  describe('Messaging', () => {
    it('sendSMS forwards options', async () => {
      const opts = { phone: '+254...', message: 'Hello' } as any
      await api.sendSMS(opts)
      expect(mockInvoke).toHaveBeenCalledWith('message:sendSms', opts)
    })

    it('sendEmail forwards options', async () => {
      const opts = { to: 'a@b.com', subject: 'Test', body: 'Hi' } as any
      await api.sendEmail(opts)
      expect(mockInvoke).toHaveBeenCalledWith('message:sendEmail', opts)
    })

    it('getMessageTemplates calls message:getTemplates', async () => {
      await api.getMessageTemplates()
      expect(mockInvoke).toHaveBeenCalledWith('message:getTemplates')
    })

    it('saveMessageTemplate forwards template', async () => {
      const template = { name: 'Fee Reminder', body: 'Dear {name}...' } as any
      await api.saveMessageTemplate(template)
      expect(mockInvoke).toHaveBeenCalledWith('message:saveTemplate', template)
    })

    it('getMessageLogs forwards limit', async () => {
      await api.getMessageLogs(100)
      expect(mockInvoke).toHaveBeenCalledWith('message:getLogs', 100)
    })

    it('getMessageLogs works without limit', async () => {
      await api.getMessageLogs()
      expect(mockInvoke).toHaveBeenCalledWith('message:getLogs', undefined)
    })
  })

  describe('Notifications', () => {
    it('reloadNotificationConfig calls notifications:reloadConfig', async () => {
      await api.reloadNotificationConfig()
      expect(mockInvoke).toHaveBeenCalledWith('notifications:reloadConfig')
    })

    it('sendNotification forwards request and userId', async () => {
      const req = { type: 'sms', recipientId: 5 } as any
      await api.sendNotification(req, 1)
      expect(mockInvoke).toHaveBeenCalledWith('notifications:send', req, 1)
    })

    it('sendBulkFeeReminders forwards templateId, defaulters, userId', async () => {
      const defaulters = [{ studentId: 1, amount: 5000 }] as any
      await api.sendBulkFeeReminders(10, defaulters, 1)
      expect(mockInvoke).toHaveBeenCalledWith('notifications:sendBulkFeeReminders', 10, defaulters, 1)
    })

    it('getNotificationTemplates calls notifications:getTemplates', async () => {
      await api.getNotificationTemplates()
      expect(mockInvoke).toHaveBeenCalledWith('notifications:getTemplates')
    })

    it('createNotificationTemplate forwards template and userId', async () => {
      const template = { name: 'reminder', channel: 'sms' } as any
      await api.createNotificationTemplate(template, 1)
      expect(mockInvoke).toHaveBeenCalledWith('notifications:createTemplate', template, 1)
    })

    it('getDefaultTemplates calls notifications:getDefaultTemplates', async () => {
      await api.getDefaultTemplates()
      expect(mockInvoke).toHaveBeenCalledWith('notifications:getDefaultTemplates')
    })

    it('getNotificationHistory forwards filters', async () => {
      const filters = { channel: 'sms', from: '2024-01-01' } as any
      await api.getNotificationHistory(filters)
      expect(mockInvoke).toHaveBeenCalledWith('notifications:getHistory', filters)
    })

    it('getNotificationHistory works without filters', async () => {
      await api.getNotificationHistory()
      expect(mockInvoke).toHaveBeenCalledWith('notifications:getHistory', undefined)
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 8. auth.ts – createAuthAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createAuthAPI', () => {
  const api = createAuthAPI()

  it('login forwards username and password', async () => {
    await api.login('admin', 'pass123')
    expect(mockInvoke).toHaveBeenCalledWith('auth:login', 'admin', 'pass123')
  })

  it('changePassword forwards userId, oldPassword, newPassword', async () => {
    await api.changePassword(1, 'old', 'new')
    expect(mockInvoke).toHaveBeenCalledWith('auth:changePassword', 1, 'old', 'new')
  })

  it('hasUsers calls auth:hasUsers', async () => {
    await api.hasUsers()
    expect(mockInvoke).toHaveBeenCalledWith('auth:hasUsers')
  })

  it('setupAdmin forwards data', async () => {
    const data = { username: 'admin', password: 'pass', full_name: 'Admin', email: 'admin@school.co.ke' }
    await api.setupAdmin(data)
    expect(mockInvoke).toHaveBeenCalledWith('auth:setupAdmin', data)
  })

  it('getSession calls auth:getSession', async () => {
    await api.getSession()
    expect(mockInvoke).toHaveBeenCalledWith('auth:getSession')
  })

  it('setSession forwards session data', async () => {
    const session = { user: { id: 1, role: 'ADMIN' } } as any
    await api.setSession(session)
    expect(mockInvoke).toHaveBeenCalledWith('auth:setSession', session)
  })

  it('clearSession calls auth:clearSession', async () => {
    await api.clearSession()
    expect(mockInvoke).toHaveBeenCalledWith('auth:clearSession')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 9. settings.ts – createSettingsAPI
// ═══════════════════════════════════════════════════════════════════════════
describe('createSettingsAPI', () => {
  const api = createSettingsAPI()

  it('getSettings calls settings:get', async () => {
    await api.getSettings()
    expect(mockInvoke).toHaveBeenCalledWith('settings:get')
  })

  it('getSchoolSettings is an alias that calls settings:get', async () => {
    await api.getSchoolSettings()
    expect(mockInvoke).toHaveBeenCalledWith('settings:get')
  })

  it('updateSettings forwards data', async () => {
    const data = { school_name: 'Test School' } as any
    await api.updateSettings(data)
    expect(mockInvoke).toHaveBeenCalledWith('settings:update', data)
  })

  it('uploadLogo forwards dataUrl', async () => {
    await api.uploadLogo('data:image/png;base64,...')
    expect(mockInvoke).toHaveBeenCalledWith('settings:uploadLogo', 'data:image/png;base64,...')
  })

  it('removeLogo calls settings:removeLogo', async () => {
    await api.removeLogo()
    expect(mockInvoke).toHaveBeenCalledWith('settings:removeLogo')
  })

  it('getLogoDataUrl calls settings:getLogoDataUrl', async () => {
    await api.getLogoDataUrl()
    expect(mockInvoke).toHaveBeenCalledWith('settings:getLogoDataUrl')
  })

  it('getAllConfigs calls settings:getAllConfigs', async () => {
    await api.getAllConfigs()
    expect(mockInvoke).toHaveBeenCalledWith('settings:getAllConfigs')
  })

  it('getSecureConfig forwards key', async () => {
    await api.getSecureConfig('SMS_API_KEY')
    expect(mockInvoke).toHaveBeenCalledWith('settings:getSecure', 'SMS_API_KEY')
  })

  it('saveSecureConfig forwards key and value', async () => {
    await api.saveSecureConfig('SMS_API_KEY', 'secret123')
    expect(mockInvoke).toHaveBeenCalledWith('settings:saveSecure', 'SMS_API_KEY', 'secret123')
  })

  it('resetAndSeedDatabase forwards userId', async () => {
    await api.resetAndSeedDatabase(1)
    expect(mockInvoke).toHaveBeenCalledWith('system:resetAndSeed', 1)
  })

  it('normalizeCurrencyScale forwards userId', async () => {
    await api.normalizeCurrencyScale(1)
    expect(mockInvoke).toHaveBeenCalledWith('system:normalizeCurrencyScale', 1)
  })

  it('seedExams calls system:seedExams', async () => {
    await api.seedExams()
    expect(mockInvoke).toHaveBeenCalledWith('system:seedExams')
  })
})
