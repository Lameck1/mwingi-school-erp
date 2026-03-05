import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { app } from '../electron-env'

/**
 * Get the root images directory in userData.
 * Caches already-created directories to avoid redundant mkdirSync calls.
 */
const createdDirs = new Set<string>()
async function getImagesDir(subfolder: string): Promise<string> {
    const dir = path.join(app.getPath('userData'), 'images', subfolder)
    if (!createdDirs.has(dir)) {
        await fsp.mkdir(dir, { recursive: true })
        createdDirs.add(dir)
    }
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
export async function saveImageFromDataUrl(dataUrl: string, subfolder: string, filename: string): Promise<string> {
    const { buffer, ext } = parseDataUrl(dataUrl)

    // Limit file size to 5MB
    if (buffer.length > 5 * 1024 * 1024) {
        throw new Error('Image file size exceeds 5MB limit')
    }

    const dir = await getImagesDir(subfolder)
    const finalFilename = `${filename}.${ext}`
    const filePath = path.join(dir, finalFilename)

    await fsp.writeFile(filePath, buffer)
    return filePath
}

/**
 * Read an image file from disk and return it as a base64 data URL.
 * Returns null if the file does not exist.
 */
export async function getImageAsBase64DataUrl(imagePath: string): Promise<string | null> {
    if (!imagePath) { return null }

    // Security: Resolve against the images root and verify containment to prevent path traversal
    const imagesRoot = path.join(app.getPath('userData'), 'images')
    const resolvedFromRoot = path.resolve(imagesRoot, imagePath)

    // First try the path as provided (may be absolute from a previous save)
    const resolvedAbsolute = path.resolve(imagePath)

    // Ensure any absolute path is within the images directory
    let finalPath: string
    if (resolvedAbsolute.startsWith(imagesRoot + path.sep) || resolvedAbsolute === imagesRoot) {
        try {
            await fsp.access(resolvedAbsolute)
            finalPath = resolvedAbsolute
        } catch {
            return null
        }
    } else if (resolvedFromRoot.startsWith(imagesRoot + path.sep)) {
        // Relative path — resolve within images root
        try {
            await fsp.access(resolvedFromRoot)
            finalPath = resolvedFromRoot
        } catch {
            return null
        }
    } else {
        // Path traversal attempt or path outside images directory
        return null
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
    const buffer = await fsp.readFile(finalPath)
    return `data:${mime};base64,${buffer.toString('base64')}`
}

/**
 * Delete an image file from disk.
 */
export async function deleteImage(imagePath: string): Promise<void> {
    if (!imagePath) { return }
    try {
        await fsp.unlink(imagePath)
    } catch {
        // File may already be deleted
    }
}
