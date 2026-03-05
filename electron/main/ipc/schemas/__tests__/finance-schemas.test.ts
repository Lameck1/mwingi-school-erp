/**
 * Zod schema tests for the finance domain.
 *
 * Validates boundary contracts between frontend payloads and the IPC layer.
 */
import { describe, expect, it } from 'vitest'
import {
  DateStringSchema,
  FiscalYearSchema,
  PositiveIntSchema,
  CashFlowTuple,
  ForecastSchema,
  GLAccountFiltersSchema,
  GLAccountDataSchema,
  CreateGLAccountTuple,
  UpdateGLAccountTuple,
  DeleteGLAccountTuple,
  PeriodStatusSchema,
  BudgetFilterSchema,
  CreateBudgetSchema,
  CreateBudgetTuple,
  FixedAssetFilterSchema,
  FixedAssetCreateSchema,
  StudentOpeningBalanceSchema,
  GLOpeningBalanceSchema,
  RejectFinancialRequestTuple,
  GetApprovalQueueTuple,
} from '../finance-schemas'

/* ================================================================== */
/*  Shared primitives                                                  */
/* ================================================================== */
describe('DateStringSchema', () => {
  it('accepts valid YYYY-MM-DD', () => {
    expect(DateStringSchema.parse('2024-01-15')).toBe('2024-01-15')
  })
  it.each(['2024-1-15', '01-15-2024', '2024/01/15', '', 'not-a-date'])(
    'rejects %s',
    (v) => expect(() => DateStringSchema.parse(v)).toThrow(),
  )
})

describe('FiscalYearSchema', () => {
  it('accepts year in range', () => expect(FiscalYearSchema.parse(2025)).toBe(2025))
  it('rejects below 2000', () => expect(() => FiscalYearSchema.parse(1999)).toThrow())
  it('rejects above 2100', () => expect(() => FiscalYearSchema.parse(2101)).toThrow())
  it('rejects float', () => expect(() => FiscalYearSchema.parse(2025.5)).toThrow())
})

describe('PositiveIntSchema', () => {
  it('accepts 1', () => expect(PositiveIntSchema.parse(1)).toBe(1))
  it('rejects 0', () => expect(() => PositiveIntSchema.parse(0)).toThrow())
  it('rejects negative', () => expect(() => PositiveIntSchema.parse(-1)).toThrow())
})

/* ================================================================== */
/*  CashFlow / Forecast                                                */
/* ================================================================== */
describe('CashFlowTuple', () => {
  it('accepts two date strings', () => {
    const r = CashFlowTuple.parse(['2024-01-01', '2024-12-31'])
    expect(r).toEqual(['2024-01-01', '2024-12-31'])
  })
  it('rejects bad dates', () => {
    expect(() => CashFlowTuple.parse(['bad', '2024-12-31'])).toThrow()
  })
})

describe('ForecastSchema', () => {
  it('accepts positive int', () => expect(ForecastSchema.parse(12)).toBe(12))
  it('rejects 0', () => expect(() => ForecastSchema.parse(0)).toThrow())
})

/* ================================================================== */
/*  GL Account schemas                                                 */
/* ================================================================== */
describe('GLAccountFiltersSchema', () => {
  it('accepts undefined', () => expect(GLAccountFiltersSchema.parse(void 0)).toBeUndefined())
  it('accepts empty object', () => {
    expect(GLAccountFiltersSchema.parse({})).toEqual({})
  })
  it('accepts type + is_active', () => {
    const r = GLAccountFiltersSchema.parse({ type: 'ASSET', is_active: true })
    expect(r).toEqual({ type: 'ASSET', is_active: true })
  })
})

describe('GLAccountDataSchema', () => {
  const valid = { account_code: '1000', account_name: 'Cash', account_type: 'ASSET' as const }

  it('accepts minimal valid data', () => {
    expect(GLAccountDataSchema.parse(valid)).toMatchObject(valid)
  })
  it('accepts INCOME as account_type', () => {
    expect(GLAccountDataSchema.parse({ ...valid, account_type: 'INCOME' })).toBeDefined()
  })
  it('rejects empty account_code', () => {
    expect(() => GLAccountDataSchema.parse({ ...valid, account_code: '' })).toThrow()
  })
  it('rejects invalid account_type', () => {
    expect(() => GLAccountDataSchema.parse({ ...valid, account_type: 'FOO' })).toThrow()
  })
  it('accepts is_active as 0 or 1', () => {
    expect(GLAccountDataSchema.parse({ ...valid, is_active: 0 })).toBeDefined()
    expect(GLAccountDataSchema.parse({ ...valid, is_active: 1 })).toBeDefined()
  })
})

describe('CreateGLAccountTuple', () => {
  it('accepts data + optional legacyUserId', () => {
    const r = CreateGLAccountTuple.parse([
      { account_code: '2000', account_name: 'AP', account_type: 'LIABILITY' },
      42,
    ])
    expect(r[1]).toBe(42)
  })
  it('accepts data alone (no legacyUserId)', () => {
    const r = CreateGLAccountTuple.parse([
      { account_code: '2000', account_name: 'AP', account_type: 'LIABILITY' },
    ])
    expect(r[1]).toBeUndefined()
  })
})

describe('UpdateGLAccountTuple', () => {
  it('accepts id + partial data', () => {
    const r = UpdateGLAccountTuple.parse([1, { account_name: 'New' }])
    expect(r[0]).toBe(1)
  })
  it('rejects id = 0', () => {
    expect(() => UpdateGLAccountTuple.parse([0, {}])).toThrow()
  })
})

describe('DeleteGLAccountTuple', () => {
  it('parses id alone', () => {
    const r = DeleteGLAccountTuple.parse([5])
    expect(r[0]).toBe(5)
  })
  it('parses id + userId', () => {
    expect(DeleteGLAccountTuple.parse([5, 2])).toEqual([5, 2])
  })
})

/* ================================================================== */
/*  Period Locking                                                     */
/* ================================================================== */
describe('PeriodStatusSchema', () => {
  it('defaults to undefined', () => expect(PeriodStatusSchema.parse(void 0)).toBeUndefined())
  it.each(['OPEN', 'LOCKED', 'CLOSED'])('accepts %s', (s) => {
    expect(PeriodStatusSchema.parse(s)).toBe(s)
  })
  it('rejects invalid', () => expect(() => PeriodStatusSchema.parse('BAD')).toThrow())
})

/* ================================================================== */
/*  Budget schemas                                                     */
/* ================================================================== */
describe('BudgetFilterSchema', () => {
  it('accepts undefined', () => expect(BudgetFilterSchema.parse(void 0)).toBeUndefined())
  it('accepts status filter', () => {
    expect(BudgetFilterSchema.parse({ status: 'DRAFT' })).toEqual({ status: 'DRAFT' })
  })
})

describe('CreateBudgetSchema', () => {
  const validBudget = {
    budget_name: 'Q1 2025',
    academic_year_id: 1,
    line_items: [{ category_id: 1, description: 'Books', budgeted_amount: 5000 }],
  }

  it('accepts valid budget', () => {
    expect(CreateBudgetSchema.parse(validBudget)).toMatchObject(validBudget)
  })
  it('rejects empty budget_name', () => {
    expect(() => CreateBudgetSchema.parse({ ...validBudget, budget_name: '' })).toThrow()
  })
  it('rejects empty line_items', () => {
    expect(() => CreateBudgetSchema.parse({ ...validBudget, line_items: [] })).toThrow()
  })
  it('rejects negative budgeted_amount', () => {
    expect(() => CreateBudgetSchema.parse({
      ...validBudget,
      line_items: [{ category_id: 1, description: 'X', budgeted_amount: -100 }],
    })).toThrow()
  })
  it('accepts zero budgeted_amount (nonnegative)', () => {
    const r = CreateBudgetSchema.parse({
      ...validBudget,
      line_items: [{ category_id: 1, description: 'X', budgeted_amount: 0 }],
    })
    expect(r.line_items[0].budgeted_amount).toBe(0)
  })
})

describe('CreateBudgetTuple', () => {
  it('accepts budget + optional legacyUserId', () => {
    const r = CreateBudgetTuple.parse([
      { budget_name: 'B', academic_year_id: 1, line_items: [{ category_id: 1, description: 'X', budgeted_amount: 0 }] },
    ])
    expect(r[1]).toBeUndefined()
  })
})

/* ================================================================== */
/*  Fixed Asset schemas                                                */
/* ================================================================== */
describe('FixedAssetFilterSchema', () => {
  it('accepts undefined', () => expect(FixedAssetFilterSchema.parse(void 0)).toBeUndefined())
  it('accepts status filter', () => {
    expect(FixedAssetFilterSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' })
  })
  it('rejects invalid status', () => {
    expect(() => FixedAssetFilterSchema.parse({ status: 'INVALID' })).toThrow()
  })
})

describe('FixedAssetCreateSchema', () => {
  const validAsset = {
    asset_name: 'Laptop',
    category_id: 1,
    acquisition_date: '2024-06-15',
    acquisition_cost: 1500,
  }

  it('accepts minimal valid asset', () => {
    expect(FixedAssetCreateSchema.parse(validAsset)).toMatchObject(validAsset)
  })
  it('rejects empty asset_name', () => {
    expect(() => FixedAssetCreateSchema.parse({ ...validAsset, asset_name: '' })).toThrow()
  })
  it('rejects zero acquisition_cost', () => {
    expect(() => FixedAssetCreateSchema.parse({ ...validAsset, acquisition_cost: 0 })).toThrow()
  })
  it('rejects bad acquisition_date', () => {
    expect(() => FixedAssetCreateSchema.parse({ ...validAsset, acquisition_date: 'bad' })).toThrow()
  })
  it('accepts optional fields', () => {
    const r = FixedAssetCreateSchema.parse({
      ...validAsset,
      description: 'Dev laptop',
      serial_number: 'SN123',
      location: 'Office A',
    })
    expect(r.description).toBe('Dev laptop')
  })
})

/* ================================================================== */
/*  Opening Balance schemas                                            */
/* ================================================================== */
describe('StudentOpeningBalanceSchema', () => {
  it('accepts valid data', () => {
    const r = StudentOpeningBalanceSchema.parse({
      student_id: 1,
      opening_balance: 5000,
      balance_type: 'DEBIT',
    })
    expect(r.balance_type).toBe('DEBIT')
  })
  it('rejects invalid balance_type', () => {
    expect(() => StudentOpeningBalanceSchema.parse({
      student_id: 1, opening_balance: 0, balance_type: 'NONE',
    })).toThrow()
  })
})

describe('GLOpeningBalanceSchema', () => {
  it('accepts valid', () => {
    const r = GLOpeningBalanceSchema.parse({
      gl_account_code: '1000',
      debit_amount: 100,
      credit_amount: 0,
      academic_year_id: 1,
    })
    expect(r.gl_account_code).toBe('1000')
  })
  it('trims whitespace from gl_account_code', () => {
    const r = GLOpeningBalanceSchema.parse({
      gl_account_code: '  1000  ',
      debit_amount: 0,
      credit_amount: 0,
      academic_year_id: 1,
    })
    expect(r.gl_account_code).toBe('1000')
  })
  it('rejects negative amounts', () => {
    expect(() => GLOpeningBalanceSchema.parse({
      gl_account_code: '1000',
      debit_amount: -1,
      credit_amount: 0,
      academic_year_id: 1,
    })).toThrow()
  })
})

/* ================================================================== */
/*  Finance Approval schemas                                           */
/* ================================================================== */
describe('RejectFinancialRequestTuple', () => {
  it('requires review notes', () => {
    expect(() => RejectFinancialRequestTuple.parse([1, ''])).toThrow()
  })
  it('accepts id + notes + optional userId', () => {
    const r = RejectFinancialRequestTuple.parse([1, 'Not approved'])
    expect(r[1]).toBe('Not approved')
  })
})

describe('GetApprovalQueueTuple', () => {
  it('defaults to PENDING', () => {
    const r = GetApprovalQueueTuple.parse([undefined])
    expect(r[0]).toBe('PENDING')
  })
  it('accepts ALL', () => {
    expect(GetApprovalQueueTuple.parse(['ALL'])[0]).toBe('ALL')
  })
})
