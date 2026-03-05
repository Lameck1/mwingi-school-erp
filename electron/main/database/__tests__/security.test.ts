import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: vi.fn((str: string) => Buffer.from(`enc:${str}`)),
    decryptString: vi.fn((buf: Buffer) => buf.toString().replace('enc:', '')),
  },
  app: {
    getPath: vi.fn(() => '/fake/userData'),
  },
  readFile: vi.fn<(path: string) => Promise<Buffer>>(),
  writeFile: vi.fn<(path: string, data: Buffer, options?: object) => Promise<void>>(),
  randomBytes: vi.fn(() => Buffer.alloc(32, 0xab)),
}))

vi.mock('../../electron-env', () => ({
  safeStorage: mocks.safeStorage,
  app: mocks.app,
}))

vi.mock('node:fs/promises', () => ({
  readFile: mocks.readFile,
  writeFile: mocks.writeFile,
}))

vi.mock('node:crypto', () => ({
  randomBytes: mocks.randomBytes,
}))

async function loadModule() {
  return await import('../security')
}

describe('database/security – getEncryptionKey', () => {
  beforeEach(() => {
    vi.resetModules()
    mocks.readFile.mockReset()
    mocks.writeFile.mockReset()
    mocks.randomBytes.mockReset()
    mocks.safeStorage.isEncryptionAvailable.mockReturnValue(true)
    mocks.safeStorage.encryptString.mockReset()
    mocks.safeStorage.decryptString.mockReset()
    mocks.safeStorage.encryptString.mockImplementation((str: string) => Buffer.from(`enc:${str}`))
    mocks.safeStorage.decryptString.mockImplementation((buf: Buffer) => buf.toString().replace('enc:', ''))
    mocks.randomBytes.mockReturnValue(Buffer.alloc(32, 0xab))
    mocks.writeFile.mockResolvedValue(void 0)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('generates a new key when no key file exists', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getEncryptionKey } = await loadModule()

    const key = await getEncryptionKey()

    const expected = Buffer.alloc(32, 0xab).toString('hex')
    expect(key).toBe(expected)
    expect(mocks.safeStorage.encryptString).toHaveBeenCalledWith(expected)
    expect(mocks.writeFile).toHaveBeenCalledTimes(1)
  })

  it('decrypts and returns existing key from file', async () => {
    const storedKey = 'a'.repeat(64)
    mocks.readFile.mockResolvedValueOnce(Buffer.from(`enc:${storedKey}`))
    const { getEncryptionKey } = await loadModule()

    const key = await getEncryptionKey()

    expect(key).toBe(storedKey)
    expect(mocks.safeStorage.decryptString).toHaveBeenCalled()
    expect(mocks.writeFile).not.toHaveBeenCalled()
  })

  it('returns cached key on subsequent calls without re-reading file', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getEncryptionKey } = await loadModule()

    const key1 = await getEncryptionKey()
    const key2 = await getEncryptionKey()

    expect(key1).toBe(key2)
    expect(mocks.readFile).toHaveBeenCalledTimes(1)
  })

  it('throws when safeStorage is unavailable and key file exists', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('enc:somekey'))
    mocks.safeStorage.isEncryptionAvailable.mockReturnValue(false)
    const { getEncryptionKey } = await loadModule()

    await expect(getEncryptionKey()).rejects.toThrow('SafeStorage is not available')
  })

  it('throws when safeStorage is unavailable and generating new key', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    mocks.safeStorage.isEncryptionAvailable.mockReturnValue(false)
    const { getEncryptionKey } = await loadModule()

    await expect(getEncryptionKey()).rejects.toThrow('Encryption not available')
  })

  it('generated key is 64 hex characters (32 bytes)', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    mocks.randomBytes.mockReturnValue(Buffer.alloc(32, 0xff))
    const { getEncryptionKey } = await loadModule()

    const key = await getEncryptionKey()

    expect(key).toMatch(/^[\da-f]{64}$/i)
    expect(key).toHaveLength(64)
  })

  it('writes key file with restrictive permissions (mode 0o600)', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getEncryptionKey } = await loadModule()

    await getEncryptionKey()

    expect(mocks.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('secure.key.enc'),
      expect.any(Buffer),
      { mode: 0o600 }
    )
  })

  it('propagates write errors when saving newly generated key', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    mocks.writeFile.mockRejectedValueOnce(new Error('disk full'))
    const { getEncryptionKey } = await loadModule()

    await expect(getEncryptionKey()).rejects.toThrow('disk full')
  })

  it('propagates decryption errors for tampered key file', async () => {
    mocks.readFile.mockResolvedValueOnce(Buffer.from('corrupted-data'))
    mocks.safeStorage.decryptString.mockImplementation(() => {
      throw new Error('decrypt failed')
    })
    const { getEncryptionKey } = await loadModule()

    await expect(getEncryptionKey()).rejects.toThrow('decrypt failed')
  })

  it('passes the raw Buffer from readFile directly to decryptString', async () => {
    const encrypted = Buffer.from('enc:testkey123')
    mocks.readFile.mockResolvedValueOnce(encrypted)
    const { getEncryptionKey } = await loadModule()

    await getEncryptionKey()

    expect(mocks.safeStorage.decryptString).toHaveBeenCalledWith(encrypted)
  })

  it('stores key in correct path under userData directory', async () => {
    mocks.app.getPath.mockReturnValue('/custom/data/path')
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getEncryptionKey } = await loadModule()

    await getEncryptionKey()

    expect(mocks.readFile).toHaveBeenCalledWith(
      expect.stringContaining('secure.key.enc')
    )
  })

  it('requests exactly 32 random bytes for key generation', async () => {
    mocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
    const { getEncryptionKey } = await loadModule()

    await getEncryptionKey()

    expect(mocks.randomBytes).toHaveBeenCalledWith(32)
  })
})
