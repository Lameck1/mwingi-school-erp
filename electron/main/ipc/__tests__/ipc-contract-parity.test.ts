/// <reference types="node" />
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type IpcHandler = (event: unknown, ...args: unknown[]) => Promise<unknown>

const registeredChannels = new Set<string>()

vi.mock('../../electron-env', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, _handler: IpcHandler) => {
      registeredChannels.add(channel)
    }),
    removeHandler: vi.fn()
  },
  dialog: {
    showErrorBox: vi.fn(),
    showMessageBox: vi.fn(async () => ({ response: 1 }))
  },
  app: {
    getPath: vi.fn(() => 'C:/tmp'),
    quit: vi.fn(),
    isPackaged: false
  },
  shell: {
    openPath: vi.fn(async () => '')
  },
  BrowserWindow: {}
}))

vi.mock('../../database', () => {
  const mockDb = {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
      get: vi.fn(() => null),
      run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 }))
    })),
    transaction: vi.fn((fn: (...args: unknown[]) => unknown) => (...args: unknown[]) => fn(...args)),
    exec: vi.fn(),
    close: vi.fn(),
    pragma: vi.fn(() => [])
  }
  return {
    getDatabase: vi.fn(() => mockDb),
    initializeDatabase: vi.fn(),
    backupDatabase: vi.fn(),
    logAudit: vi.fn(),
    db: mockDb
  }
})

vi.mock('../../services/base/ServiceContainer', () => ({
  container: {
    resolve: vi.fn(() => new Proxy({}, {
      get: () => vi.fn()
    })),
    register: vi.fn()
  }
}))

vi.mock('bcryptjs', () => ({
  compare: vi.fn().mockResolvedValue(true),
  hash: vi.fn().mockResolvedValue('hashed_password')
}))

vi.mock('electron-log', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    transports: {
      file: { level: 'info', maxSize: 0, format: '' },
      console: { level: 'info' }
    }
  }
}))

vi.mock('electron-updater', () => ({
  autoUpdater: {
    logger: undefined,
    autoDownload: false,
    autoInstallOnAppQuit: false,
    on: vi.fn(),
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn()
  }
}))

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const workspaceRoot = path.resolve(currentDir, '../../../../')
const preloadApiDir = path.join(workspaceRoot, 'electron/preload/api')
const ipcMainDir = path.join(workspaceRoot, 'electron/main/ipc')
const updateHandlersFile = path.join(workspaceRoot, 'electron/main/updates/autoUpdater.ts')

function collectFiles(dir: string, extension: string): string[] {
  const files: string[] = []
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath, extension))
      continue
    }
    if (entry.isFile() && fullPath.endsWith(extension)) {
      files.push(fullPath)
    }
  }
  return files
}

function collectInvokedChannels(files: string[]): Set<string> {
  const channels = new Set<string>()
  const invokeRegex = /ipcRenderer\.invoke\(\s*'([^']+)'/g

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const match of content.matchAll(invokeRegex)) {
      channels.add(match[1])
    }
  }
  return channels
}

function collectDeclaredChannels(files: string[]): Set<string> {
  const channels = new Set<string>()
  const registerRegex = /(?:safeHandle(?:RawWithRole|WithRole|Raw)?|validatedHandler(?:Multi)?|ipcMain\.handle)\(\s*'([^']+)'/g

  for (const filePath of files) {
    if (filePath.includes('__tests__') || filePath.endsWith('.test.ts')) {
      continue
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const withoutBlockComments = content.replace(/\/\*[\s\S]*?\*\//g, '')
    const withoutComments = withoutBlockComments
      .split('\n')
      .map((line) => {
        const commentIndex = line.indexOf('//')
        return commentIndex >= 0 ? line.slice(0, commentIndex) : line
      })
      .join('\n')

    for (const match of withoutComments.matchAll(registerRegex)) {
      channels.add(match[1])
    }
  }
  return channels
}

async function registerRuntimeChannels(): Promise<Set<string>> {
  registeredChannels.clear()
  const { registerAllIpcHandlers } = await import('../index')
  const { registerDisabledUpdateHandlers } = await import('../../updates/autoUpdater')
  registerAllIpcHandlers()
  registerDisabledUpdateHandlers('test')
  return new Set(registeredChannels)
}

describe('IPC contract parity (runtime registration)', () => {
  beforeEach(() => {
    vi.resetModules()
    registeredChannels.clear()
  })

  it('registers runtime handlers for every preload-invoked channel', async () => {
    const preloadFiles = collectFiles(preloadApiDir, '.ts')
    const channelsInvokedByPreload = collectInvokedChannels(preloadFiles)
    const runtimeRegisteredChannels = await registerRuntimeChannels()

    const missingAtRuntime = [...channelsInvokedByPreload].filter((channel) => !runtimeRegisteredChannels.has(channel))
    expect(missingAtRuntime).toEqual([])
  }, 30000)

  it('registers every declared main-process IPC channel at runtime', async () => {
    const mainIpcFiles = collectFiles(ipcMainDir, '.ts')
    const declaredChannels = collectDeclaredChannels([...mainIpcFiles, updateHandlersFile])
    const runtimeRegisteredChannels = await registerRuntimeChannels()

    const declaredButNotRuntime = [...declaredChannels].filter((channel) => !runtimeRegisteredChannels.has(channel))
    expect(declaredButNotRuntime).toEqual([])
  }, 30000)
})
