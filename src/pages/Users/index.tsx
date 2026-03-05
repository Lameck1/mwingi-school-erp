import { Plus, Users, Search, Edit, Lock, Trash, Check, Loader2, UserCircle2, ShieldCheck, Fingerprint, Save } from 'lucide-react'
import React from 'react'

import { useUsers } from './useUsers'
import { PageHeader } from '../../components/patterns/PageHeader'
import { Modal } from '../../components/ui/Modal'

import type { User, CreateUserData } from '../../types/electron-api/UserAPI'

// --- Sub-components ---

type UsersTableContentProps = Readonly<{
    users: User[]
    getRoleClass: (role: User['role']) => string
    onEdit: (user: User) => void
    onResetPassword: (user: User) => void
    onToggleStatus: (user: User) => void
}>

function UsersTableContent({ users, getRoleClass, onEdit, onResetPassword, onToggleStatus }: UsersTableContentProps) {
    return (
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
                {users.map((user) => (
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
                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-widest flex items-center gap-2 w-fit border ${getRoleClass(user.role)}`}>
                                {user.role === 'ADMIN' ? <ShieldCheck className="w-3 h-3" aria-hidden="true" /> : <UserCircle2 className="w-3 h-3" aria-hidden="true" />}
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
                                <button onClick={() => onEdit(user)}
                                    aria-label="Edit user"
                                    className="p-2.5 bg-background border border-border/40 hover:border-blue-500/50 hover:text-blue-500 rounded-xl transition-all shadow-sm">
                                    <Edit className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button onClick={() => onResetPassword(user)}
                                    aria-label="Reset user password"
                                    className="p-2.5 bg-background border border-border/40 hover:border-orange-500/50 hover:text-orange-500 rounded-xl transition-all shadow-sm">
                                    <Lock className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button onClick={() => onToggleStatus(user)}
                                    aria-label={user.is_active ? 'Deactivate user' : 'Activate user'}
                                    className={`p-2.5 bg-background border border-border/40 rounded-xl transition-all shadow-sm ${user.is_active ? 'hover:border-destructive/50 hover:text-destructive' : 'hover:border-emerald-500/50 hover:text-emerald-500'}`}>
                                    {user.is_active ? <Trash className="w-4 h-4" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                                </button>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </div>
    )
}

type UserFormModalProps = Readonly<{
    isOpen: boolean
    onClose: () => void
    isEditing: boolean
    userData: CreateUserData
    onUserDataChange: (data: CreateUserData) => void
    onSubmit: (e: React.SyntheticEvent) => void
    saving: boolean
}>

function UserFormModal({ isOpen, onClose, isEditing, userData, onUserDataChange, onSubmit, saving }: UserFormModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditing ? 'Sync User Profile' : 'Establish New Access Vector'}
            size="sm"
        >
            <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-fullname">Official Full Name</label>
                    <input id="user-fullname" type="text" required value={userData.full_name}
                        onChange={(e) => onUserDataChange({ ...userData, full_name: e.target.value })}
                        className="input w-full" placeholder="e.g. John Doe" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-username">System Handle</label>
                        <input id="user-username" type="text" required value={userData.username}
                            onChange={(e) => onUserDataChange({ ...userData, username: e.target.value })}
                            className="input w-full" disabled={isEditing} placeholder="jdoe" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-role">Permission Tier</label>
                        <select id="user-role" required value={userData.role}
                            onChange={(e) => onUserDataChange({ ...userData, role: e.target.value as 'ADMIN' | 'ACCOUNTS_CLERK' | 'AUDITOR' })}
                            className="input w-full">
                            <option value="ACCOUNTS_CLERK">Accounts Clerk</option>
                            <option value="ADMIN">Administrator</option>
                            <option value="AUDITOR">System Auditor</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-email">Communications Email</label>
                    <input id="user-email" type="email" value={userData.email}
                        onChange={(e) => onUserDataChange({ ...userData, email: e.target.value })}
                        className="input w-full" placeholder="j.doe@school.ac.ke" />
                </div>
                {!isEditing && (
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="user-password">Initial Passkey</label>
                        <input id="user-password" type="password" required value={userData.password}
                            onChange={(e) => onUserDataChange({ ...userData, password: e.target.value })}
                            className="input w-full" />
                    </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                    <button type="button" onClick={onClose} className="btn btn-secondary px-6">Discard</button>
                    <button type="submit" disabled={saving} className="btn btn-primary px-8 flex items-center gap-2">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{isEditing ? 'Push Changes' : 'Establish Access'}</span>
                    </button>
                </div>
            </form>
        </Modal>
    )
}

type PasswordResetModalProps = Readonly<{
    isOpen: boolean
    onClose: () => void
    selectedUsername: string | undefined
    passwordData: { newPassword: string; confirmPassword: string }
    onPasswordDataChange: (data: { newPassword: string; confirmPassword: string }) => void
    onSubmit: (e: React.SyntheticEvent) => void
    saving: boolean
}>

function PasswordResetModal({ isOpen, onClose, selectedUsername, passwordData, onPasswordDataChange, onSubmit, saving }: PasswordResetModalProps) {
    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Security Protocol Override"
            size="sm"
        >
            <div className="mb-6 p-4 bg-orange-500/5 border border-orange-500/20 rounded-xl">
                <p className="text-[11px] font-medium text-orange-500/80 leading-relaxed uppercase tracking-tight">
                    You are initiating a credential reset for user <strong className="text-orange-500">{selectedUsername}</strong>. This will mandate a password update upon next environmental access.
                </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="new-password">New Secure Passphrase</label>
                    <input id="new-password" type="password" required value={passwordData.newPassword}
                        onChange={(e) => onPasswordDataChange({ ...passwordData, newPassword: e.target.value })}
                        className="input w-full" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-widest ml-1" htmlFor="confirm-password">Re-authenticate Passphrase</label>
                    <input id="confirm-password" type="password" required value={passwordData.confirmPassword}
                        onChange={(e) => onPasswordDataChange({ ...passwordData, confirmPassword: e.target.value })}
                        className="input w-full" />
                </div>
                <div className="flex justify-end gap-3 pt-4 border-t border-border/10">
                    <button type="button" onClick={onClose} className="btn btn-secondary px-6">Cancel</button>
                    <button type="submit" disabled={saving} className="btn btn-primary px-8 flex items-center gap-2 shadow-xl shadow-primary/20">
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                        <span>Override Credentials</span>
                    </button>
                </div>
            </form>
        </Modal>
    )
}

export default function UsersPage() {
    const {
        filteredUsers, loading, saving, search, users,
        showUserModal, showPasswordModal, selectedUser, isEditing,
        userData, passwordData,
        setSearch, setUserData, setPasswordData,
        handleSaveUser, handleResetPassword, handleToggleStatus,
        openAddModal, openEditModal, openPasswordModal,
        closeUserModal, closePasswordModal, getRoleClass,
    } = useUsers()

    return (
        <div className="space-y-8 pb-10">
            <PageHeader
                title="User Management"
                subtitle="Oversee system access, roles, and security credentials"
                actions={
                    <button
                        onClick={openAddModal}
                        className="btn btn-primary flex items-center gap-2 py-3 px-8 text-sm font-bold shadow-xl shadow-primary/20 transition-all hover:-translate-y-1"
                    >
                        <Plus className="w-5 h-5" />
                        <span>Establish New User</span>
                    </button>
                }
            />

            <div className="premium-card animate-slide-up">
                <div className="relative group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-foreground/20 group-focus-within:text-primary transition-colors" />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter users by name or identity..."
                        className="input w-full pl-12 h-14 text-lg font-medium"
                    />
                </div>
            </div>

            <div className="card overflow-hidden transition-all duration-300">
                {(() => {
                    if (loading && users.length === 0) {
                        return (
                            <div className="flex flex-col items-center justify-center py-24 gap-4">
                                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                <p className="text-xs font-bold uppercase tracking-widest text-foreground/40">Synchronizing Users...</p>
                            </div>
                        )
                    }

                    if (filteredUsers.length === 0) {
                        return (
                            <div className="text-center py-24 bg-secondary/5 rounded-3xl border border-dashed border-border/40 m-4">
                                <Users className="w-16 h-16 text-foreground/10 mx-auto mb-4" />
                                <h3 className="text-xl font-bold text-foreground/80 font-heading">Void Directory</h3>
                                <p className="text-foreground/40 font-medium italic mb-6">No matching user entities identified in the system</p>
                                <button onClick={openAddModal} className="btn btn-secondary border-2 border-dashed px-8">Add First User</button>
                            </div>
                        )
                    }

                    return (
                        <UsersTableContent
                            users={filteredUsers}
                            getRoleClass={getRoleClass}
                            onEdit={openEditModal}
                            onResetPassword={openPasswordModal}
                            onToggleStatus={handleToggleStatus}
                        />
                    )
                })()}
            </div>

            <UserFormModal
                isOpen={showUserModal}
                onClose={closeUserModal}
                isEditing={isEditing}
                userData={userData}
                onUserDataChange={setUserData}
                onSubmit={handleSaveUser}
                saving={saving}
            />

            <PasswordResetModal
                isOpen={showPasswordModal}
                onClose={closePasswordModal}
                selectedUsername={selectedUser?.username}
                passwordData={passwordData}
                onPasswordDataChange={setPasswordData}
                onSubmit={handleResetPassword}
                saving={saving}
            />
        </div>
    )
}
