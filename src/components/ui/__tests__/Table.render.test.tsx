// @vitest-environment jsdom
import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { DataTable } from '../Table/DataTable'
import type { Column } from '../Table/DataTable.types'

// crypto.randomUUID is used by the loading skeleton
beforeEach(() => {
  if (!globalThis.crypto?.randomUUID) {
    Object.defineProperty(globalThis, 'crypto', {
      // eslint-disable-next-line sonarjs/pseudo-random
      value: { randomUUID: () => `${Math.random()}` },
      writable: true,
      configurable: true,
    })
  }
})

interface Row {
  id: number
  name: string
  age: number
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name' },
  { key: 'age', header: 'Age' },
]

const sampleData: Row[] = [
  { id: 1, name: 'Alice', age: 25 },
  { id: 2, name: 'Bob', age: 30 },
]

describe('DataTable', () => {
  it('renders column headers', () => {
    render(<DataTable data={sampleData} columns={columns} />)
    expect(screen.getByText('Name')).toBeDefined()
    expect(screen.getByText('Age')).toBeDefined()
  })

  it('renders row data', () => {
    render(<DataTable data={sampleData} columns={columns} />)
    expect(screen.getByText('Alice')).toBeDefined()
    expect(screen.getByText('Bob')).toBeDefined()
  })

  it('shows empty state when no data', () => {
    render(<DataTable data={[]} columns={columns} emptyMessage="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeDefined()
  })

  it('shows loading skeleton when loading', () => {
    const { container } = render(<DataTable data={[]} columns={columns} loading={true} />)
    // Loading state renders Skeleton components (divs with animate-pulse)
    expect(container.querySelector('.animate-pulse')).not.toBeNull()
  })

  it('renders search input', () => {
    render(<DataTable data={sampleData} columns={columns} />)
    expect(screen.getByPlaceholderText('Search...')).toBeDefined()
  })
})
