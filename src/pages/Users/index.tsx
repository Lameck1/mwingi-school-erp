import { useEffect, useState } from 'react'
import { Plus, Users, Search, Edit, Lock, Trash, X, Check } from 'lucide-react'

export default function UsersPage() {
    const [users, setUsers] = useState<any[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState('')
    
    // Modals state
    const [showUserModal, setShowUserModal] = useState(false)
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [selectedUser, setSelectedUser] = useState<any>(null)
    const [isEditing, setIsEditing] = useState(false)

    // Form data
    const [userData, setUserData] = useState({
        username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: ''
    })
    
    const [passwordData, setPasswordData] = useState({
        newPassword: '', confirmPassword: ''
    })

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        try {
            const usersData = await window.electronAPI.getUsers()
            setUsers(usersData)
        } catch (error) {
            console.error('Failed to load users:', error)
        } finally { setLoading(false) }
    }

    const handleSaveUser = async (e: React.FormEvent) => {
        e.preventDefault()
        try {
            if (isEditing) {
                // For edit, we don't send password unless specifically changing it (which is handled separately)
                // The API expects just the fields to update
                const { password, ...updateData } = userData
                await window.electronAPI.updateUser(selectedUser.id, updateData)
            } else {
                await window.electronAPI.createUser(userData)
            }
            
            setShowUserModal(false)
            resetForms()
            loadData()
        } catch (error: any) {
            console.error('Failed to save user:', error)
            alert(error.message || 'Failed to save user')
        }
    }

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault()
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            alert("Passwords don't match")
            return
        }

        try {
            await window.electronAPI.resetUserPassword(selectedUser.id, passwordData.newPassword)
            setShowPasswordModal(false)
            resetForms()
            alert('Password reset successfully')
        } catch (error: any) {
            console.error('Failed to reset password:', error)
            alert(error.message || 'Failed to reset password')
        }
    }

    const handleToggleStatus = async (user: any) => {
        if (!confirm(`Are you sure you want to ${user.is_active ? 'deactivate' : 'activate'} this user?`)) return

        try {
            await window.electronAPI.toggleUserStatus(user.id, !user.is_active)
            loadData()
        } catch (error) {
            console.error('Failed to toggle status:', error)
        }
    }

    const openAddModal = () => {
        setIsEditing(false)
        setUserData({ username: '', full_name: '', email: '', role: 'ACCOUNTS_CLERK', password: '' })
        setShowUserModal(true)
    }

    const openEditModal = (user: any) => {
        setIsEditing(true)
        setSelectedUser(user)
        setUserData({
            username: user.username,
            full_name: user.full_name,
            email: user.email || '',
            role: user.role,
            password: '' // Password not editable here
        })
        setShowUserModal(true)
    }

    const openPasswordModal = (user: any) => {
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
        <div className="p-6">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
                    <p className="text-gray-500 mt-1">Manage system users and access roles</p>
                </div>
                <button onClick={openAddModal} className="btn btn-primary flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    <span>Add User</span>
                </button>
            </div>

            <div className="card mb-6">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search users"
                        placeholder="Search users..." className="input pl-10" />
                </div>
            </div>

            <div className="card">
                {loading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : filteredUsers.length === 0 ? (
                    <div className="text-center py-12">
                        <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">No Users Found</h3>
                        <p className="text-gray-500 mb-4">Create the first user to get started</p>
                        <button onClick={openAddModal} className="btn btn-primary">Add User</button>
                    </div>
                ) : (
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Username</th>
                                <th>Full Name</th>
                                <th>Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUsers.map((user) => (
                                <tr key={user.id}>
                                    <td className="font-medium">{user.username}</td>
                                    <td>{user.full_name}</td>
                                    <td>{user.email || '-'}</td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                                            user.role === 'AUDITOR' ? 'bg-blue-100 text-blue-700' :
                                            'bg-gray-100 text-gray-700'
                                        }`}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                            user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                        }`}>
                                            {user.is_active ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="text-sm text-gray-500">
                                        {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                                    </td>
                                    <td>
                                        <div className="flex gap-2">
                                            <button onClick={() => openEditModal(user)} 
                                                title="Edit User"
                                                className="p-1 text-blue-600 hover:bg-blue-50 rounded">
                                                <Edit className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => openPasswordModal(user)} 
                                                title="Reset Password"
                                                className="p-1 text-orange-600 hover:bg-orange-50 rounded">
                                                <Lock className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => handleToggleStatus(user)} 
                                                title={user.is_active ? "Deactivate" : "Activate"}
                                                className={`p-1 rounded ${user.is_active ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}>
                                                {user.is_active ? <Trash className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Add/Edit User Modal */}
            {showUserModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-md p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">{isEditing ? 'Edit User' : 'Add New User'}</h2>
                            <button onClick={() => setShowUserModal(false)} aria-label="Close modal"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={handleSaveUser} className="space-y-4">
                            <div>
                                <label className="label" htmlFor="user-fullname">Full Name *</label>
                                <input id="user-fullname" type="text" required value={userData.full_name}
                                    onChange={(e) => setUserData({ ...userData, full_name: e.target.value })}
                                    className="input" />
                            </div>
                            <div>
                                <label className="label" htmlFor="user-username">Username *</label>
                                <input id="user-username" type="text" required value={userData.username}
                                    onChange={(e) => setUserData({ ...userData, username: e.target.value })}
                                    className="input" disabled={isEditing} />
                            </div>
                            <div>
                                <label className="label" htmlFor="user-email">Email</label>
                                <input id="user-email" type="email" value={userData.email}
                                    onChange={(e) => setUserData({ ...userData, email: e.target.value })}
                                    className="input" />
                            </div>
                            <div>
                                <label className="label" htmlFor="user-role">Role *</label>
                                <select id="user-role" required value={userData.role}
                                    onChange={(e) => setUserData({ ...userData, role: e.target.value })}
                                    className="input">
                                    <option value="ACCOUNTS_CLERK">Accounts Clerk</option>
                                    <option value="ADMIN">Admin</option>
                                    <option value="AUDITOR">Auditor</option>
                                </select>
                            </div>
                            {!isEditing && (
                                <div>
                                    <label className="label" htmlFor="user-password">Password *</label>
                                    <input id="user-password" type="password" required value={userData.password}
                                        onChange={(e) => setUserData({ ...userData, password: e.target.value })}
                                        className="input" />
                                </div>
                            )}
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowUserModal(false)} className="btn btn-ghost">Cancel</button>
                                <button type="submit" className="btn btn-primary">Save User</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Reset Password Modal */}
            {showPasswordModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg w-full max-w-sm p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">Reset Password</h2>
                            <button onClick={() => setShowPasswordModal(false)} aria-label="Close modal"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Resetting password for <strong>{selectedUser?.username}</strong>
                        </p>
                        <form onSubmit={handleResetPassword} className="space-y-4">
                            <div>
                                <label className="label" htmlFor="new-password">New Password *</label>
                                <input id="new-password" type="password" required value={passwordData.newPassword}
                                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                    className="input" />
                            </div>
                            <div>
                                <label className="label" htmlFor="confirm-password">Confirm Password *</label>
                                <input id="confirm-password" type="password" required value={passwordData.confirmPassword}
                                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                    className="input" />
                            </div>
                            <div className="flex justify-end gap-3 mt-6">
                                <button type="button" onClick={() => setShowPasswordModal(false)} className="btn btn-ghost">Cancel</button>
                                <button type="submit" className="btn btn-primary">Reset Password</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
