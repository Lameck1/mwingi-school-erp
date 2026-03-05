// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Sidebar } from '../Sidebar'
import type { LayoutModel } from '../types'

vi.mock('react-router-dom', () => ({
  NavLink: ({ children, className }: { children: React.ReactNode; className: string | ((_: { isActive: boolean }) => string) }) => {
    const resolvedClass = typeof className === 'function' ? className({ isActive: false }) : className
    return <a href="/test" className={resolvedClass}>{children}</a>
  },
  useLocation: () => ({ pathname: '/' }),
}))

function makeModel(overrides: Partial<LayoutModel> = {}): LayoutModel {
  return {
    user: { id: 1, username: 'admin', full_name: 'Admin User', role: 'ADMIN', is_active: true, email: '', last_login: '', created_at: '', updated_at: '' },
    schoolName: 'Mwingi Adventist School',
    currentAcademicYearName: '2025',
    isOnline: true,
    isSidebarOpen: true,
    setIsSidebarOpen: vi.fn(),
    expandedMenus: [],
    toggleMenu: vi.fn(),
    pathname: '/',
    theme: 'dark',
    toggleTheme: vi.fn(),
    handleLogout: vi.fn(),
    ...overrides,
  }
}

describe('Sidebar', () => {
  it('renders without crashing', () => {
    render(<Sidebar model={makeModel()} />)
    expect(screen.getByText('ERP System')).toBeDefined()
  })

  it('shows the short school name', () => {
    render(<Sidebar model={makeModel()} />)
    expect(screen.getByText('Mwingi')).toBeDefined()
  })

  it('displays the user name', () => {
    render(<Sidebar model={makeModel()} />)
    expect(screen.getByText('Admin User')).toBeDefined()
  })

  it('renders navigation items', () => {
    render(<Sidebar model={makeModel()} />)
    expect(screen.getByText('Dashboard')).toBeDefined()
    expect(screen.getByText('Finance')).toBeDefined()
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('calls handleLogout when sign out is clicked', () => {
    const handleLogout = vi.fn()
    render(<Sidebar model={makeModel({ handleLogout })} />)
    fireEvent.click(screen.getByText('Sign Out'))
    expect(handleLogout).toHaveBeenCalledTimes(1)
  })
})
