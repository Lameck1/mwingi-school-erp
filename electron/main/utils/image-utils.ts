import * as fs from 'node:fs'
import * as path from 'node:path'

import { app } from '../electron-env'

/**
 * Get the root images directory in userData.
 */
function getImagesDir(subfolder: string): string {
    const dir = path.join(app.getPath('userData'), 'images', subfolder)
    fs.mkdirSync(dir, { recursive: true })
    return dir
}

/**
 * Parse a data URL and return the buffer and MIME type.
 */
function parseDataUrl(dataUrl: string): { buffer: Buffer; ext: string } {
    const regex = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,(.+)$/i
    const match = regex.exec(dataUrl)
    if (!match) {
        throw new Error('Invalid image data URL format. Expected data:image/<type>;base64,...')
    }
    const mimeExt = match[1]!.replace('jpeg', 'jpg').replace('svg+xml', 'svg')
    const buffer = Buffer.from(match[2]!, 'base64')
    return { buffer, ext: mimeExt }
}

/**
 * Save an image from a base64 data URL to disk.
 * Returns the absolute path of the saved file.
 */
export function saveImageFromDataUrl(dataUrl: string, subfolder: string, filename: string): string {
    const { buffer, ext } = parseDataUrl(dataUrl)

    // Limit file size to 5MB
    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Image file size exceeds 5MB limit')
    }

    const dir = getImagesDir(subfolder)
    const finalFilename = `${filename}.${ext}`
    const filePath = path.join(dir, finalFilename)

    fs.writeFileSync(filePath, buffer)
    return filePath
}

/**
 * Read an image file from disk and return it as a base64 data URL.
 * Returns null if the file does not exist.
 */
export function getImageAsBase64DataUrl(imagePath: string): string | null {
    if (!imagePath) { return null }

    let finalPath = imagePath
    if (!fs.existsSync(finalPath)) {
        // Fallback: Check relative to userData/images
        const fallbackPath = path.join(app.getPath('userData'), 'images', imagePath)
        if (fs.existsSync(fallbackPath)) {
            finalPath = fallbackPath
        } else {
            // Second fallback: if it's just a filename in a subfolder
            return null
        }
    }

    const ext = path.extname(finalPath).slice(1).toLowerCase()
    const mimeMap: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        svg: 'image/svg+xml',
    }
    const mime = mimeMap[ext] || 'image/png'
    const buffer = fs.readFileSync(imagePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Delete an image file from disk.
 */
export function deleteImage(imagePath: string): void {
    if (imagePath && fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath)
    }
}
