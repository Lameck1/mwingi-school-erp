import * as fs from 'node:fs'
import { createRequire } from 'node:module'

// This script checks the SQLite header to confirm encryption.

const require = createRequire(import.meta.url)
const { resolveDatabasePath } = require('./lib/db-path.cjs') as { resolveDatabasePath: () => string }

const USER_DATA_PATH = resolveDatabasePath()

console.error('Checking database at:', USER_DATA_PATH)

if (!fs.existsSync(USER_DATA_PATH)) {
    console.error('Database file not found at expected path:', USER_DATA_PATH)
    console.error('Please run the application at least once to create the database.')
    process.exit(1)
}

const fd = fs.openSync(USER_DATA_PATH, 'r')
const buffer = Buffer.alloc(16)
fs.readSync(fd, buffer, 0, 16, 0)
fs.closeSync(fd)

const header = buffer.toString('utf8')
console.error('First 16 bytes (Hex):', buffer.toString('hex'))
console.error('Header string:', header)

if (header.startsWith('SQLite format 3')) {
    console.error('RESULT: ❌ UNENCRYPTED (Standard SQLite Header found)')
} else {
    console.error('RESULT: ✅ ENCRYPTED (Header is random/encrypted bytes)')
}

