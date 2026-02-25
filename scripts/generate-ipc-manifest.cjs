const { MANIFEST_PATH, writeManifest } = require('./lib/ipc-manifest.cjs')

const manifest = writeManifest(MANIFEST_PATH)
console.log(`IPC manifest generated at ${MANIFEST_PATH}`)
console.log(`Channels (preload -> main): ${manifest.preloadInvokedChannels.length}`)
console.log(`Channels (main declared): ${manifest.mainDeclaredChannels.length}`)
