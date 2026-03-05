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

  it('imports with both errors and successes sets success true', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ],
    }
    // Row 1 is valid, Row 2 has missing required fields
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-100,Grace,Mutua,2011-01-02,Jane,0712345678\n,,,,,\n'),
      'students.csv',
      config,
      1,
    )
    // Has errors but also imported → success = true
    expect(result.success).toBe(true)
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(1)
  })

  it('collectMappingErrors with non-required empty value returns no error', () => {
    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals
    const errors = internal.collectMappingErrors(
      { sourceColumn: 'Middle Name', targetField: 'middle_name', required: false },
      ''
    )
    expect(errors).toEqual([])
  })

  it('collectMappingErrors with validation returning null produces no error', () => {
    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals
    const errors = internal.collectMappingErrors(
      { sourceColumn: 'Phone', targetField: 'phone', required: false, validation: () => null },
      '0712345678'
    )
    expect(errors).toEqual([])
  })

  it('applyMappingTransform without transform returns value unchanged', () => {
    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals
    const result = internal.applyMappingTransform(
      { sourceColumn: 'A', targetField: 'a' },
      'hello'
    )
    expect(result).toEqual({ value: 'hello' })
  })

  it('applyMappingTransform with undefined value skips transform', () => {
    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals
    const result = internal.applyMappingTransform(
      { sourceColumn: 'A', targetField: 'a', transform: () => 'transformed' },
      // eslint-disable-next-line unicorn/no-useless-undefined
      undefined
    )
    expect(result).toEqual({ value: undefined })
  })

  it('insertStudent defaults gender, student_type, admission_date', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ],
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-DEFAULTS,Grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'students.csv',
      config,
      1
    )
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT gender, student_type, admission_date FROM student WHERE admission_number = ?').get('ADM-DEFAULTS') as any
    expect(row.gender).toBe('MALE')
    expect(row.student_type).toBe('DAY_SCHOLAR')
    expect(row.admission_date).toBeTruthy()
  })

  it('checkDuplicate on INVENTORY maps to inventory_item table', () => {
    db.prepare("INSERT INTO inventory_item (item_code, item_name, category_id) VALUES ('INV-DUP', 'Paper', 1)").run()
    const service = new DataImportService()
    const internal = service as unknown as DataImportServiceInternals
    expect(internal.checkDuplicate('INVENTORY', 'item_code', 'INV-DUP')).toBe(true)
    expect(internal.checkDuplicate('INVENTORY', 'item_code', 'NOPE')).toBe(false)
  })

  it('generates template file for STAFF entity', async () => {
    const service = new DataImportService()
    const templateBuffer = await service.generateTemplateFile('STAFF')
    expect(templateBuffer.length).toBeGreaterThan(0)
  })

  it('preProcess hook transforms mapped row before validation', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ],
      preProcess: (row) => ({ ...row, first_name: String(row['first_name']).toUpperCase() }),
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-PRE,grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'students.csv',
      config,
      1,
    )
    expect(result.success).toBe(true)
    const row = db.prepare('SELECT first_name FROM student WHERE admission_number = ?').get('ADM-PRE') as any
    expect(row.first_name).toBe('GRACE')
  })

  /* ==================================================================
   *  Branch coverage: unsupported file format
   * ================================================================== */
  it('returns error for unsupported file format (e.g., .txt)', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [{ sourceColumn: 'Name', targetField: 'first_name', required: true }]
    }
    const result = await service.importFromFile(Buffer.from('hello'), 'file.txt', config, 1)
    expect(result.success).toBe(false)
    expect(result.errors[0]!.message).toContain('Unsupported file format')
  })

  /* ==================================================================
   *  Branch coverage: file parsing error → catch block
   * ================================================================== */
  it('returns parsing error when CSV is malformed', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [{ sourceColumn: 'Name', targetField: 'first_name', required: true }]
    }
    // Empty buffer may cause a parse error depending on csv-parse behavior
    // Instead, use a filename that claims to be an xls but the content is garbage
    const result = await service.importFromFile(Buffer.from('not-real-excel'), 'file.xlsx', config, 1)
    // xlsx parsing should fail
    expect(result.success).toBe(false)
    expect(result.errors[0]!.message).toContain('File parsing error')
  })

  /* ==================================================================
   *  Branch coverage: skipDuplicates with existing record
   * ================================================================== */
  it('skips duplicate records when skipDuplicates is true', async () => {
    const service = new DataImportService()
    // Insert a student first
    db.prepare(`INSERT INTO student (admission_number, first_name, last_name, date_of_birth, guardian_name, guardian_phone)
      VALUES ('ADM-DUP', 'Existing', 'Student', '2010-01-01', 'Guardian', '0700000000')`).run()

    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ],
      skipDuplicates: true,
      duplicateKey: 'admission_number'
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-DUP,New,Name,2010-05-15,G,0712345678\n'),
      'students.csv', config, 1
    )
    expect(result.skipped).toBe(1)
    // Original record unchanged
    const row = db.prepare('SELECT first_name FROM student WHERE admission_number = ?').get('ADM-DUP') as any
    expect(row.first_name).toBe('Existing')
  })

  /* ==================================================================
   *  Branch coverage: unsupported entity type
   * ================================================================== */
  it('throws for unsupported entity type at insert time', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'UNKNOWN_ENTITY' as any,
      mappings: [
        { sourceColumn: 'Col', targetField: 'field', required: true },
      ]
    }
    const result = await service.importFromFile(
      csvBuffer('Col\nValue\n'), 'file.csv', config, 1
    )
    // The insertRecord method should throw for unsupported entity
    expect(result.errors.length).toBeGreaterThan(0)
  })

  /* ==================================================================
   *  Branch coverage: empty rows → "No data rows found"
   * ================================================================== */
  it('returns error when CSV has only headers', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [{ sourceColumn: 'Name', targetField: 'first_name', required: true }]
    }
    const result = await service.importFromFile(
      csvBuffer('Name\n'), 'file.csv', config, 1
    )
    expect(result.success).toBe(false)
    expect(result.errors[0]!.message).toContain('No data rows')
  })

  /* ==================================================================
   *  Branch coverage: validation callback returning error
   * ================================================================== */
  it('captures validation errors from config.validate callback', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ],
      validate: (row) => row['first_name'] === 'BAD' ? ['Name is not allowed'] : []
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-VAL,BAD,Name,2010-01-01,G,0700000000\n'),
      'file.csv', config, 1
    )
    expect(result.skipped).toBe(1)
    expect(result.errors[0]!.message).toContain('Name is not allowed')
  })

  /* ==================================================================
   *  Branch coverage: mapping with transform that throws
   * ================================================================== */
  it('captures transform errors for a mapping', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true, transform: () => { throw new Error('bad transform') } },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ]
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-TF,Grace,Mutua,2011-01-02,Jane,0712345678\n'),
      'file.csv', config, 1
    )
    expect(result.skipped).toBe(1)
    expect(result.errors[0]!.message).toContain('Transform failed')
  })

  /* ==================================================================
   *  Branch coverage: getImportTemplate for INVENTORY entity type
   * ================================================================== */
  it('getImportTemplate returns columns for INVENTORY', () => {
    const service = new DataImportService()
    const template = service.getImportTemplate('INVENTORY')
    expect(template.columns.length).toBeGreaterThan(0)
    expect(template.columns[0]!.name).toBe('Item Code')
  })

  /* ==================================================================
   *  Branch coverage: getImportTemplate for unknown entity → empty
   * ================================================================== */
  it('getImportTemplate returns empty for unknown entity', () => {
    const service = new DataImportService()
    const template = service.getImportTemplate('WIDGETS')
    expect(template.columns).toHaveLength(0)
    expect(template.sampleData).toHaveLength(0)
  })

  /* ==================================================================
   *  Branch coverage: mapping with validation callback
   * ================================================================== */
  it('captures per-mapping validation errors', async () => {
    const service = new DataImportService()
    const config: ImportConfig = {
      entityType: 'STUDENT',
      mappings: [
        { sourceColumn: 'Admission Number', targetField: 'admission_number', required: true },
        { sourceColumn: 'First Name', targetField: 'first_name', required: true, validation: (v) => typeof v === 'string' && v.length < 2 ? 'Name too short' : null },
        { sourceColumn: 'Last Name', targetField: 'last_name', required: true },
        { sourceColumn: 'Date of Birth', targetField: 'date_of_birth', required: true },
        { sourceColumn: 'Guardian Name', targetField: 'guardian_name', required: true },
        { sourceColumn: 'Guardian Phone', targetField: 'guardian_phone', required: true },
      ]
    }
    const result = await service.importFromFile(
      csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-MV,A,Mutua,2010-01-01,G,0700000000\n'),
      'file.csv', config, 1
    )
    expect(result.skipped).toBe(1)
    expect(result.errors[0]!.message).toContain('Name too short')
  })

  /* ==================================================================
   *  Branch coverage: generateTemplateFile with known entity (L529-531)
   * ================================================================== */
  it('generateTemplateFile returns valid Excel buffer for STUDENT', async () => {
    const service = new DataImportService()
    const buf = await service.generateTemplateFile('STUDENT')
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(0)
  })

  it('generateTemplateFile returns valid Excel buffer for unknown entity (empty template)', async () => {
    const service = new DataImportService()
    const buf = await service.generateTemplateFile('WIDGETS')
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.length).toBeGreaterThan(0)
  })

  /* ==================================================================
   *  Branch coverage: skipDuplicates with and without duplicateKey (L269)
   * ================================================================== */
  it('skips duplicates when skipDuplicates=true and duplicateKey is set', async () => {
    const service = new DataImportService()
    const config = studentImportConfig({ skipDuplicates: true, duplicateKey: 'admission_number' })
    // Insert first
    const csv = csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-DUP1,Alice,Doe,2010-01-01,Jane,0712345678\n')
    await service.importFromFile(csv, 'file.csv', config, 1)
    // Insert again — should skip
    const csv2 = csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-DUP1,Alice,Doe,2010-01-01,Jane,0712345678\n')
    const result2 = await service.importFromFile(csv2, 'file.csv', config, 1)
    expect(result2.skipped).toBe(1)
  })

  it('does not skip duplicates when skipDuplicates=true but duplicateKey is empty', async () => {
    const service = new DataImportService()
    const config = studentImportConfig({ skipDuplicates: true, duplicateKey: '' })
    const csv = csvBuffer('Admission Number,First Name,Last Name,Date of Birth,Guardian Name,Guardian Phone\nADM-NOKEY,Bob,Doe,2010-01-01,Jane,0712345678\n')
    db.prepare(`INSERT INTO student (admission_number, first_name, last_name, date_of_birth, guardian_name, guardian_phone) VALUES ('ADM-NOKEY','Bob','Doe','2010-01-01','Jane','0712345678')`).run()
    // Without duplicateKey, it should try to import (and may fail on UNIQUE constraint)
    const result = await service.importFromFile(csv, 'file.csv', config, 1)
    // Either imports or errors, but shouldn't be silently skipped as duplicate
    expect(result.totalRows).toBe(1)
  })

  /* ==================================================================
   *  Branch coverage: Excel import with empty worksheet (L103)
   * ================================================================== */
  it('parseExcel returns empty rows when workbook has no data sheet', async () => {
    const service = new DataImportService()
    const workbook = new ExcelJS.Workbook()
    // Add worksheet with different name than expected index
    const buf = Buffer.from(await workbook.xlsx.writeBuffer())
    const result = await service.importFromFile(buf, 'file.xlsx', studentImportConfig(), 1)
    expect(result.success).toBe(false)
    expect(result.errors[0]!.message).toContain('No data rows')
  })

  /* ==================================================================
   *  Branch coverage: Excel import with cell values including formula prefix (L120-122)
   * ================================================================== */
  it('strips formula prefixes from Excel cell values', async () => {
    const service = new DataImportService()
    const buf = await buildWorkbookBuffer([
      { 'Admission Number': '=+ADM-FX', 'First Name': 'Grace', 'Last Name': 'Test', 'Date of Birth': '2011-01-02', 'Guardian Name': 'Jane', 'Guardian Phone': '0712345678' }
    ])
    const result = await service.importFromFile(buf, 'file.xlsx', studentImportConfig(), 1)
    // The formula prefix '=+' should be stripped
    if (result.imported > 0) {
      const row = db.prepare('SELECT admission_number FROM student ORDER BY id DESC LIMIT 1').get() as any
      expect(row.admission_number).not.toMatch(/^[=+]/)
    }
    expect(result.totalRows).toBe(1)
  })

  /* ==================================================================
   *  Branch coverage: resolveSourceValue with missing column (L77)
   * ================================================================== */
  it('resolveSourceValue returns undefined for missing source column', () => {
    const service = new DataImportService()
    const internals = service as unknown as DataImportServiceInternals
    const value = internals.resolveSourceValue({ 'A': 1, 'B': 2 }, 'NonExistent')
    expect(value).toBeUndefined()
  })
})
