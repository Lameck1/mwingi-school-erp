import { z } from 'zod'

const SettingsUpdateFieldsSchema = z.object({
    school_name: z.string().min(1).optional(),
    school_motto: z.string().optional(),
    address: z.string().optional(),
    phone: z.string().optional(),
    email: z.email().optional(),
    logo_path: z.string().optional(),
    mpesa_paybill: z.string().optional(),
    sms_api_key: z.string().optional(),
    sms_api_secret: z.string().optional(),
    sms_sender_id: z.string().optional(),
    school_type: z.enum(['PUBLIC', 'PRIVATE']).optional(),
})

export const SchoolSettingsSchema = SettingsUpdateFieldsSchema
export const SettingsUpdateSchema = SettingsUpdateFieldsSchema.strict()

export const SecureConfigKeySchema = z.string().min(1)
export const SecureConfigPairSchema = z.tuple([
    z.string().min(1),
    z.string() // Value can be anything string
])

export const LogoUploadSchema = z.string().min(1, 'Image data URL is required')
