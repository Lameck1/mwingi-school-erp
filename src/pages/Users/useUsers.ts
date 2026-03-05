import type React from 'react'
import { useEffect, useState, useCallback, useMemo } from 'react'

import { useToast } from '../../contexts/ToastContext'
import { unwrapArrayResult, unwrapIPCResult } from '../../utils/ipc'

import type { User, CreateUserData, UpdateUserData } from '../../types/electron-api/UserAPI'

export function useUsers() {
    const { showToast } = useToast()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    const [showUserModal, setShowUserModal] = useState(false)
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isEditing, setIsEditing] = useState(false)

    const [userData, setUserData] = useState<CreateUserData>({
        username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: ''
    })

    const [passwordData, setPasswordData] = useState({
        newPassword: '', confirmPassword: ''
    })

    const loadData = useCallback(async () => {
        setLoading(true)
        try {
            const usersData = await globalThis.electronAPI.system.getUsers()
            setUsers(unwrapArrayResult(usersData, 'Failed to load system users'))
        } catch (error) {
            console.error('Failed to load users:', error)
            setUsers([])
            showToast(error instanceof Error ? error.message : 'Failed to load system users', 'error')
        } finally { setLoading(false) }
    }, [showToast])

    useEffect(() => { loadData().catch((err: unknown) => console.error('Failed to load users', err)) }, [loadData])

    const resetForms = () => {
        setUserData({ username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: '' })
        setPasswordData({ newPassword: '', confirmPassword: '' })
        setSelectedUser(null)
        setIsEditing(false)
    }

    const handleSaveUser = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (isEditing && selectedUser) {
                const { password, ...updateData } = userData
                unwrapIPCResult(
                    await globalThis.electronAPI.system.updateUser(selectedUser.id, updateData as UpdateUserData),
                    'Failed to update user'
                )
                showToast('User profile updated successfully', 'success')
            } else {
                unwrapIPCResult(
                    await globalThis.electronAPI.system.createUser(userData),
                    'Failed to create user'
                )
                showToast('New user account established', 'success')
            }

            setShowUserModal(false)
            resetForms()
            await loadData()
        } catch (error) {
            console.error('Failed to save user:', error)
            showToast(error instanceof Error ? error.message : 'Critical error saving user', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleResetPassword = async (e: React.SyntheticEvent) => {
        e.preventDefault()
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            showToast("Passwords do not match", 'error')
            return
        }

        if (!selectedUser) {
            showToast('Select a user before resetting credentials', 'error')
            return
        }

        setSaving(true)
        try {
            unwrapIPCResult(
                await globalThis.electronAPI.system.resetUserPassword(selectedUser.id, passwordData.newPassword),
                'Failed to reset user password'
            )
            setShowPasswordModal(false)
            resetForms()
            showToast('Security credentials updated successfully', 'success')
        } catch (error) {
            console.error('Failed to reset password:', error)
            showToast(error instanceof Error ? error.message : 'Security update failed', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleToggleStatus = async (user: User) => {
        const action = user.is_active ? 'deactivate' : 'activate'
        if (!confirm(`Are you sure you want to ${action} user "${user.username}"?`)) { return }

        try {
            unwrapIPCResult(
                await globalThis.electronAPI.system.toggleUserStatus(user.id, !user.is_active),
                'Failed to update user status'
            )
            showToast(`User ${action}d successfully`, 'success')
            await loadData()
        } catch (error) {
            console.error('Failed to toggle status:', error)
            showToast(error instanceof Error ? error.message : 'Status transition failed', 'error')
        }
    }

    const openAddModal = () => {
        setIsEditing(false)
        setUserData({ username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: '' })
        setShowUserModal(true)
    }

    const openEditModal = (user: User) => {
        setIsEditing(true)
        setSelectedUser(user)
        setUserData({
            username: user.username,
            full_name: user.full_name,
            email: user.email || '',
            role: user.role,
            password: ''
        })
        setShowUserModal(true)
    }

    const openPasswordModal = (user: User) => {
        setSelectedUser(user)
        setPasswordData({ newPassword: '', confirmPassword: '' })
        setShowPasswordModal(true)
    }

    const closeUserModal = () => {
        setShowUserModal(false)
        resetForms()
    }

    const closePasswordModal = () => {
        setShowPasswordModal(false)
        setPasswordData({ newPassword: '', confirmPassword: '' })
        setSelectedUser(null)
    }

    const filteredUsers = useMemo(() => users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name.toLowerCase().includes(search.toLowerCase())
    ), [users, search])

    const getRoleClass = (role: User['role']): string => {
        if (role === 'ADMIN') {
            return 'bg-purple-500/10 text-purple-500 border-purple-500/20'
        }
        if (role === 'AUDITOR') {
            return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
        }
        return 'bg-secondary/50 text-foreground/50 border-border/40'
    }

    return {
        users,
        filteredUsers,
        loading,
        saving,
        search,
        showUserModal,
        showPasswordModal,
        selectedUser,
        isEditing,
        userData,
        passwordData,
        setSearch,
        setUserData,
        setPasswordData,
        handleSaveUser,
        handleResetPassword,
        handleToggleStatus,
        openAddModal,
        openEditModal,
        openPasswordModal,
        closeUserModal,
        closePasswordModal,
        getRoleClass,
    }
}
