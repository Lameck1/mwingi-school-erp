import Database from 'better-sqlite3'
import * as ExcelJS from 'exceljs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImportConfig, ImportMapping } from '../DataImportService'

let db: Database.Database
const logAuditMock = vi.fn()

vi.mock('../../../database', () => ({
  getDatabase: () => db
}))

vi.mock('../../../database/utils/audit', () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args)
}))

import { DataImportService } from '../DataImportService'

type DataImportServiceInternals = {
  applyMappingTransform: (mapping: ImportMapping, value: unknown) => { value: unknown; error?: string }
  checkDuplicate: (entityType: string, keyField: string, value: unknown) => boolean
  collectMappingErrors: (mapping: ImportMapping, value: unknown) => string[]
  getTableName: (entityType: string) => string
  insertRecord: (entityType: string, data: Record<string, unknown>, userId: number) => void
  resolveSourceValue: (row: Record<string, unknown>, sourceColumn: string) => unknown
}

function createSchema(targetDb: Database.Database): void {
  targetDb.exec(`
    CREATE TABLE student (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admission_number TEXT UNIQUE,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      date_of_birth TEXT,
      gender TEXT,
      student_type TEXT,
      admission_date TEXT,
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      address TEXT
    );

    CREATE TABLE staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_number TEXT UNIQUE,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      id_number TEXT,
      kra_pin TEXT,
      phone TEXT,
      email TEXT,
      department TEXT,
      job_title TEXT,
      employment_date TEXT,
      basic_salary REAL,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE fee_structure (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER,
      term_id INTEGER,
      stream_id INTEGER,
      student_type TEXT,
      fee_category_id INTEGER,
      amount REAL,
      description TEXT
    );

    CREATE TABLE inventory_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_code TEXT UNIQUE,
      item_name TEXT,
      category_id INTEGER,
      unit_of_measure TEXT,
      current_stock REAL,
      reorder_level REAL,
      unit_cost REAL
    );
  `)
}

function csvBuffer(value: string): Buffer {
  return Buffer.from(value, 'utf8')
}

function studentImportConfig(overrides: Partial<ImportConfig> = {}): ImportConfig {
  const base: ImportConfig = {
    entityType: 'STUDENT',
    mappings: [
      { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
      { sourceColumn: 'First Name', targetField: 'first_name', required: true },
      { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
      { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
      { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
      { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true }
    ]
  }
  return { ...base, ...overrides }
}

async function buildWorkbookBuffer(rows: Array<Record<string, string>>): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  const headers = Object.keys(rows[0] ?? {})

  if (headers.length > 0) {
    sheet.addRow(headers)
    for (const row of rows) {
      sheet.addRow(headers.map((key) => row[key] ?? ''))
    }
  }

  const result = await workbook.xlsx.writeBuffer()
  return Buffer.from(result)
}

describe('DataImportService', () => {
  beforeEach(() => {
    logAuditMock.mockReset()
    db = new Database(':memory:')
    createSchema(db)
  })

  it('returns unsupported format errors for unknown extensions and parse failures', async () => {
    const service = new DataImportService()

    const unsupported = await service.importFromFile(csvBuffer('a,b\n1,2'), 'input.txt', studentImportConfig(), 7)
    expect(unsupported.success).toBe(false)
    expect(unsupported.errors[0]?.message).toContain('Unsupported file format')

    const parseFailure = await service.importFromFile(csvBuffer('"Admission Number"\n"ADM-001'), 'input.csv', studentImportConfig(), 7)
    expect(parseFailure.success).toBe(false)
    expect(parseFailure.errors[0]?.message).toContain('File parsing error')
  })

  it('rejects empty files and missing required source columns', async () => {
    const service = new DataImportService()

    const emptyRows = await service.importFromFile(csvBuffer('Admission Number,First Name\n'), 'students.csv', studentImportConfig(), 3)
    expect(emptyRows.success).toBe(false)
    expect(emptyRows.errors[0]?.message).toContain('No data rows found')

    const missingColumns = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name\nADM-1,Grace,Mutua\n'),
      'students.csv',
      studentImportConfig(),
      3
    )
    expect(missingColumns.success).toBe(false)
    expect(missingColumns.errors[0]?.message).toContain('Required column')
  })

  it('imports student rows, skips duplicates, and audits outcomes', async () => {
    db.prepare(`
      INSERT INTO student (admission_number, first_name, last_name, date_of_birth, guardian_name, guardian_phone)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('ADM-001', 'Existing', 'Student', '2010-01-01', 'Parent', '0700000000')

    const service = new DataImportService()
    const config = studentImportConfig({ skipDuplicates: true, duplicateKey: 'admission_number' })

    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-001,Grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'students.csv',
      config,
      9
    )

    expect(result.success).toBe(true)
    expect(result.imported).toBe(0)
    expect(result.skipped).toBe(1)
    expect(result.errors).toHaveLength(0)
    expect(logAuditMock).toHaveBeenCalledWith(
      9,
      'IMPORT',
      'student',
      null,
      null,
      expect.objectContaining({ total_rows: 1, imported: 0, skipped: 1 })
    )
  })

  it('captures row-level errors from transform/validation hooks and duplicate key validation', async () => {
    const service = new DataImportService()

    const transformFailureConfig: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        {
          sourceColumn: 'Admission Number',
          targetField: 'admission_number',
          transform: () => {
            throw new Error('bad transform')
          },
          required: true
        },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true }
      ],
      validate: () => ['custom row validation failed']
    }

    const transformFailure = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-777,Grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'students.csv',
      transformFailureConfig,
      11
    )
    expect(transformFailure.success).toBe(false)
    expect(transformFailure.skipped).toBe(1)
    expect(transformFailure.errors[0]?.message).toContain('Transform failed')
    expect(transformFailure.errors[0]?.message).toContain('custom row validation failed')

    const duplicateKeyInjection = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-888,Grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'students.csv',
      studentImportConfig({ skipDuplicates: true, duplicateKey: 'admission_number;DROP' }),
      11
    )
    expect(duplicateKeyInjection.success).toBe(false)
    expect(duplicateKeyInjection.skipped).toBe(1)
    expect(duplicateKeyInjection.errors[0]?.message).toContain('Invalid key field name')
  })

  it('imports from excel and sanitizes formula-prefixed strings', async () => {
    const service = new DataImportService()
    const file = await buildWorkbookBuffer([
      {
        'Admission Number': '=ADM-321',
        'First Name': 'Grace',
        'Last Name': 'Mutua',
        'Date of Birth': '2011-01-02',
        'Guardian Name': 'Jane',
        'Guardian Phone': '0712345678'
      }
    ])

    const result = await service.importFromFile(file, 'students.xlsx', studentImportConfig(), 5)
    expect(result.success).toBe(true)
    expect(result.imported).toBe(1)

    const inserted = db.prepare('SELECT admission_number FROM student ORDER BY id DESC LIMIT 1').get() as { admission_number: string } | undefined
    expect(inserted?.admission_number).toBe('ADM-321')
  })

  it('supports templates for known entity types and generated workbooks', async () => {
    const service = new DataImportService()

    const studentTemplate = service.getImportTemplate('STUDENT')
    const staffTemplate = service.getImportTemplate('STAFF')
    const inventoryTemplate = service.getImportTemplate('INVENTORY')
    const unknownTemplate = service.getImportTemplate('UNKNOWN')

    expect(studentTemplate.columns.length).toBeGreaterThan(0)
    expect(staffTemplate.columns.length).toBeGreaterThan(0)
    expect(inventoryTemplate.columns.length).toBeGreaterThan(0)
    expect(unknownTemplate.columns).toEqual([])

    const templateWorkbook = await service.generateTemplateFile('STUDENT')
    expect(templateWorkbook.length).toBeGreaterThan(0)
  })

  it('covers private helper branches for mapping, duplicate checks, and unsupported entities', () => {
    db.prepare(`
      INSERT INTO staff (staff_number, first_name, last_name, job_title, basic_salary)
      VALUES (?, ?, ?, ?, ?)
    `).run('ST-001', 'Rose', 'Akinyi', 'Teacher', 1000)

    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals

    expect(internal.getTableName('STUDENT')).toBe('student')
    expect(internal.getTableName('CUSTOM_ENTITY')).toBe('custom_entity')

    expect(internal.resolveSourceValue({ ' First Name ': 'Joy' }, 'first name')).toBe('Joy')
    expect(internal.resolveSourceValue({}, 'missing')).toBeUndefined()

    const transformed = internal.applyMappingTransform(
      { sourceColumn: 'A', targetField: 'a', transform: (value) => String(value).toUpperCase() },
      'abc'
    )
    expect(transformed).toEqual({ value: 'ABC' })
    const transformError = internal.applyMappingTransform(
      { sourceColumn: 'A', targetField: 'a', transform: () => { throw new Error('x') } },
      'abc'
    )
    expect(transformError.error).toContain('Transform failed')

    const mappingErrors = internal.collectMappingErrors(
      {
        sourceColumn: 'Phone',
        targetField: 'phone',
        required: true,
        validation: () => 'must be valid'
      },
      ''
    )
    expect(mappingErrors).toEqual(['must be valid', 'Phone is required'])

    expect(() => internal.checkDuplicate('STAFF', 'staff_number;', 'ST-001')).toThrow('Invalid key field name')
    expect(() => internal.checkDuplicate('BAD-TABLE', 'staff_number', 'ST-001')).toThrow('Invalid table name')

    expect(() => internal.insertRecord('BANK_STATEMENT', {}, 1)).toThrow('Unsupported entity type')
  })

  it('imports staff, fee structure, and inventory records through entity dispatch', async () => {
    const service = new DataImportService()

    const staffConfig: ImportConfig = {
      entityType: 'STAFF',
      mappings: [
        { sourceColumn: 'Staff Number', targetField: 'staff_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Job Title', targetField: 'job_title', required: true }
      ]
    }
    const staffResult = await service.importFromFile(
      csvBuffer('Staff Number,First Name,Last Name,Job Title\nST-321,Rose,Akinyi,Teacher\n'),
      'staff.csv',
      staffConfig,
      2
    )
    expect(staffResult.success).toBe(true)

    const feeConfig: ImportConfig = {
      entityType: 'FEE_STRUCTURE',
      mappings: [
        { sourceColumn: 'Academic Year ID', targetField: 'academic_year_id', required: true },
        { sourceColumn: 'Term ID', targetField: 'term_id', required: true },
        { sourceColumn: 'Stream ID', targetField: 'stream_id', required: true },
        { sourceColumn: 'Fee Category ID', targetField: 'fee_category_id', required: true },
        { sourceColumn: 'Amount', targetField: 'amount', required: true }
      ]
    }
    const feeResult = await service.importFromFile(
      csvBuffer('Academic Year ID,Term ID,Stream ID,Fee Category ID,Amount\n1,1,1,1,12000\n'),
      'fees.csv',
      feeConfig,
      2
    )
    expect(feeResult.success).toBe(true)

    const inventoryConfig: ImportConfig = {
      entityType: 'INVENTORY',
      mappings: [
        { sourceColumn: 'Item Code', targetField: 'item_code', required: true },
        { sourceColumn: 'Item Name', targetField: 'item_name', required: true },
        { sourceColumn: 'Category ID', targetField: 'category_id', required: true }
      ]
    }
    const inventoryResult = await service.importFromFile(
      csvBuffer('Item Code,Item Name,Category ID\nINV-10,Printer Paper,1\n'),
      'inventory.csv',
      inventoryConfig,
      2
    )
    expect(inventoryResult.success).toBe(true)
  })
})
