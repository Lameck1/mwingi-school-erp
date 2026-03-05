// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { Modal } from '../Modal'

describe('Modal', () => {
  it('renders when open', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Test Title">
        <p>Modal body</p>
      </Modal>,
    )
    expect(screen.getByText('Test Title')).toBeDefined()
  })

  it('does not render when closed', () => {
    render(
      <Modal isOpen={false} onClose={vi.fn()} title="Hidden Title">
        <p>Hidden body</p>
      </Modal>,
    )
    expect(screen.queryByText('Hidden Title')).toBeNull()
  })

  it('shows the title', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="My Modal">
        <p>content</p>
      </Modal>,
    )
    expect(screen.getByText('My Modal')).toBeDefined()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()
    render(
      <Modal isOpen={true} onClose={onClose} title="Closable">
        <p>content</p>
      </Modal>,
    )
    fireEvent.click(screen.getByTitle('Close dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders children content', () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} title="Parent">
        <span>Child element</span>
      </Modal>,
    )
    expect(screen.getByText('Child element')).toBeDefined()
  })
})
