const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..', '..')
const PRELOAD_API_DIR = path.join(ROOT, 'electron', 'preload', 'api')
const MAIN_IPC_DIR = path.join(ROOT, 'electron', 'main', 'ipc')
const UPDATE_HANDLERS_FILE = path.join(ROOT, 'electron', 'main', 'updates', 'autoUpdater.ts')
const MANIFEST_PATH = path.join(ROOT, 'ipc-manifest.json')

const CHANNEL_INVOKE_REGEX = /ipcRenderer\.invoke\(\s*'([^']+)'/g
const CHANNEL_REGISTER_REGEX = /(?:safeHandle(?:RawWithRole|WithRole|Raw)?|validatedHandler(?:Multi)?|ipcMain\.handle)\(\s*'([^']+)'/g

const IPC_NAMESPACE_OWNERS = {
  academic: 'Academic Team',
  approval: 'Workflow Team',
  audit: 'Security Team',
  auth: 'Security Team',
  backup: 'Platform Team',
  cbc: 'Academic Team',
  check: 'Platform Team',
  data: 'Data Platform Team',
  exemption: 'Finance Team',
  hire: 'Operations Team',
  inventory: 'Operations Team',
  jss: 'Academic Team',
  merit: 'Academic Team',
  message: 'Communications Team',
  notifications: 'Communications Team',
  operations: 'Operations Team',
  payroll: 'Payroll Team',
  period: 'Finance Team',
  promotion: 'Academic Team',
  report: 'Reporting Team',
  reports: 'Reporting Team',
  reportcard: 'Academic Team',
  'report-card': 'Academic Team',
  scheduler: 'Reporting Team',
  settings: 'Platform Team',
  staff: 'HR Team',
  stream: 'Academic Team',
  student: 'Student Records Team',
  subject: 'Academic Team',
  system: 'Platform Team',
  term: 'Academic Team',
  transactions: 'Finance Team',
  user: 'Security Team'
}

function normalize(value) {
  return String(value).replaceAll('\\', '/')
}

function collectFiles(dirPath, extension = '.ts') {
  const files = []
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)
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

function collectInvokedChannels(filePaths) {
  const channels = new Set()
  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath, 'utf8')
    for (const match of content.matchAll(CHANNEL_INVOKE_REGEX)) {
      channels.add(match[1])
    }
  }
  return [...channels].sort()
}

function collectDeclaredChannels(filePaths) {
  const channels = new Set()
  for (const filePath of filePaths) {
    if (normalize(filePath).includes('/__tests__/') || filePath.endsWith('.test.ts')) {
      continue
    }
    const content = fs.readFileSync(filePath, 'utf8')
    const withoutBlockComments = content.replaceAll(/\/\*[\s\S]*?\*\//g, '')
    const withoutComments = withoutBlockComments
      .split('\n')
      .map((line) => {
        const commentIndex = line.indexOf('//')
        return commentIndex >= 0 ? line.slice(0, commentIndex) : line
      })
      .join('\n')

    for (const match of withoutComments.matchAll(CHANNEL_REGISTER_REGEX)) {
      channels.add(match[1])
    }
  }
  return [...channels].sort()
}

function toNamespace(channel) {
  const separatorIndex = channel.indexOf(':')
  return separatorIndex >= 0 ? channel.slice(0, separatorIndex) : channel
}

function buildManifest() {
  const preloadFiles = collectFiles(PRELOAD_API_DIR, '.ts')
  const mainFiles = collectFiles(MAIN_IPC_DIR, '.ts')

  const preloadInvokedChannels = collectInvokedChannels(preloadFiles)
  const mainDeclaredChannels = collectDeclaredChannels([...mainFiles, UPDATE_HANDLERS_FILE])

  const preloadOnlyChannels = preloadInvokedChannels.filter(
    (channel) => !mainDeclaredChannels.includes(channel)
  )
  const mainOnlyChannels = mainDeclaredChannels.filter(
    (channel) => !preloadInvokedChannels.includes(channel)
  )

  const namespaces = [...new Set([...preloadInvokedChannels, ...mainDeclaredChannels].map(toNamespace))].sort()
  const namespaceOwners = {}
  for (const namespace of namespaces) {
    namespaceOwners[namespace] = IPC_NAMESPACE_OWNERS[namespace] || 'Unassigned'
  }

  return {
    generatedAt: new Date().toISOString(),
    preloadInvokedChannels,
    mainDeclaredChannels,
    preloadOnlyChannels,
    mainOnlyChannels,
    namespaceOwners
  }
}

function writeManifest(manifestPath = MANIFEST_PATH) {
  const manifest = buildManifest()
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  return manifest
}

module.exports = {
  ROOT,
  MANIFEST_PATH,
  buildManifest,
  writeManifest
}
