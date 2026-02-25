# Code Signing Configuration

## Current Implementation State

- Release signing is enforced for tagged builds.
- `package.json` sets `build.win.forceCodeSigning` to `true`.
- GitHub Actions validates `CSC_LINK` and `CSC_KEY_PASSWORD` before running release builds.
- Release workflow is pinned to immutable action SHAs where applicable (including `softprops/action-gh-release`).

## Build Modes

### Pull Requests

- Runs quality gates only:
  - renderer/node typechecks
  - strict ESLint + architecture lint
  - docs/workflow consistency + IPC manifest drift checks
  - remediation checklist presence gate (`audit:checklist`)
  - Vitest (verbose + coverage)
  - critical module coverage floor check
  - production runtime audit (blocking)
  - full audit (non-blocking artifact)
  - Windows parity checks (typecheck + lint + targeted smoke)
- No signed installers are produced.

### Tagged Releases (`v*`)

- Runs all quality gates, then blocks on smoke E2E.
- Builds signed platform artifacts.
- Publishes GitHub release artifacts after successful build matrix completion.

## Required Secrets for Signed Release Builds

- `CSC_LINK`: base64-encoded signing certificate payload.
- `CSC_KEY_PASSWORD`: certificate private key password.

If either secret is missing on a tag build, CI fails before packaging.

## Operational Notes

- macOS hardened runtime remains enabled (`build.mac.hardenedRuntime: true`).
- Linux targets are packaged but do not currently use package-signing keys in this repo.
- Certificate lifecycle (rotation/renewal/revocation) must be handled in repository secrets management procedures.
