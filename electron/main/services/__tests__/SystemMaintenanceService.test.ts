import { beforeEach, describe, expect, it, vi } from 'vitest'

const recordInvoiceMock = vi.fn()
const recordPaymentMock = vi.fn()
const createJournalEntryMock = vi.fn()

vi.mock('../accounting/DoubleEntryJournalService', () => ({
  DoubleEntryJournalService: class DoubleEntryJournalServiceMock {
    recordInvoice = recordInvoiceMock
    recordPayment = recordPaymentMock
    createJournalEntry = createJournalEntryMock
  }
}))

vi.mock('../maintenance/CurrencyNormalizationService', () => ({
  CurrencyNormalizationService: class CurrencyNormalizationServiceMock {
    normalize = vi.fn().mockResolvedValue({ success: true })
  }
}))

import { SystemMaintenanceService } from '../SystemMaintenanceService'

type FakePreparedStatement = {
  all: () => unknown[]
}

type FakeDb = {
  prepare: (sql: string) => FakePreparedStatement
}

describe('SystemMaintenanceService', () => {
  beforeEach(() => {
    recordInvoiceMock.mockReset()
    recordPaymentMock.mockReset()
    createJournalEntryMock.mockReset()
    recordPaymentMock.mockResolvedValue({ success: true, entry_id: 10 })
    recordInvoiceMock.mockResolvedValue({ success: true })
    createJournalEntryMock.mockResolvedValue({ success: true })
  })

  it('does not throw when no fee payments exist during journal seeding', async () => {
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fakeDb: FakeDb = {
      prepare: (_sql: string) => ({
        all: () => []
      })
    }

    const service = new SystemMaintenanceService()
    const invokeSeedJournalEntries = service as unknown as {
      seedJournalEntries: (db: FakeDb, userId: number) => Promise<void>
    }

    await expect(invokeSeedJournalEntries.seedJournalEntries(fakeDb, 2)).resolves.toBeUndefined()
    expect(recordPaymentMock).not.toHaveBeenCalled()
    expect(warningSpy).toHaveBeenCalledWith(
      'No fee payment transactions found while seeding journal entries; skipping payment journal posting.'
    )

    warningSpy.mockRestore()
  })
})
