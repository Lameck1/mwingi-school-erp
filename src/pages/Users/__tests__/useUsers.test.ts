// @vitest-environment jsdom
/**
 * Tests for useUsers hook.
 *
 * Covers: data loading, create/update user, password reset,
 * toggle status, search filtering, modal helpers, getRoleClass, and error paths.
 */
import { renderHook, act } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ────────────────────────────────────────────────────

const mockShowToast = vi.fn()
vi.mock('../../../contexts/ToastContext', () => ({
    useToast: () => ({ showToast: mockShowToast }),
}))

vi.mock('../../../utils/ipc', () => ({
    // eslint-disable-next-line sonarjs/function-return-type
    unwrapArrayResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return Array.isArray(value) ? value : []
    },
    unwrapIPCResult: <T,>(value: T) => {
        if (value && typeof value === 'object' && 'success' in (value as Record<string, unknown>) && !(value as Record<string, unknown>).success) {
            throw new Error(((value as Record<string, unknown>).error as string) || 'Failed')
        }
        return value
    },
}))

// ── electronAPI stub ─────────────────────────────────────────

let mockApi: ReturnType<typeof buildElectronAPI>

function buildElectronAPI() {
    return {
        system: {
            getUsers: vi.fn().mockResolvedValue([]),
            createUser: vi.fn().mockResolvedValue({ success: true }),
            updateUser: vi.fn().mockResolvedValue({ success: true }),
            resetUserPassword: vi.fn().mockResolvedValue({ success: true }),
            toggleUserStatus: vi.fn().mockResolvedValue({ success: true }),
        },
    }
}

beforeEach(() => {
    mockApi = buildElectronAPI()
    ;(globalThis as Record<string, unknown>).electronAPI = mockApi
    mockShowToast.mockClear()
})

afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as Record<string, unknown>).electronAPI
    // Restore confirm if overridden
    if ('confirm' in globalThis) {
        delete (globalThis as Record<string, unknown>).confirm
    }
})

// ── Lazy import ──────────────────────────────────────────────

const { useUsers } = await import('../useUsers')

// Helper: fake SyntheticEvent
const fakeEvent = { preventDefault: vi.fn() } as unknown as React.SyntheticEvent

// Helper: sample user
const sampleUser = {
    id: 1,
    username: 'jdoe',
    full_name: 'John Doe',
    email: 'jdoe@school.com',
    role: 'ACCOUNTS_CLERK' as const,
    is_active: true,
    last_login: '2026-01-01',
    created_at: '2025-01-01',
    updated_at: '2025-06-01',
}

const sampleUser2 = {
    id: 2,
    username: 'asmith',
    full_name: 'Alice Smith',
    email: 'alice@school.com',
    role: 'ADMIN' as const,
    is_active: false,
    last_login: '2026-02-01',
    created_at: '2025-02-01',
    updated_at: '2025-07-01',
}

describe('useUsers', () => {
    // ── Initial state ──────────────────────────────────

    describe('initial state', () => {
        it('has correct defaults on mount', async () => {
            const { result } = renderHook(() => useUsers())
            // loading starts true, then resolves
            expect(result.current.saving).toBe(false)
            expect(result.current.search).toBe('')
            expect(result.current.showUserModal).toBe(false)
            expect(result.current.showPasswordModal).toBe(false)
            expect(result.current.selectedUser).toBeNull()
            expect(result.current.isEditing).toBe(false)
            expect(result.current.userData).toEqual({
                username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: ''
            })
            expect(result.current.passwordData).toEqual({
                newPassword: '', confirmPassword: ''
            })
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })
        })
    })

    // ── loadData ───────────────────────────────────────

    describe('loadData', () => {
        it('loads users on mount', async () => {
            mockApi.system.getUsers.mockResolvedValue([sampleUser, sampleUser2])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.users).toEqual([sampleUser, sampleUser2])
            expect(result.current.loading).toBe(false)
        })

        it('handles loadData failure with Error', async () => {
            mockApi.system.getUsers.mockRejectedValue(new Error('DB error'))

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.users).toEqual([])
            expect(result.current.loading).toBe(false)
            expect(mockShowToast).toHaveBeenCalledWith('DB error', 'error')
        })

        it('handles loadData failure with non-Error', async () => {
            mockApi.system.getUsers.mockRejectedValue('crash')

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.users).toEqual([])
            expect(mockShowToast).toHaveBeenCalledWith('Failed to load system users', 'error')
        })
    })

    // ── handleSaveUser ─────────────────────────────────

    describe('handleSaveUser', () => {
        it('creates a new user successfully', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setUserData({
                    username: 'newuser',
                    full_name: 'New User',
                    email: 'new@school.com',
                    role: 'TEACHER',
                    password: 'secret123',
                })
            })

            await act(async () => result.current.handleSaveUser(fakeEvent))

            expect(fakeEvent.preventDefault).toHaveBeenCalled()
            expect(mockApi.system.createUser).toHaveBeenCalledWith({
                username: 'newuser',
                full_name: 'New User',
                email: 'new@school.com',
                role: 'TEACHER',
                password: 'secret123',
            })
            expect(mockShowToast).toHaveBeenCalledWith('New user account established', 'success')
            expect(result.current.showUserModal).toBe(false)
        })

        it('updates an existing user successfully', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            // Open edit modal to set isEditing + selectedUser
            act(() => result.current.openEditModal(sampleUser))

            await act(async () => result.current.handleSaveUser(fakeEvent))

            expect(mockApi.system.updateUser).toHaveBeenCalledWith(
                sampleUser.id,
                expect.objectContaining({
                    username: sampleUser.username,
                    full_name: sampleUser.full_name,
                    email: sampleUser.email,
                    role: sampleUser.role,
                })
            )
            // password should NOT be passed in update
            const callArgs = mockApi.system.updateUser.mock.calls[0][1]
            expect(callArgs).not.toHaveProperty('password')
            expect(mockShowToast).toHaveBeenCalledWith('User profile updated successfully', 'success')
        })

        it('handles save user failure with Error', async () => {
            mockApi.system.createUser.mockRejectedValue(new Error('Create fail'))

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleSaveUser(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Create fail', 'error')
        })

        it('handles save user failure with non-Error', async () => {
            mockApi.system.createUser.mockRejectedValue(42)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleSaveUser(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Critical error saving user', 'error')
        })
    })

    // ── handleResetPassword ────────────────────────────

    describe('handleResetPassword', () => {
        it('shows error when passwords do not match', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setPasswordData({ newPassword: 'abc', confirmPassword: 'xyz' })
            })

            await act(async () => result.current.handleResetPassword(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Passwords do not match', 'error')
            // Should not call API
            expect(mockApi.system.resetUserPassword).not.toHaveBeenCalled()
        })

        it('shows error when no user is selected', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => {
                result.current.setPasswordData({ newPassword: 'abc123', confirmPassword: 'abc123' })
            })

            await act(async () => result.current.handleResetPassword(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Select a user before resetting credentials', 'error')
            expect(mockApi.system.resetUserPassword).not.toHaveBeenCalled()
        })

        it('resets password successfully', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            // Open password modal to set selectedUser
            act(() => result.current.openPasswordModal(sampleUser))
            act(() => {
                result.current.setPasswordData({ newPassword: 'newpass', confirmPassword: 'newpass' })
            })

            await act(async () => result.current.handleResetPassword(fakeEvent))

            expect(mockApi.system.resetUserPassword).toHaveBeenCalledWith(sampleUser.id, 'newpass')
            expect(mockShowToast).toHaveBeenCalledWith('Security credentials updated successfully', 'success')
            expect(result.current.showPasswordModal).toBe(false)
        })

        it('handles reset password failure with Error', async () => {
            mockApi.system.resetUserPassword.mockRejectedValue(new Error('Reset fail'))

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))
            act(() => {
                result.current.setPasswordData({ newPassword: 'p', confirmPassword: 'p' })
            })

            await act(async () => result.current.handleResetPassword(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Reset fail', 'error')
        })

        it('handles reset password failure with non-Error', async () => {
            mockApi.system.resetUserPassword.mockRejectedValue(null)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))
            act(() => {
                result.current.setPasswordData({ newPassword: 'p', confirmPassword: 'p' })
            })

            await act(async () => result.current.handleResetPassword(fakeEvent))

            expect(mockShowToast).toHaveBeenCalledWith('Security update failed', 'error')
        })
    })

    // ── handleToggleStatus ─────────────────────────────

    describe('handleToggleStatus', () => {
        it('does nothing when confirm returns false', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(false)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockApi.system.toggleUserStatus).not.toHaveBeenCalled()
        })

        it('deactivates an active user on confirm', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockApi.system.toggleUserStatus).toHaveBeenCalledWith(sampleUser.id, false)
            expect(mockShowToast).toHaveBeenCalledWith('User deactivated successfully', 'success')
        })

        it('activates an inactive user on confirm', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser2))

            expect(mockApi.system.toggleUserStatus).toHaveBeenCalledWith(sampleUser2.id, true)
            expect(mockShowToast).toHaveBeenCalledWith('User activated successfully', 'success')
        })

        it('handles toggle status failure with Error', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)
            mockApi.system.toggleUserStatus.mockRejectedValue(new Error('Toggle fail'))

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockShowToast).toHaveBeenCalledWith('Toggle fail', 'error')
        })

        it('handles toggle status failure with non-Error', async () => {
            ;(globalThis as Record<string, unknown>).confirm = vi.fn().mockReturnValue(true)
            // eslint-disable-next-line unicorn/no-useless-undefined
            mockApi.system.toggleUserStatus.mockRejectedValue(undefined)

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockShowToast).toHaveBeenCalledWith('Status transition failed', 'error')
        })
    })

    // ── Modal helpers ──────────────────────────────────

    describe('modal helpers', () => {
        it('openAddModal resets form and shows modal', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openAddModal())

            expect(result.current.showUserModal).toBe(true)
            expect(result.current.isEditing).toBe(false)
            expect(result.current.userData).toEqual({
                username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: ''
            })
        })

        it('openEditModal populates form from user and shows modal', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openEditModal(sampleUser))

            expect(result.current.showUserModal).toBe(true)
            expect(result.current.isEditing).toBe(true)
            expect(result.current.selectedUser).toBe(sampleUser)
            expect(result.current.userData).toEqual({
                username: sampleUser.username,
                full_name: sampleUser.full_name,
                email: sampleUser.email,
                role: sampleUser.role,
                password: '',
            })
        })

        it('openEditModal handles user with no email (fallback to empty string)', async () => {
            const userNoEmail = { ...sampleUser, id: 99, email: undefined }

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openEditModal(userNoEmail as never))

            expect(result.current.showUserModal).toBe(true)
            expect(result.current.isEditing).toBe(true)
            expect(result.current.userData.email).toBe('')
        })

        it('openPasswordModal sets user and shows password modal', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))

            expect(result.current.showPasswordModal).toBe(true)
            expect(result.current.selectedUser).toBe(sampleUser)
            expect(result.current.passwordData).toEqual({ newPassword: '', confirmPassword: '' })
        })

        it('closeUserModal hides modal and resets form', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openEditModal(sampleUser))
            expect(result.current.showUserModal).toBe(true)

            act(() => result.current.closeUserModal())

            expect(result.current.showUserModal).toBe(false)
            expect(result.current.selectedUser).toBeNull()
            expect(result.current.isEditing).toBe(false)
        })

        it('closePasswordModal hides modal and resets password data', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))
            expect(result.current.showPasswordModal).toBe(true)

            act(() => result.current.closePasswordModal())

            expect(result.current.showPasswordModal).toBe(false)
            expect(result.current.selectedUser).toBeNull()
            expect(result.current.passwordData).toEqual({ newPassword: '', confirmPassword: '' })
        })
    })

    // ── filteredUsers ──────────────────────────────────

    describe('filteredUsers', () => {
        it('filters by username', async () => {
            mockApi.system.getUsers.mockResolvedValue([sampleUser, sampleUser2])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setSearch('jdoe'))
            expect(result.current.filteredUsers).toHaveLength(1)
            expect(result.current.filteredUsers[0].username).toBe('jdoe')
        })

        it('filters by full_name', async () => {
            mockApi.system.getUsers.mockResolvedValue([sampleUser, sampleUser2])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.setSearch('alice'))
            expect(result.current.filteredUsers).toHaveLength(1)
            expect(result.current.filteredUsers[0].full_name).toBe('Alice Smith')
        })

        it('returns all users when search is empty', async () => {
            mockApi.system.getUsers.mockResolvedValue([sampleUser, sampleUser2])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.filteredUsers).toHaveLength(2)
        })
    })

    // ── getRoleClass ───────────────────────────────────

    describe('getRoleClass', () => {
        it('returns purple classes for ADMIN', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.getRoleClass('ADMIN')).toBe(
                'bg-purple-500/10 text-purple-500 border-purple-500/20'
            )
        })

        it('returns blue classes for AUDITOR', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.getRoleClass('AUDITOR')).toBe(
                'bg-blue-500/10 text-blue-500 border-blue-500/20'
            )
        })

        it('returns default classes for other roles', async () => {
            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            expect(result.current.getRoleClass('TEACHER')).toBe(
                'bg-secondary/50 text-foreground/50 border-border/40'
            )
            expect(result.current.getRoleClass('ACCOUNTS_CLERK')).toBe(
                'bg-secondary/50 text-foreground/50 border-border/40'
            )
        })
    })

    // ── Function coverage: handleToggleStatus catch block ──────────
    describe('handleToggleStatus error handling', () => {
        it('handles handleToggleStatus API rejection', async () => {
            vi.stubGlobal('confirm', vi.fn(() => true))
            mockApi.system.toggleUserStatus.mockRejectedValue(new Error('Toggle failed'))
            mockApi.system.getUsers.mockResolvedValue([sampleUser])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockShowToast).toHaveBeenCalledWith('Toggle failed', 'error')
            vi.unstubAllGlobals()
        })

        it('handles handleToggleStatus non-Error rejection', async () => {
            vi.stubGlobal('confirm', vi.fn(() => true))
            mockApi.system.toggleUserStatus.mockRejectedValue(42)
            mockApi.system.getUsers.mockResolvedValue([sampleUser])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            await act(async () => result.current.handleToggleStatus(sampleUser))

            expect(mockShowToast).toHaveBeenCalledWith('Status transition failed', 'error')
            vi.unstubAllGlobals()
        })
    })

    // ── Function coverage: handleResetPassword catch block ──────────
    describe('handleResetPassword error handling', () => {
        it('handles handleResetPassword API rejection', async () => {
            mockApi.system.resetUserPassword.mockRejectedValue(new Error('Reset failed'))
            mockApi.system.getUsers.mockResolvedValue([sampleUser])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))
            act(() => result.current.setPasswordData({ newPassword: 'abc123', confirmPassword: 'abc123' }))

            await act(async () => result.current.handleResetPassword({ preventDefault: vi.fn() } as never))

            expect(mockShowToast).toHaveBeenCalledWith('Reset failed', 'error')
        })

        it('handles handleResetPassword non-Error rejection', async () => {
            mockApi.system.resetUserPassword.mockRejectedValue(null)
            mockApi.system.getUsers.mockResolvedValue([sampleUser])

            const { result } = renderHook(() => useUsers())
            await act(async () => { await new Promise(resolve => setTimeout(resolve, 100)) })

            act(() => result.current.openPasswordModal(sampleUser))
            act(() => result.current.setPasswordData({ newPassword: 'abc123', confirmPassword: 'abc123' }))

            await act(async () => result.current.handleResetPassword({ preventDefault: vi.fn() } as never))

            expect(mockShowToast).toHaveBeenCalledWith('Security update failed', 'error')
        })
    })
})
