/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies make changes risky and violate maintainability.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'renderer-must-not-import-electron-main',
      severity: 'error',
      comment: 'Renderer/UI must not couple directly to Electron main internals.',
      from: {
        path: '^src/',
        pathNot: String.raw`(__tests__|\.test\.(ts|tsx)$|\.spec\.(ts|tsx)$)`,
      },
      to: { path: '^electron/main/' },
    },
    {
      name: 'main-must-not-import-renderer',
      severity: 'error',
      comment: 'Electron main process should not depend on renderer modules.',
      from: { path: '^electron/main/' },
      to: { path: '^src/' },
    },
    {
      name: 'preload-must-not-import-renderer',
      severity: 'error',
      comment: 'Preload must remain a boundary layer and avoid renderer imports.',
      from: { path: '^electron/preload/' },
      to: { path: '^src/' },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unused/orphaned modules usually indicate dead code.',
      from: {
        orphan: true,
        pathNot: [
          String.raw`\.d\.ts$`,
          String.raw`\.test\.(ts|tsx)$`,
          String.raw`\.spec\.(ts|tsx)$`,
          '^scripts/',
          '^tests/',
          String.raw`^src/main\.tsx$`,
          String.raw`^electron/main/index\.ts$`,
          String.raw`^electron/preload/index\.ts$`,
        ],
      },
      to: {},
    },
  ],
  options: {
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json', '.mjs', '.cjs'],
    },
    doNotFollow: {
      path: 'node_modules',
    },
    includeOnly: '^src|^electron',
    exclude: {
      path: String.raw`^dist|^dist-electron|^coverage|^release|^release2|^release3|\.d\.ts$`,
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+',
      },
    },
  },
};
