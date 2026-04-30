# Dependency Overrides

This document explains each `overrides` entry in `package.json`.

| Package | Pinned Version | Reason |
|---|---|---|
| `@isaacs/brace-expansion` | `5.0.1` | Resolves CVE in transitive dependency from `minimatch`; version 5.0.1 patches regex DoS. |
| `@electron/get` | `3.1.0` | Pins to version compatible with current electron-builder; avoids breaking changes in newer releases. |
| `minimatch` | `10.2.3` | Enforces patched minimatch across transitive chains to close GHSA-7r86-cg39-jmmj and GHSA-23c5-xmqv-rm74 (ReDoS vulnerabilities). |
| `unzipper` | `^0.12.3` | Fixes prototype pollution vulnerability (CVE-2023-48165) present in older versions pulled by electron-builder. |
| `archiver` | `^7.0.1` | Resolves high-severity zip-slip vulnerability in archiver <7.0.0 used transitively by electron-builder. |
| `test-exclude` | `^7.0.1` | Aligns with vitest/v8 coverage requirements; older versions cause incorrect coverage exclusion patterns. |
| `uuid` | `^8.3.0` | Enforces uuid 8.3.x across dependencies. Note: uuid <14.0.0 has a moderate-severity buffer bounds check vulnerability (GHSA-w5hq-g745-h8pq), but exceljs 4.4.0 (latest) is locked to ^8.3.0. Upgrade to uuid 14.0.0+ would require exceljs 5.0.0+, which is not yet released. |

## Dependency Notes

- **exceljs**: Upgraded from 3.10.0 to 4.4.0 to support uuid 8.3.x and reduce security exposure in transitive dependencies.

## Maintenance

When upgrading `electron-builder`, `vitest`, or `exceljs`, re-evaluate whether these overrides are still necessary:

```bash
npm ls minimatch @isaacs/brace-expansion @electron/get unzipper archiver test-exclude uuid
npm audit
```

Remove overrides once the direct dependency ships a fixed version. For uuid/exceljs, monitor for when exceljs supports uuid 14.0.0+.
