import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'

import { safeStorage, app } from '../electron-env'

const KEY_FILE_NAME = 'secure.key.enc'
let cachedKey: string | null = null

/**
 * Retrieves the encryption key for the database.
 * If a key exists, it decrypts and returns it.
 * If not, it generates a new one, encrypts it, saves it, and returns it.
 * The result is cached in memory after the first call.
 */
export async function getEncryptionKey(): Promise<string> {
    if (cachedKey) { return cachedKey }

    const userDataPath = app.getPath('userData')
    const keyPath = path.join(userDataPath, KEY_FILE_NAME)

    try {
        let encryptedKey: Buffer | null = null
        try {
            encryptedKey = await fsp.readFile(keyPath)
        } catch {
            // File does not exist — will generate a new key below
        }

        if (encryptedKey) {
            // Key exists, decrypt
            if (safeStorage.isEncryptionAvailable()) {
                const decryptedKey = safeStorage.decryptString(encryptedKey)
                cachedKey = decryptedKey
                return decryptedKey
            } else {
                throw new Error('SafeStorage is not available on this system cannot decrypt key.')
            }
        } else {
            // Generate new key
            const newKey = generateRandomKey()
            
            if (safeStorage.isEncryptionAvailable()) {
                const encrypted = safeStorage.encryptString(newKey)
                await fsp.writeFile(keyPath, encrypted, { mode: 0o600 })
                cachedKey = newKey
                return newKey
            } else {
                throw new Error('Encryption not available on this device.')
            }
        }
    } catch (error) {
        console.error('Failed to retrieve/generate encryption key:', error)
        throw error
    }
}

function generateRandomKey(): string {
    // SQLCipher supports raw hex keys (64 hex chars = 32 bytes)
    return crypto.randomBytes(32).toString('hex')
}
