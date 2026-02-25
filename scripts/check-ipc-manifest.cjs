const fs = require('node:fs')

const { MANIFEST_PATH, buildManifest } = require('./lib/ipc-manifest.cjs')

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`IPC manifest is missing: ${MANIFEST_PATH}`)
  console.error('Run `npm run ipc:manifest:generate` and commit ipc-manifest.json.')
  process.exit(1)
}

const committed = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
const generated = buildManifest()

const normalizeManifest = (manifest) => ({
  preloadInvokedChannels: manifest.preloadInvokedChannels,
  mainDeclaredChannels: manifest.mainDeclaredChannels,
  preloadOnlyChannels: manifest.preloadOnlyChannels,
  mainOnlyChannels: manifest.mainOnlyChannels,
  namespaceOwners: manifest.namespaceOwners
})

const committedComparable = normalizeManifest(committed)
const generatedComparable = normalizeManifest(generated)

if (JSON.stringify(committedComparable) !== JSON.stringify(generatedComparable)) {
  console.error('IPC manifest drift detected.')
  console.error('Run `npm run ipc:manifest:generate` and commit the updated ipc-manifest.json for review.')
  process.exit(1)
}

console.log('IPC manifest check passed.')
