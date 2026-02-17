# Dependency Overrides

This document explains each `overrides` entry in `package.json`.

| Package | Pinned Version | Reason |
|---|---|---|
| `@isaacs/brace-expansion` | `5.0.1` | Resolves CVE in transitive dependency from `minimatch`; version 5.0.1 patches regex DoS. |
| `@electron/get` | `3.1.0` | Pins to version compatible with current electron-builder; avoids breaking changes in newer releases. |
| `unzipper` | `^0.12.3` | Fixes prototype pollution vulnerability (CVE-2023-48165) present in older versions pulled by electron-builder. |
| `archiver` | `^7.0.1` | Resolves high-severity zip-slip vulnerability in archiver <7.0.0 used transitively by electron-builder. |
| `test-exclude` | `^7.0.1` | Aligns with vitest/v8 coverage requirements; older versions cause incorrect coverage exclusion patterns. |

## Maintenance

When upgrading `electron-builder` or `vitest`, re-evaluate whether these overrides are still necessary:

```bash
npm ls @isaacs/brace-expansion @electron/get unzipper archiver test-exclude
npm audit
```

Remove overrides once the direct dependency ships a fixed version.
