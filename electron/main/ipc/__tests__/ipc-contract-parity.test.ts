/// <reference types="node" />
import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

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

function collectRegisteredInvokeChannels(files: string[]): Set<string> {
  const channels = new Set<string>()
  const registerRegex = /(?:safeHandle(?:RawWithRole|WithRole|Raw)?|validatedHandler(?:Multi)?)\(\s*'([^']+)'/g

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const match of content.matchAll(registerRegex)) {
      channels.add(match[1])
    }
  }
  return channels
}

describe('IPC contract parity', () => {
  it('has a registered main-process handler for every preload-invoked channel', () => {
    const preloadFiles = collectFiles(preloadApiDir, '.ts')
    const mainIpcFiles = collectFiles(ipcMainDir, '.ts')
    const channelsInvokedByPreload = collectInvokedChannels(preloadFiles)
    const channelsRegisteredByMain = collectRegisteredInvokeChannels([
      ...mainIpcFiles,
      updateHandlersFile
    ])

    const missing = [...channelsInvokedByPreload].filter((channel) => !channelsRegisteredByMain.has(channel))
    expect(missing).toEqual([])
  })
})
