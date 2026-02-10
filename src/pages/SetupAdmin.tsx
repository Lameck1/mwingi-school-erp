import { Eye, EyeOff, Loader2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const SetupAdmin: React.FC = () => {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    username: '',
    password: '',
    confirm: ''
  })

  useEffect(() => {
    const checkExistingUsers = async () => {
      const hasUsers = await globalThis.electronAPI.hasUsers()
      if (hasUsers) {
        navigate('/login')
      }
    }
    void checkExistingUsers()
  }, [navigate])

  const onChange = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [key]: e.target.value }))
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!form.full_name || !form.username || !form.password) {
      setError('Please fill all required fields')
      return
    }
    if (form.password !== form.confirm) {
      setError('Passwords do not match')
      return
    }
    setLoading(true)
    try {
      const result = await globalThis.electronAPI.setupAdmin({
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        email: form.email
      })
      if (!result.success) {
        setError(result.error || 'Failed to create admin user')
        return
      }
      navigate('/login')
    } catch (err) {
      setError((err as Error).message || 'Failed to create admin user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-white rounded-full mx-auto mb-4 flex items-center justify-center shadow-lg">
            <span className="text-3xl font-bold text-blue-600">MAS</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Initial Setup</h1>
          <p className="text-blue-200 mt-1">Create the first administrator account</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-xl font-semibold text-gray-800 text-center mb-6">Administrator Setup</h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-5">
            <div>
              <label className="label" htmlFor="setup-full-name">Full Name</label>
              <input
                id="setup-full-name"
                type="text"
                value={form.full_name}
                onChange={onChange('full_name')}
                className="input"
                placeholder="Enter full name"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="label" htmlFor="setup-email">Email</label>
              <input
                id="setup-email"
                type="email"
                value={form.email}
                onChange={onChange('email')}
                className="input"
                placeholder="Enter email (optional)"
                disabled={loading}
              />
            </div>

            <div>
              <label className="label" htmlFor="setup-username">Username</label>
              <input
                id="setup-username"
                type="text"
                value={form.username}
                onChange={onChange('username')}
                className="input"
                placeholder="Choose a username"
                required
                disabled={loading}
              />
            </div>

            <div>
              <label className="label" htmlFor="setup-password">Password</label>
              <div className="relative">
                <input
                  id="setup-password"
                  type={showPassword ? 'text' : 'password'}
                  value={form.password}
                  onChange={onChange('password')}
                  className="input pr-10"
                  placeholder="Create a password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="setup-confirm-password">Confirm Password</label>
              <div className="relative">
                <input
                  id="setup-confirm-password"
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirm}
                  onChange={onChange('confirm')}
                  className="input pr-10"
                  placeholder="Confirm password"
                  required
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showConfirm ? 'Hide confirm password' : 'Show confirm password'}
                >
                  {showConfirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <span>Create Admin Account</span>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-blue-200 text-sm mt-6">
          &copy; {new Date().getFullYear()} Mwingi Adventist School
        </p>
      </div>
    </div>
  )
}

export default SetupAdmin
