import * as fs from 'node:fs'
import * as path from 'node:path'

import { BrowserWindow, app } from '../electron-env'

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  try {
    await window.loadURL(dataUrl)
    const buffer = await window.webContents.printToPDF({ printBackground: true })
    return buffer
  } finally {
    window.close()
  }
}

export function resolveOutputPath(filename: string, folderName: string = 'exports'): string {
  const documentsPath = app.getPath('documents')
  const folder = path.join(documentsPath, 'MwingiSchoolERP', folderName)
  fs.mkdirSync(folder, { recursive: true })
  return path.join(folder, filename)
}

export function writePdfBuffer(filePath: string, buffer: Buffer): void {
  fs.writeFileSync(filePath, buffer)
}
