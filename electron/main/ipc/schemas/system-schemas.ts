import { z } from 'zod'

// Backup Schemas
export const BackupCreateToSchema = z.string().min(1)
export const BackupRestoreSchema = z.string().min(1)

// Audit Schemas
export const AuditGetLogSchema = z.number().or(z.string()).optional()

// Import Schemas
export const ImportMappingSchema = z.object({
    sourceColumn: z.string(),
    targetField: z.string(),
    required: z.boolean().optional()
})

export const ImportConfigSchema = z.object({
    entityType: z.enum(['STUDENT', 'STAFF', 'FEE_STRUCTURE', 'INVENTORY', 'BANK_STATEMENT']),
    mappings: z.array(ImportMappingSchema),
    skipDuplicates: z.boolean().optional(),
    duplicateKey: z.string().optional()
})

export const ImportTuple = z.tuple([
    z.string(), // filePath
    ImportConfigSchema,
    z.number().optional()
])

export const TemplateTypeSchema = z.string()

// Error Logging (Existing)
export const LogErrorSchema = z.tuple([
    z.string(), // error
    z.object({
        component: z.string().optional(),
        stack: z.string().optional()
    }).optional()
])
