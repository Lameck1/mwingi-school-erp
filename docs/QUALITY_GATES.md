# Quality Gates

This project uses multiple static analysis tools to enforce production-grade quality.

## Tooling Stack

- `ESLint` (`eslint.config.js`)
- Purpose: correctness, TypeScript safety, React best practices, security smells, accessibility, complexity limits, and import hygiene.
- Includes plugins:
- `@typescript-eslint`, `react`, `react-hooks`, `jsx-a11y`
- `import`, `promise`, `security`, `sonarjs`, `unicorn`

- `dependency-cruiser` (`.dependency-cruiser.cjs`)
- Purpose: architectural constraints and circular dependency detection.
- Enforces boundaries between `src/` (renderer), `electron/main/`, and `electron/preload/`.

- `webhint` (`.hintrc`)
- Purpose: web platform quality checks (security headers, compatibility, vulnerable client libraries).

- `markdownlint`
- Purpose: documentation quality for `*.md` files.

## Commands

- `npm run lint`
- Runs `ESLint` (warnings + errors).

- `npm run lint:eslint:strict`
- Runs `ESLint` and fails on warnings (`--max-warnings 0`).

- `npm run lint:architecture`
- Runs dependency rules and cycle detection.

- `npm run lint:webhint`
- Builds the app and runs `webhint` against `dist/index.html`.

- `npm run lint:md`
- Lints markdown files.

- `npm run lint:quality`
- Strict gate: `eslint:strict + architecture + markdown`.

- `npm run lint:quality:full`
- Full gate: `lint:quality + webhint + npm audit`.

## Professional Workflow

- Local development:
- `npm run lint` for fast feedback.
- `npm run lint:architecture` before large refactors.

- Pre-merge:
- `npm run lint:quality`

- Release candidate:
- `npm run lint:quality:full`

## Notes

- Some rules are configured as warnings to support incremental remediation (for example complexity and file-length rules).
- Hard boundaries are configured as errors (for example cross-layer imports and circular dependencies).
