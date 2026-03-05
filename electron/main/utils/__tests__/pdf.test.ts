import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const printToPDFMock = vi.fn()
  const loadURLMock = vi.fn()
  const closeMock = vi.fn()

  // Use a class so `new BrowserWindow(...)` works (arrow functions can't be constructors)
  class MockBrowserWindow {
    loadURL = loadURLMock
    webContents = { printToPDF: printToPDFMock }
    close = closeMock
  }

  return {
    printToPDF: printToPDFMock,
    loadURL: loadURLMock,
    close: closeMock,
    BrowserWindow: MockBrowserWindow,
    app: {
      getPath: vi.fn(() => '/fake/documents'),
    },
    mkdir: vi.fn(),
    writeFile: vi.fn(),
  }
})

vi.mock('../../electron-env', () => ({
  BrowserWindow: mocks.BrowserWindow,
  app: mocks.app,
}))

vi.mock('node:fs/promises', () => ({
  mkdir: mocks.mkdir,
  writeFile: mocks.writeFile,
}))

import { renderHtmlToPdfBuffer, resolveOutputPath, writePdfBuffer } from '../pdf'

describe('utils/pdf', () => {
  beforeEach(() => {
    mocks.printToPDF.mockReset()
    mocks.loadURL.mockReset()
    mocks.close.mockReset()
    mocks.mkdir.mockReset()
    mocks.writeFile.mockReset()
    mocks.loadURL.mockResolvedValue(void 0)
    mocks.printToPDF.mockResolvedValue(Buffer.from('pdf-content'))
    mocks.mkdir.mockResolvedValue(void 0)
    mocks.writeFile.mockResolvedValue(void 0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders HTML to PDF buffer via hidden BrowserWindow', async () => {
    const buf = await renderHtmlToPdfBuffer('<h1>Hello</h1>')

    expect(mocks.loadURL).toHaveBeenCalledWith(expect.stringContaining('data:text/html'))
    expect(mocks.printToPDF).toHaveBeenCalledWith({ printBackground: true })
    expect(buf).toEqual(Buffer.from('pdf-content'))
  })

  it('closes the window after successful rendering', async () => {
    await renderHtmlToPdfBuffer('<p>test</p>')
    expect(mocks.close).toHaveBeenCalled()
  })

  it('closes the window even when rendering fails', async () => {
    mocks.printToPDF.mockRejectedValueOnce(new Error('render failure'))

    await expect(renderHtmlToPdfBuffer('<p>fail</p>')).rejects.toThrow('render failure')
    expect(mocks.close).toHaveBeenCalled()
  })

  it('resolveOutputPath creates directory and returns full path', async () => {
    const result = await resolveOutputPath('report.pdf')

    expect(mocks.mkdir).toHaveBeenCalledWith(
      expect.stringContaining('MwingiSchoolERP'),
      { recursive: true }
    )
    expect(result).toContain('report.pdf')
  })

  it('writePdfBuffer writes buffer to the specified file path', async () => {
    const buffer = Buffer.from('pdf-data')
    await writePdfBuffer('/path/to/output.pdf', buffer)

    expect(mocks.writeFile).toHaveBeenCalledWith('/path/to/output.pdf', buffer)
  })
})
