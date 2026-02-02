import * as ExcelJS from 'exceljs'
import { parse } from 'csv-parse/sync'
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
        await workbook.xlsx.load(buffer as any)
        const worksheet = workbook.getWorksheet(1)
        if (!worksheet) return []

        const rows: Record<string, unknown>[] = []
        const headerRow = worksheet.getRow(1)
        const headers: string[] = []

        headerRow.eachCell((cell, colNumber) => {
            headers[colNumber] = cell.text.trim()
        })

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return // Skip header

            const rowData: Record<string, unknown> = {}
            let hasData = false

            row.eachCell((cell, colNumber) => {
                const header = headers[colNumber]
                if (header) {
                    rowData[header] = cell.value === null ? undefined : cell.value
                    hasData = true
                }
            })

            if (hasData) {
                rows.push(rowData)
            }
        })

        return rows
    }

    /**
     * Process import with validation and insertion
     */
    private async processImport(
        rows: Record<string, unknown>[],
        config: ImportConfig,
        userId: number
    ): Promise<ImportResult> {
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

        // Validate column mappings
        const sourceColumns = Object.keys(rows[0])
        for (const mapping of config.mappings) {
            if (mapping.required && !sourceColumns.some(col => col.trim() === mapping.sourceColumn)) {
                result.errors.push({
                    row: 0,
                    field: mapping.sourceColumn,
                    message: `Required column "${mapping.sourceColumn}" not found in file`
                })
            }
        }

        if (result.errors.length > 0) {
            result.success = false
            return result
        }

        // Process rows
        this.db.transaction(() => {
            for (let i = 0; i < rows.length; i++) {
                const rowNum = i + 2 // +2 for 1-based index + header row
                const sourceRow = rows[i]

                try {
                    // Map source to target
                    let mappedRow: Record<string, unknown> = {}
                    const rowErrors: string[] = []

                    for (const mapping of config.mappings) {
                        // Case insensitive column matching
                        const sourceKey = Object.keys(sourceRow).find(
                            k => k.trim().toLowerCase() === mapping.sourceColumn.toLowerCase()
                        )

                        let value = sourceKey ? sourceRow[sourceKey] : undefined

                        // Apply transform
                        if (mapping.transform && value !== undefined) {
                            try {
                                value = mapping.transform(value)
                            } catch (e) {
                                rowErrors.push(`Transform failed for ${mapping.sourceColumn}`)
                                continue
                            }
                        }

                        // Validate
                        if (mapping.validation) {
                            const validationError = mapping.validation(value)
                            if (validationError) {
                                rowErrors.push(validationError)
                            }
                        }

                        // Check required
                        if (mapping.required && (value === undefined || value === null || String(value).trim() === '')) {
                            rowErrors.push(`${mapping.sourceColumn} is required`)
                        }

                        mappedRow[mapping.targetField] = value
                    }

                    // Apply pre-processing
                    if (config.preProcess) {
                        mappedRow = config.preProcess(mappedRow)
                    }

                    // Custom validation
                    if (config.validate) {
                        const customErrors = config.validate(mappedRow)
                        rowErrors.push(...customErrors)
                    }

                    if (rowErrors.length > 0) {
                        result.errors.push({
                            row: rowNum,
                            message: rowErrors.join('; '),
                            data: sourceRow
                        })
                        result.skipped++
                        continue
                    }

                    // Check duplicates
                    if (config.skipDuplicates && config.duplicateKey) {
                        const exists = this.checkDuplicate(config.entityType, config.duplicateKey, mappedRow[config.duplicateKey])
                        if (exists) {
                            result.skipped++
                            continue
                        }
                    }

                    // Insert record
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

        // Log the import
        logAudit(userId, 'IMPORT', config.entityType.toLowerCase(), null, null, {
            total_rows: result.totalRows,
            imported: result.imported,
            skipped: result.skipped,
            errors_count: result.errors.length
        })

        result.success = result.errors.length === 0 || result.imported > 0
        return result
    }

    /**
     * Check for duplicate record
     */
    private checkDuplicate(entityType: string, keyField: string, value: unknown): boolean {
        const tableName = this.getTableName(entityType)
        const result = this.db.prepare(`SELECT 1 FROM ${tableName} WHERE ${keyField} = ? LIMIT 1`).get(value)
        return !!result
    }

    /**
     * Insert a record
     */
    private insertRecord(entityType: string, data: Record<string, unknown>, userId: number): void {
        switch (entityType) {
            case 'STUDENT':
                this.insertStudent(data)
                break
            // Add other types as needed
            default:
                throw new Error(`Unsupported entity type: ${entityType}`)
        }
    }

    private insertStudent(data: Record<string, unknown>): void {
        this.db.prepare(`
      INSERT INTO student (
        admission_number, first_name, middle_name, last_name,
        date_of_birth, gender, student_type, admission_date,
        guardian_name, guardian_phone, guardian_email, address
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            data.admission_number,
            data.first_name,
            data.middle_name || null,
            data.last_name,
            data.date_of_birth,
            data.gender || 'MALE',
            data.student_type || 'DAY_SCHOLAR',
            data.admission_date || new Date().toISOString().slice(0, 10),
            data.guardian_name,
            data.guardian_phone,
            data.guardian_email || null,
            data.address || null
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
        switch (entityType) {
            case 'STUDENT':
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
                        { name: 'Address', required: false, description: 'Home address', example: 'Nairobi, Kenya' },
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

            default:
                return { columns: [], sampleData: [] }
        }
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
            const columns = Object.keys(template.sampleData[0]).map(key => ({
                header: key,
                key: key,
                width: 20
            }))
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
