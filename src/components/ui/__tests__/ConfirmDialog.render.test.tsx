// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { ConfirmDialog } from '../ConfirmDialog'

const baseProps = {
  isOpen: true,
  title: 'Confirm Action',
  message: 'Are you sure?',
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
}

describe('ConfirmDialog', () => {
  it('renders when open', () => {
    render(<ConfirmDialog {...baseProps} />)
    expect(screen.getByText('Confirm Action')).toBeDefined()
  })

  it('shows the message', () => {
    render(<ConfirmDialog {...baseProps} />)
    expect(screen.getByText('Are you sure?')).toBeDefined()
  })

  it('shows confirm and cancel buttons with default labels', () => {
    render(<ConfirmDialog {...baseProps} />)
    expect(screen.getByText('Confirm')).toBeDefined()
    expect(screen.getByText('Cancel')).toBeDefined()
  })

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn()
    render(<ConfirmDialog {...baseProps} onConfirm={onConfirm} />)
    fireEvent.click(screen.getByText('Confirm'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn()
    render(<ConfirmDialog {...baseProps} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
