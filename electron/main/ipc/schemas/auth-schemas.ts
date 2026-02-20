import { z } from 'zod'

export const LoginSchema = z.tuple([
    z.string().min(1, 'Username is required'),
    z.string().min(1, 'Password is required')
])

export const ChangePasswordSchema = z.tuple([
    z.number().int().positive('Invalid user ID'), // legacyUserId (for backward compat checks)
    z.string().min(1, 'Current password is required'),
    z.string().min(8, 'New password must be at least 8 characters')
])

export const SetupAdminSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    full_name: z.string().min(1, 'Full name is required'),
    email: z.string().email('Invalid email address')
})

export const AuthSessionSchema = z.object({
    user: z.object({
        id: z.number(),
        username: z.string(),
        role: z.string()
    }).passthrough(),
    lastActivity: z.number()
})
