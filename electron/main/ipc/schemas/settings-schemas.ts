import { z } from 'zod'

export const SchoolSettingsSchema = z.record(z.string(), z.unknown())
// Use specific schema if possible, but the handler casts it to Record<string, unknown> validation is minimal in original code.
// Ideally should validate fields like school_name, etc. but to be safe with unknown fields, generic record is okay for now or partial object.
// Handler code: `settings['school_name']` etc.
// Let's use a loose object or record for now to match `data: unknown`.
export const SettingsUpdateSchema = z.record(z.string(), z.unknown())

export const SecureConfigKeySchema = z.string().min(1)
export const SecureConfigPairSchema = z.tuple([
    z.string().min(1),
    z.string() // Value can be anything string
])

export const LogoUploadSchema = z.string().min(1, 'Image data URL is required')
