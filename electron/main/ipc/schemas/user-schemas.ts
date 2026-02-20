import { z } from 'zod'

export const UserCreateSchema = z.object({
    username: z.string().min(3, 'Username must be at least 3 characters'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    full_name: z.string().min(1, 'Full name is required'),
    email: z.string().email('Invalid email address'),
    role: z.string().min(1, 'Role is required')
})

export const UserUpdateSchema = z.tuple([
    z.number().int().positive(),
    z.object({
        full_name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        role: z.string().min(1).optional()
    })
])

export const UserToggleStatusSchema = z.tuple([
    z.number().int().positive(),
    z.boolean()
])

export const UserResetPasswordSchema = z.tuple([
    z.number().int().positive(),
    z.string().min(8, 'Password must be at least 8 characters')
])
