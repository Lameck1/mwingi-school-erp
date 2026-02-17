import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { safeStorage, app } from '../electron-env'

const KEY_FILE_NAME = 'secure.key.enc'

/**
 * Retrieves the encryption key for the database.
 * If a key exists, it decrypts and returns it.
 * If not, it generates a new one, encrypts it, saves it, and returns it.
 */
export function getEncryptionKey(): string {
    const userDataPath = app.getPath('userData')
    const keyPath = path.join(userDataPath, KEY_FILE_NAME)

    try {
        if (fs.existsSync(keyPath)) {
            // Key exists, read and decrypt
            const encryptedKey = fs.readFileSync(keyPath)
            
            if (safeStorage.isEncryptionAvailable()) {
                const decryptedKey = safeStorage.decryptString(encryptedKey)
                return decryptedKey
            } else {
                throw new Error('SafeStorage is not available on this system cannot decrypt key.')
            }
        } else {
            // Generate new key
            const newKey = generateRandomKey()
            
            if (safeStorage.isEncryptionAvailable()) {
                const encryptedKey = safeStorage.encryptString(newKey)
                fs.writeFileSync(keyPath, encryptedKey, { mode: 0o600 })
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
