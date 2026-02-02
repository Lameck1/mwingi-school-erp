import React, { useEffect, useState } from 'react'
import { Plus, Users, Search, Edit, Lock, Trash, X, Check, Loader2, UserCircle2, ShieldCheck, Fingerprint, Save } from 'lucide-react'
import type { User, CreateUserData, UpdateUserData } from '../../types/electron-api/UserAPI'
import { Modal } from '../../components/ui/Modal'
import { useToast } from '../../contexts/ToastContext'

export default function UsersPage() {
    const { showToast } = useToast()
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [search, setSearch] = useState('')

    // Modals state
    const [showUserModal, setShowUserModal] = useState(false)
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [isEditing, setIsEditing] = useState(false)

    // Form data
    const [userData, setUserData] = useState<CreateUserData>({
        username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: ''
    })

    const [passwordData, setPasswordData] = useState({
        newPassword: '', confirmPassword: ''
    })

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const usersData = await window.electronAPI.getUsers()
            setUsers(usersData)
        } catch (error) {
            console.error('Failed to load users:', error)
            showToast('Failed to load system users', 'error')
        } finally { setLoading(false) }
    }

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        try {
            if (isEditing && selectedUser) {
                const { password, ...updateData } = userData // eslint-disable-line no-unused-vars
                await window.electronAPI.updateUser(selectedUser.id, updateData as UpdateUserData)
                showToast('User profile updated successfully', 'success')
            } else {
                await window.electronAPI.createUser(userData)
                showToast('New user account established', 'success')
            }

            setShowUserModal(false)
            resetForms()
            loadData()
        } catch (error) {
            console.error('Failed to save user:', error)
            showToast(error instanceof Error ? error.message : 'Critical error saving user', 'error')
        } finally {
            setSaving(false)
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            showToast("Passwords do not match", 'error')
            return
        }

        if (!selectedUser) return

        setSaving(true)
        try {
            await window.electronAPI.resetUserPassword(selectedUser.id, passwordData.newPassword)
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
        if (!confirm(`Are you sure you want to ${action} user "${user.username}"?`)) return

        try {
            await window.electronAPI.toggleUserStatus(user.id, !user.is_active)
            showToast(`User ${action}d successfully`, 'success')
            loadData()
        } catch (error) {
            console.error('Failed to toggle status:', error)
            showToast('Status transition failed', 'error')
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

    const resetForms = () => {
        setUserData({ username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: '' })
        setPasswordData({ newPassword: '', confirmPassword: '' })
        setSelectedUser(null)
        setIsEditing(false)
    }

    const filteredUsers = users.filter(u =>
        u.username.toLowerCase().includes(search.toLowerCase()) ||
        u.full_name.toLowerCase().includes(search.toLowerCase())
    )

    return (
        <div className="space-y-8 pb-10">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-bold text-foreground font-heading uppercase tracking-tight">User Management</h1>
                    <p className="text-foreground/50 mt-1 font-medium italic">Oversee system access, roles, and security credentials</p>
                </div>
                <button
                    onClick={openAddModal}
                    className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                >
                    <Plus className="w-5 h-5" />
                    <span>Establish New User</span>
                </button>
            </div>

            <div className="premium-card animate-slide-up">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/20 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter users by name or identity..."
                        className="input w-full pl-12 bg-secondary/30 h-14 text-lg font-medium"
                    />
                </div>
            </div>

            <div className="card overflow-hidden transition-all duration-300">
                {loading && users.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 gap-4">
                        <Loader2 className="w-10 h-10 text-primary animate-spin" />
                        <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Synchronizing Users...</p>
                    </div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                        <Users className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-foreground/80 font-heading">Void Directory</h3>
                        <p className="text-foreground/40 font-medium italic mb-6">No matching user entities identified in the system</p>
                        <button onClick={openAddModal} className="btn btn-secondary border-2 border-dashed px-8">Add First User</button>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="data-table">
                            <thead>
                                <tr className="border-b border-border/40">
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Identity</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Role Profile</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Auth Status</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40">Last Vector</th>
                                    <th className="py-5 font-bold uppercase tracking-widest text-[10px] text-foreground/40 text-right px-6">Direct Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/10">
                                {filteredUsers.map((user) => (
                                    <tr key={user.id} className="group hover:bg-secondary/20 transition-colors">
                                        <td className="py-4">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold shadow-inner">
                                                    {user.full_name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-foreground">{user.full_name}</p>
                                                    <p className="text-[11px] font-mono text-foreground/40 tracking-tight">{user.username} • {user.email || 'No Email'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${user.role === 'ADMIN' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
                                                    user.role === 'AUDITOR' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                                        'bg-secondary/50 text-foreground/50 border-border/40'
                                                }`}>
                                                {user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3" /> : <UserCircle2 className="w-3 h-3" />}
                                                {user.role}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${user.is_active ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 shadow-sm shadow-emerald-500/10' : 'bg-destructive/10 text-destructive border-destructive/20'
                                                }`}>
                                                <div className={`w-1.5 h-1.5 rounded-full ${user.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-destructive'}`} />
                                                {user.is_active ? 'VERIFIED' : 'SUSPENDED'}
                                            </span>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2 text-foreground/40">
                                                <Fingerprint className="w-3 h-3" />
                                                <span className="text-[11px] font-medium italic">
                                                    {user.last_login ? new Date(user.last_login).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'No Activity'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4 px-6 text-right">
                                            <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => openEditModal(user)}
                                                    className="p-2.5 bg-background border border-border/40 hover:border-blue-500/50 hover:text-blue-500 rounded-xl transition-all shadow-sm">
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => openPasswordModal(user)}
                                                    className="p-2.5 bg-background border border-border/40 hover:border-orange-500/50 hover:text-orange-500 rounded-xl transition-all shadow-sm">
                                                    <Lock className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleToggleStatus(user)}
                                                    className={`p-2.5 bg-background border border-border/40 rounded-xl transition-all shadow-sm ${user.is_active ? 'hover:border-destructive/50 hover:text-destructive' : 'hover:border-emerald-500/50 hover:text-emerald-500'}`}>
                                                    {user.is_active ? <Trash className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* User Modification Modal */}
            <Modal
                isOpen={showUserModal}
                onClose={() => setShowUserModal(false)}
                title={isEditing ? 'Sync User Profile' : 'Establish New Access Vector'}
                size="sm"
            >
                <form onSubmit={handleSaveUser} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-fullname">Official Full Name</label>
                        <input id="user-fullname" type="text" required value={userData.full_name}
                            onChange={(e) => setUserData({ ...userData, full_name: e.target.value })}
                            className="input w-full bg-secondary/30" placeholder="e.g. John Doe" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-username">System Handle</label>
                            <input id="user-username" type="text" required value={userData.username}
                                onChange={(e) => setUserData({ ...userData, username: e.target.value })}
                                className="input w-full bg-secondary/30" disabled={isEditing} placeholder="jdoe" />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-role">Permission Tier</label>
                            <select id="user-role" required value={userData.role}
                                onChange={(e) => setUserData({ ...userData, role: e.target.value as 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR' })}
                                className="input w-full bg-secondary/30">
                                <option value="ACCOUNTS_CLERK">Accounts Clerk</option>
                                <option value="ADMIN">Administrator</option>
                                <option value="AUDITOR">System Auditor</option>
                            </select>
                        </div>
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-email">Communications Email</label>
                        <input id="user-email" type="email" value={userData.email}
                            onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                            className="input w-full bg-secondary/30" placeholder="j.doe@school.ac.ke" />
                    </div>
                    {!isEditing && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-password">Initial Passkey</label>
                            <input id="user-password" type="password" required value={userData.password}
                                onChange={(e) => setUserData({ ...userData, password: e.target.value })}
                                className="input w-full bg-secondary/30" />
                        </div>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                        <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-secondary px-6">Discard</button>
                        <button type="submit" disabled={saving} className="btn btn-primary px-8 flex items-center gap-2">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            <span>{isEditing ? 'Push Changes' : 'Establish Access'}</span>
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Credential Reset Modal */}
            <Modal
                isOpen={showPasswordModal}
                onClose={() => setShowPasswordModal(false)}
                title="Security Protocol Override"
                size="sm"
            >
                <div className="mb-6 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                    <p className="text-[11px] font-medium text-orange-500/80 leading-relaxed uppercase tracking-tight">
                        You are initiating a credential reset for user <strong className="text-orange-500">{selectedUser?.username}</strong>. This will mandate a password update upon next environmental access.
                    </p>
                </div>
                <form onSubmit={handleResetPassword} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="new-password">New Secure Passphrase</label>
                        <input id="new-password" type="password" required value={passwordData.newPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                            className="input w-full bg-secondary/30" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="confirm-password">Re-authenticate Passphrase</label>
                        <input id="confirm-password" type="password" required value={passwordData.confirmPassword}
                            onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                            className="input w-full bg-secondary/30" />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                        <button type="button" onClick={() => setShowPasswordModal(false)} className="btn btn-secondary px-6">Cancel</button>
                        <button type="submit" disabled={saving} className="btn btn-primary px-8 flex items-center gap-2 shadow-xl shadow-primary/20">
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                            <span>Override Credentials</span>
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    )
}
