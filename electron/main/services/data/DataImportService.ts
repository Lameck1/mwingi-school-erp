import { parse } from 'csv-parse/sync'
import * as ExcelJS from 'exceljs'

import { getDatabase } from '../../database'
import { logAudit } from '../../database/utils/audit'

export interface ImportResult {
    success: boolean
    totalRows: number
    imported: number
    skipped: number
    errors: ImportError[]
}

export interface ImportError {
    row: number
    field?: string
    message: string
    data?: Record<string, unknown>
}

export interface ImportMapping {
    sourceColumn: string
    targetField: string
    transform?: (value: unknown) => unknown
    required?: boolean
    validation?: (value: unknown) => string | null
}

export interface ImportConfig {
    entityType: 'STUDENT' | 'STAFF' | 'FEE_STRUCTURE' | 'BANK_STATEMENT' | 'INVENTORY'
    mappings: ImportMapping[]
    skipDuplicates?: boolean
    duplicateKey?: string
    preProcess?: (row: Record<string, unknown>) => Record<string, unknown>
    validate?: (row: Record<string, unknown>) => string[]
}

export class DataImportService {
    private get db() { return getDatabase() }

    /**
     * Import data from file buffer
     */
    async importFromFile(
        fileBuffer: Buffer,
        fileName: string,
        config: ImportConfig,
        userId: number
    ): Promise<ImportResult> {
        // Parse file based on extension
        const extension = fileName.split('.').pop()?.toLowerCase()
        let rows: Record<string, unknown>[]

        try {
            if (extension === 'csv') {
                rows = this.parseCSV(fileBuffer)
            } else if (extension === 'xlsx' || extension === 'xls') {
                rows = await this.parseExcel(fileBuffer)
            } else {
                return {
                    success: false,
                    totalRows: 0,
                    imported: 0,
                    skipped: 0,
                    errors: [{ row: 0, message: 'Unsupported file format. Use CSV or Excel.' }]
                }
            }
        } catch (error) {
            return {
                success: false,
                totalRows: 0,
                imported: 0,
                skipped: 0,
                errors: [{
                    row: 0,
                    message: `File parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`
                }]
            }
        }

        return this.processImport(rows, config, userId)
    }

    /**
     * Parse CSV buffer using csv-parse
     */
    private parseCSV(buffer: Buffer): Record<string, unknown>[] {
        return parse(buffer, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        })
    }

    /**
     * Parse Excel buffer using exceljs
     */
    private async parseExcel(buffer: Buffer): Promise<Record<string, unknown>[]> {
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(new Uint8Array(buffer).buffer)
        const worksheet = workbook.getWorksheet(1)
        if (!worksheet) {return []}

        const rows: Record<string, unknown>[] = []
        const headerRow = worksheet.getRow(1)
        const headers: string[] = []

        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.text.trim()
        })

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) {return} // Skip header

            const rowData: Record<string, unknown> = {}

            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber]
                if (header) {
                    let val = cell.value === null ? undefined : cell.value
                    if (typeof val === 'string') {
                        val = val.replace(/^[=+\-@]+/, '')
                    }
                    rowData[header] = val
                }
            })

            if (Object.keys(rowData).length > 0) {
                rows.push(rowData)
            }
        })

        return rows
    }

    /**
     * Process import with validation and insertion
     */
    private validateRequiredColumns(
        sourceColumns: string[],
        mappings: ImportMapping[]
    ): ImportError[] {
        const errors: ImportError[] = []
        for (const mapping of mappings) {
            if (mapping.required && !sourceColumns.some(col => col.trim() === mapping.sourceColumn)) {
                errors.push({
                    row: 0,
                    field: mapping.sourceColumn,
                    message: `Required column "${mapping.sourceColumn}" not found in file`
                })
            }
        }

        return errors
    }

    private mapAndValidateRow(
        sourceRow: Record<string, unknown>,
        config: ImportConfig
    ): { mappedRow: Record<string, unknown>; rowErrors: string[] } {
        let mappedRow: Record<string, unknown> = {}
        const rowErrors: string[] = []

        for (const mapping of config.mappings) {
            const sourceValue = this.resolveSourceValue(sourceRow, mapping.sourceColumn)
            const transformed = this.applyMappingTransform(mapping, sourceValue)
            if (transformed.error) {
                rowErrors.push(transformed.error)
                continue
            }

            const value = transformed.value
            rowErrors.push(...this.collectMappingErrors(mapping, value))

            mappedRow[mapping.targetField] = value
        }

        if (config.preProcess) {
            mappedRow = config.preProcess(mappedRow)
        }

        if (config.validate) {
            rowErrors.push(...config.validate(mappedRow))
        }

        return { mappedRow, rowErrors }
    }

    private resolveSourceValue(sourceRow: Record<string, unknown>, sourceColumn: string): unknown {
        const sourceKey = Object.keys(sourceRow).find(
            key => key.trim().toLowerCase() === sourceColumn.toLowerCase()
        )
        return sourceKey ? sourceRow[sourceKey] : undefined
    }

    private applyMappingTransform(
        mapping: ImportMapping,
        value: unknown
    ): { value: unknown; error?: string } {
        if (!mapping.transform || value === undefined) {
            return { value }
        }

        try {
            return { value: mapping.transform(value) }
        } catch {
            return { value, error: `Transform failed for ${mapping.sourceColumn}` }
        }
    }

    private collectMappingErrors(mapping: ImportMapping, value: unknown): string[] {
        const errors: string[] = []

        if (mapping.validation) {
            const validationError = mapping.validation(value)
            if (validationError) {
                errors.push(validationError)
            }
        }

        const isEmpty = value === undefined || value === null ||
            (typeof value === 'string' && value.trim() === '')

        if (mapping.required && isEmpty) {
            errors.push(`${mapping.sourceColumn} is required`)
        }

        return errors
    }

    private processImport(
        rows: Record<string, unknown>[],
        config: ImportConfig,
        userId: number
    ): ImportResult {
        const result: ImportResult = {
            success: true,
            totalRows: rows.length,
            imported: 0,
            skipped: 0,
            errors: []
        }

        if (rows.length === 0) {
            result.errors.push({ row: 0, message: 'No data rows found in file' })
            result.success = false
            return result
        }

        const firstRow = rows[0]
        if (!firstRow) {
            result.errors.push({ row: 0, message: 'No data rows found in file' })
            result.success = false
            return result
        }
        const sourceColumns = Object.keys(firstRow)
        result.errors.push(...this.validateRequiredColumns(sourceColumns, config.mappings))

        if (result.errors.length > 0) {
            result.success = false
            return result
        }

        this.db.transaction(() => {
            for (let i = 0; i < rows.length; i++) {
                const rowNum = i + 2 // +2 for 1-based index + header row
                const sourceRow = rows[i]
                if (!sourceRow) { continue }

                try {
                    const { mappedRow, rowErrors } = this.mapAndValidateRow(sourceRow, config)

                    if (rowErrors.length > 0) {
                        result.errors.push({
                            row: rowNum,
                            message: rowErrors.join('; '),
                            data: sourceRow
                        })
                        result.skipped++
                        continue
                    }

                    if (config.skipDuplicates && config.duplicateKey) {
                        const exists = this.checkDuplicate(config.entityType, config.duplicateKey, mappedRow[config.duplicateKey])
                        if (exists) {
                            result.skipped++
                            continue
                        }
                    }

                    this.insertRecord(config.entityType, mappedRow, userId)
                    result.imported++

                } catch (error) {
                    result.errors.push({
                        row: rowNum,
                        message: error instanceof Error ? error.message : 'Unknown error',
                        data: sourceRow
                    })
                    result.skipped++
                }
            }
        })()

        logAudit(userId, 'IMPORT', config.entityType.toLowerCase(), null, null, {
            total_rows: result.totalRows,
            imported: result.imported,
            skipped: result.skipped,
            errors_count: result.errors.length
        })

        result.success = result.errors.length === 0 || result.imported > 0
        return result
    }

    private static readonly VALID_IDENTIFIER = /^[a-zA-Z_]\w*$/

    /**
     * Check for duplicate record
     */
    private checkDuplicate(entityType: string, keyField: string, value: unknown): boolean {
        if (!DataImportService.VALID_IDENTIFIER.test(keyField)) {
            throw new Error(`Invalid key field name: ${keyField}`)
        }
        const tableName = this.getTableName(entityType)
        if (!DataImportService.VALID_IDENTIFIER.test(tableName)) {
            throw new Error(`Invalid table name: ${tableName}`)
        }
        const result = this.db.prepare(`SELECT 1 FROM ${tableName} WHERE ${keyField} = ? LIMIT 1`).get(value)
        return !!result
    }

    /**
     * Insert a record
     */
    private insertRecord(entityType: string, data: Record<string, unknown>, _userId: number): void {
        if (entityType === 'STUDENT') { this.insertStudent(data); return }
        if (entityType === 'STAFF') { this.insertStaff(data); return }
        if (entityType === 'FEE_STRUCTURE') { this.insertFeeStructure(data); return }
        if (entityType === 'INVENTORY') { this.insertInventoryItem(data); return }

        throw new Error(`Unsupported entity type: ${entityType}`)
    }

    private insertStudent(data: Record<string, unknown>): void {
        this.db.prepare(`
      INSERT INTO student (
        admission_number, first_name, middle_name, last_name,
        date_of_birth, gender, student_type, admission_date,
        guardian_name, guardian_phone, guardian_email, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            data['admission_number'],
            data['first_name'],
            data['middle_name'] || null,
            data['last_name'],
            data['date_of_birth'],
            data['gender'] || 'MALE',
            data['student_type'] || 'DAY_SCHOLAR',
            data['admission_date'] || new Date().toISOString().slice(0, 10),
            data['guardian_name'],
            data['guardian_phone'],
            data['guardian_email'] || null,
            data['address'] || null
        )
    }

    private insertStaff(data: Record<string, unknown>): void {
        this.db.prepare(`
      INSERT INTO staff (
        staff_number, first_name, middle_name, last_name,
        id_number, kra_pin, phone, email,
        department, job_title, employment_date, basic_salary, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
            data['staff_number'],
            data['first_name'],
            data['middle_name'] || null,
            data['last_name'],
            data['id_number'] || null,
            data['kra_pin'] || null,
            data['phone'] || null,
            data['email'] || null,
            data['department'] || null,
            data['job_title'] || null,
            data['employment_date'] || new Date().toISOString().slice(0, 10),
            data['basic_salary'] || 0
        )
    }

    private insertFeeStructure(data: Record<string, unknown>): void {
        this.db.prepare(`
      INSERT INTO fee_structure (
        academic_year_id, term_id, stream_id, student_type, fee_category_id, amount, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
            data['academic_year_id'],
            data['term_id'],
            data['stream_id'],
            data['student_type'] || 'DAY_SCHOLAR',
            data['fee_category_id'],
            data['amount'],
            data['description'] || null
        )
    }

    private insertInventoryItem(data: Record<string, unknown>): void {
        this.db.prepare(`
      INSERT INTO inventory_item (
        item_code, item_name, category_id, unit_of_measure, current_stock, reorder_level, unit_cost
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
            data['item_code'],
            data['item_name'],
            data['category_id'],
            data['unit_of_measure'] || 'Unit',
            data['current_stock'] || 0,
            data['reorder_level'] || 0,
            data['unit_cost'] || 0
        )
    }

    private getTableName(entityType: string): string {
        const map: Record<string, string> = {
            'STUDENT': 'student',
            'STAFF': 'staff',
            'FEE_STRUCTURE': 'fee_structure',
            'INVENTORY': 'inventory_item'
        }
        return map[entityType] || entityType.toLowerCase()
    }

    /**
     * Get import template for an entity type
     */
    getImportTemplate(entityType: string): {
        columns: Array<{ name: string; required: boolean; description: string; example: string }>
        sampleData: Record<string, string>[]
    } {
        if (entityType === 'STUDENT') {
            return {
                columns: [
                    { name: 'Admission Number', required: true, description: 'Unique admission number', example: 'ADM001' },
                    { name: 'First Name', required: true, description: 'Student first name', example: 'John' },
                    { name: 'Middle Name', required: false, description: 'Student middle name', example: 'Mwangi' },
                    { name: 'Last Name', required: true, description: 'Student last name', example: 'Kamau' },
                    { name: 'Date of Birth', required: true, description: 'Date of birth (YYYY-MM-DD)', example: '2010-05-15' },
                    { name: 'Gender', required: true, description: 'MALE or FEMALE', example: 'MALE' },
                    { name: 'Student Type', required: true, description: 'BOARDER or DAY_SCHOLAR', example: 'DAY_SCHOLAR' },
                    { name: 'Guardian Name', required: true, description: 'Parent/Guardian name', example: 'Jane Kamau' },
                    { name: 'Guardian Phone', required: true, description: 'Guardian phone number', example: '0712345678' },
                    { name: 'Guardian Email', required: false, description: 'Guardian email', example: 'jane@email.com' },
                    { name: 'Address', required: false, description: 'Home address', example: 'Nairobi, Kenya' }
                ],
                sampleData: [
                    {
                        'Admission Number': 'ADM001',
                        'First Name': 'John',
                        'Middle Name': 'Mwangi',
                        'Last Name': 'Kamau',
                        'Date of Birth': '2010-05-15',
                        'Gender': 'MALE',
                        'Student Type': 'DAY_SCHOLAR',
                        'Guardian Name': 'Jane Kamau',
                        'Guardian Phone': '0712345678',
                        'Guardian Email': 'jane@email.com',
                        'Address': 'Nairobi'
                    }
                ]
            }
        }

        if (entityType === 'STAFF') {
            return {
                columns: [
                    { name: 'Staff Number', required: true, description: 'Unique staff number', example: 'ST-001' },
                    { name: 'First Name', required: true, description: 'Staff first name', example: 'Joseph' },
                    { name: 'Middle Name', required: false, description: 'Staff middle name', example: '' },
                    { name: 'Last Name', required: true, description: 'Staff last name', example: 'Omondi' },
                    { name: 'ID Number', required: false, description: 'National ID', example: '12345678' },
                    { name: 'KRA PIN', required: false, description: 'KRA PIN', example: 'A012345678B' },
                    { name: 'Phone', required: false, description: 'Phone number', example: '0712345678' },
                    { name: 'Email', required: false, description: 'Email address', example: 'joseph@school.ac.ke' },
                    { name: 'Department', required: false, description: 'Department', example: 'Teaching' },
                    { name: 'Job Title', required: true, description: 'Job title', example: 'Senior Teacher' },
                    { name: 'Employment Date', required: false, description: 'Date joined (YYYY-MM-DD)', example: '2024-01-15' },
                    { name: 'Basic Salary', required: true, description: 'Monthly salary in cents', example: '6500000' }
                ],
                sampleData: [{
                    'Staff Number': 'ST-001', 'First Name': 'Joseph', 'Middle Name': '', 'Last Name': 'Omondi',
                    'ID Number': '12345678', 'KRA PIN': 'A012345678B', 'Phone': '0712345678',
                    'Email': 'joseph@school.ac.ke', 'Department': 'Teaching', 'Job Title': 'Senior Teacher',
                    'Employment Date': '2024-01-15', 'Basic Salary': '6500000'
                }]
            }
        }

        if (entityType === 'INVENTORY') {
            return {
                columns: [
                    { name: 'Item Code', required: true, description: 'Unique item code', example: 'STA-001' },
                    { name: 'Item Name', required: true, description: 'Item name', example: 'Chalks White (Box)' },
                    { name: 'Category ID', required: true, description: 'Inventory category ID', example: '1' },
                    { name: 'Unit of Measure', required: true, description: 'UoM', example: 'Box' },
                    { name: 'Current Stock', required: false, description: 'Opening stock quantity', example: '100' },
                    { name: 'Reorder Level', required: false, description: 'Reorder threshold', example: '20' },
                    { name: 'Unit Cost', required: false, description: 'Cost per unit in cents', example: '25000' }
                ],
                sampleData: [{
                    'Item Code': 'STA-001', 'Item Name': 'Chalks White (Box)', 'Category ID': '1',
                    'Unit of Measure': 'Box', 'Current Stock': '100', 'Reorder Level': '20', 'Unit Cost': '25000'
                }]
            }
        }

        return { columns: [], sampleData: [] }
    }

    /**
     * Generate import template file
     */
    async generateTemplateFile(entityType: string): Promise<Buffer> {
        const template = this.getImportTemplate(entityType)
        const workbook = new ExcelJS.Workbook()

        // Create data sheet
        const dataSheet = workbook.addWorksheet('Data')
        if (template.sampleData.length > 0) {
            const firstSample = template.sampleData[0]
            const columns = firstSample ? Object.keys(firstSample).map(key => ({
                header: key,
                key,
                width: 20
            })) : []
            dataSheet.columns = columns
            template.sampleData.forEach(row => dataSheet.addRow(row))
        }

        // Create instructions sheet
        const instructionsSheet = workbook.addWorksheet('Instructions')
        instructionsSheet.columns = [
            { header: 'Column Name', key: 'name', width: 25 },
            { header: 'Required', key: 'required', width: 10 },
            { header: 'Description', key: 'description', width: 40 },
            { header: 'Example', key: 'example', width: 20 }
        ]

        template.columns.forEach(col => {
            instructionsSheet.addRow({
                name: col.name,
                required: col.required ? 'Yes' : 'No',
                description: col.description,
                example: col.example
            })
        })

        // Style headers
        const headerStyle: Partial<ExcelJS.Style> = {
            font: { bold: true },
            fill: {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'FFE0E0E0' }
            }
        }
        dataSheet.getRow(1).eachCell(cell => { cell.style = headerStyle })
        instructionsSheet.getRow(1).eachCell(cell => { cell.style = headerStyle })

        return Buffer.from(await workbook.xlsx.writeBuffer())
    }
}

export const dataImportService = new DataImportService()
