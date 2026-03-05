import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const runMock = vi.fn()
  const prepareMock = vi.fn(() => ({ run: runMock }))
  return {
    runMock,
    prepareMock,
    getDatabase: vi.fn(() => ({ prepare: prepareMock })),
  }
})

vi.mock('../../index', () => ({
  getDatabase: mocks.getDatabase,
}))

import { logAudit } from '../audit'

describe('database/utils/audit – logAudit', () => {
  beforeEach(() => {
    mocks.runMock.mockReset()
    mocks.prepareMock.mockReset()
    mocks.prepareMock.mockReturnValue({ run: mocks.runMock })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('inserts audit log with all fields', () => {
    logAudit(1, 'INSERT', 'students', 42, null, { name: 'New Student' })

    expect(mocks.prepareMock).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO audit_log'))
    expect(mocks.runMock).toHaveBeenCalledWith(
      1, 'INSERT', 'students', 42,
      null,
      JSON.stringify({ name: 'New Student' })
    )
  })

  it('serializes both old and new values as JSON', () => {
    const oldValues = { name: 'Old Name', grade: 5 }
    const newValues = { name: 'New Name', grade: 6 }
    logAudit(2, 'UPDATE', 'students', 10, oldValues, newValues)

    expect(mocks.runMock).toHaveBeenCalledWith(
      2, 'UPDATE', 'students', 10,
      JSON.stringify(oldValues),
      JSON.stringify(newValues)
    )
  })

  it('passes null when both old and new values are null', () => {
    logAudit(3, 'DELETE', 'invoices', 99, null, null)

    expect(mocks.runMock).toHaveBeenCalledWith(
      3, 'DELETE', 'invoices', 99, null, null
    )
  })

  it('handles null recordId', () => {
    logAudit(1, 'LOGIN', 'sessions', null, null, null)

    expect(mocks.runMock).toHaveBeenCalledWith(
      1, 'LOGIN', 'sessions', null, null, null
    )
  })

  it('catches database errors without throwing', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.prepareMock.mockImplementation(() => { throw new Error('DB error') })

    expect(() => logAudit(1, 'INSERT', 'test', 1, null, null)).not.toThrow()
    expect(consoleSpy).toHaveBeenCalledWith('Failed to log audit:', expect.any(Error))
  })

  it('calls getDatabase to obtain database reference', () => {
    logAudit(1, 'INSERT', 'test', 1, null, null)
    expect(mocks.getDatabase).toHaveBeenCalled()
  })

  it('serializes complex nested objects correctly', () => {
    const complex = { items: [{ id: 1, amount: 100 }], meta: { source: 'api' } }
    logAudit(1, 'UPDATE', 'orders', 5, null, complex)

    expect(mocks.runMock).toHaveBeenCalledWith(
      1, 'UPDATE', 'orders', 5,
      null,
      JSON.stringify(complex)
    )
  })

  it('handles empty object values (serialized as "{}")', () => {
    logAudit(1, 'UPDATE', 'config', 1, {}, {})

    expect(mocks.runMock).toHaveBeenCalledWith(
      1, 'UPDATE', 'config', 1,
      JSON.stringify({}),
      JSON.stringify({})
    )
  })
})
