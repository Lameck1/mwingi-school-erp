import * as crypto from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

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
                fs.writeFileSync(keyPath, encryptedKey)
                return newKey
            } else {
                 // Fallback for dev environments or systems without safeStorage (WARN: INSECURE)
                 // In a real prod app, we might want to enforce safeStorage or ask user for password
                 console.warn('WARNING: SafeStorage not available. Saving key in plaintext (INSECURE).')
                 // For now, we will still save it but it's not encrypted by OS. 
                 // Ideally we should block this or use a different strategy.
                 // But preventing app startup might be too harsh for a verify. 
                 // We'll mimic the shape but just base64 it so we at least have a file.
                 // ACTUALLY: Let's throw for now to be strict.
                 // throw new Error('SafeStorage not available')
                 
                 // Re-reading usage: safeStorage on Windows relies on DPAPI. Should be available.
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
