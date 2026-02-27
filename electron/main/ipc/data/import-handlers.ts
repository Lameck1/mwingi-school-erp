import { randomUUID } from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { dialog, BrowserWindow } from '../../electron-env'
import { dataImportService } from '../../services/data/DataImportService'
import { ROLES } from '../ipc-result'
import { ImportTuple, ImportPickFileSchema, TemplateTypeSchema } from '../schemas/system-schemas'
import { validatedHandler, validatedHandlerMulti } from '../validated-handler'

import type { ImportConfig } from '../../services/data/DataImportService'
import type { z } from 'zod'

const ALLOWED_IMPORT_EXTENSIONS = ['.csv', '.xlsx', '.xls']
const MAX_IMPORT_FILE_SIZE_BYTES = 25 * 1024 * 1024
const IMPORT_TOKEN_TTL_MS = 10 * 60 * 1000

interface ImportTokenEntry {
    absolutePath: string
    extension: string
    sizeBytes: number
    expiresAtMs: number
}

const importFileTokenStore = new Map<string, ImportTokenEntry>()

function cleanupExpiredImportTokens(referenceTimeMs: number = Date.now()): void {
    for (const [token, entry] of importFileTokenStore.entries()) {
        if (entry.expiresAtMs <= referenceTimeMs) {
            importFileTokenStore.delete(token)
        }
    }
}

function normalizeImportConfig(config: z.infer<typeof ImportTuple>[1]): ImportConfig {
    const normalizedMappings: ImportConfig['mappings'] = config.mappings.map((mapping) => {
        const normalized: {
            sourceColumn: string
            targetField: string
            required?: boolean
        } = {
            sourceColumn: mapping.sourceColumn,
            targetField: mapping.targetField
        }
        if (mapping.required !== undefined) {
            normalized.required = mapping.required
        }
        return normalized
    })

    const normalized: ImportConfig = {
        entityType: config.entityType,
        mappings: normalizedMappings
    }
    if (config.skipDuplicates !== undefined) {
        normalized.skipDuplicates = config.skipDuplicates
    }
    if (config.duplicateKey !== undefined) {
        normalized.duplicateKey = config.duplicateKey
    }
    return normalized
}

async function getImportFileMetadata(targetPath: string): Promise<{
    absolutePath: string
    extension: string
    fileSizeBytes: number
}> {
    const absolutePath = path.resolve(targetPath)
    const extension = path.extname(absolutePath).toLowerCase()
    const stats = await fsp.stat(absolutePath)

    if (!stats.isFile()) {
        throw new Error('Selected import path is not a file')
    }

    return { absolutePath, extension, fileSizeBytes: stats.size }
}

function getExtensionValidationError(extension: string): string | null {
    if (!ALLOWED_IMPORT_EXTENSIONS.includes(extension)) {
        return `Invalid file type '${extension}'. Allowed: ${ALLOWED_IMPORT_EXTENSIONS.join(', ')}`
    }
    return null
}

function getFileSizeValidationError(fileSizeBytes: number): string | null {
    if (fileSizeBytes > MAX_IMPORT_FILE_SIZE_BYTES) {
        const sizeMb = (fileSizeBytes / (1024 * 1024)).toFixed(1)
        const maxMb = (MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024)).toFixed(0)
        return `File too large (${sizeMb} MB). Maximum allowed size is ${maxMb} MB`
    }
    return null
}

function buildImportValidationFailure(message: string) {
    return {
        success: false,
        totalRows: 0,
        imported: 0,
        skipped: 0,
        errors: [{ row: 0, message }]
    }
}

export function registerDataImportHandlers(): void {
    validatedHandler('data:pickImportFile', ROLES.ADMIN_ONLY, ImportPickFileSchema, async (event) => {
        cleanupExpiredImportTokens()
        try {
            const win = BrowserWindow.fromWebContents(event.sender)
            const pickResult = await dialog.showOpenDialog(win, {
                title: 'Select Import File',
                properties: ['openFile'],
                filters: [
                    { name: 'Data Files', extensions: ['csv', 'xlsx', 'xls'] },
                    { name: 'CSV', extensions: ['csv'] },
                    { name: 'Excel', extensions: ['xlsx', 'xls'] }
                ]
            })

            if (pickResult.canceled) {
                return { success: false, cancelled: true, error: 'Cancelled' }
            }

            const selectedPath = pickResult.filePaths[0]
            if (!selectedPath) {
                return { success: false, cancelled: true, error: 'No file selected' }
            }

            const { absolutePath, extension, fileSizeBytes } = await getImportFileMetadata(selectedPath)
            const extensionError = getExtensionValidationError(extension)
            if (extensionError) {
                return { success: false, cancelled: false, error: extensionError }
            }

            const sizeError = getFileSizeValidationError(fileSizeBytes)
            if (sizeError) {
                return { success: false, cancelled: false, error: sizeError }
            }

            const token = randomUUID()
            const expiresAtMs = Date.now() + IMPORT_TOKEN_TTL_MS
            importFileTokenStore.set(token, {
                absolutePath,
                extension,
                sizeBytes: fileSizeBytes,
                expiresAtMs
            })

            return {
                success: true,
                token,
                fileName: path.basename(absolutePath),
                fileSizeBytes,
                extension,
                expiresAtMs
            }
        } catch (error) {
            return {
                success: false,
                cancelled: false,
                error: error instanceof Error ? error.message : 'Unable to open import file picker'
            }
        }
    })

    validatedHandlerMulti('data:import', ROLES.ADMIN_ONLY, ImportTuple, async (
        _event,
        [fileToken, config, legacyId],
        actorCtx
    ) => {
        if (legacyId !== undefined && legacyId !== actorCtx.id) {
            throw new Error('Unauthorized: renderer user mismatch')
        }

        cleanupExpiredImportTokens()
        const tokenEntry = importFileTokenStore.get(fileToken)
        if (!tokenEntry) {
            return buildImportValidationFailure('Import token is invalid or has expired. Please pick the file again.')
        }

        try {
            const { absolutePath, extension, fileSizeBytes } = await getImportFileMetadata(tokenEntry.absolutePath)
            const extensionError = getExtensionValidationError(extension)
            if (extensionError) {
                return buildImportValidationFailure(extensionError)
            }
            const sizeError = getFileSizeValidationError(fileSizeBytes)
            if (sizeError) {
                return buildImportValidationFailure(sizeError)
            }

            const buffer = await fsp.readFile(absolutePath)
            return dataImportService.importFromFile(
                buffer,
                path.basename(absolutePath),
                normalizeImportConfig(config),
                actorCtx.id
            )
        } catch (error) {
            return buildImportValidationFailure(error instanceof Error ? error.message : 'File read error')
        } finally {
            // Single-use token to prevent replay with stale or swapped file paths.
            importFileTokenStore.delete(fileToken)
        }
    })

    validatedHandler('data:getTemplate', ROLES.ADMIN_ONLY, TemplateTypeSchema, (_event, entityType) => {
        return dataImportService.getImportTemplate(entityType)
    })

    validatedHandler('data:downloadTemplate', ROLES.ADMIN_ONLY, TemplateTypeSchema, async (event, entityType) => {
        try {
            const buffer = await dataImportService.generateTemplateFile(entityType)
            const win = BrowserWindow.fromWebContents(event.sender)

            const { filePath } = await dialog.showSaveDialog(win, {
                title: `Download ${entityType} Import Template`,
                defaultPath: `${entityType.toLowerCase()}_import_template.xlsx`,
                filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
            })

            if (filePath) {
                await fsp.writeFile(filePath, buffer)
                return { success: true, filePath }
            }
            return { success: false, error: 'Cancelled' }
        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Template generation failed'
            }
        }
    })
}
