import * as fs from 'fs'
import * as path from 'path'

// This script checks the SQLite header to confirm encryption.

const APP_NAME = 'Mwingi School ERP' // Adjust if needed matches package.json product name
const USER_DATA_PATH = process.platform === 'win32'
    ? path.join(process.env.APPDATA || '', APP_NAME, 'data', 'school_erp.db')
    : path.join(process.env.HOME || '', '.config', APP_NAME, 'data', 'school_erp.db')

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

