# Coding Standards

## Core Rules

- TypeScript strict mode is mandatory for both renderer and node/main builds.
- Production code must not use `any`, `@ts-ignore`, or unsafe cast chains unless explicitly justified at a narrow boundary.
- IPC handlers must enforce RBAC + schema validation through validated wrapper patterns.
- Security-sensitive inputs (paths, IDs, session-linked identity) must be normalized and validated server-side.

## Linting Baseline

Current ESLint policy (from `eslint.config.js`) includes:

- `@typescript-eslint/no-explicit-any`: `error`
- `react-hooks/exhaustive-deps`: `error`
- `no-console`: `warn` (only `warn`/`error` allowed)
- complexity/size limits enforced with stricter app defaults and scoped overrides

Run locally:

1. `npm run lint:eslint:strict`
2. `npm run lint:architecture`
3. `npm run lint:md`

## Typecheck Baseline

Run locally:

1. `npm run typecheck:renderer`
2. `npm run typecheck:node`

Both must pass before merge/release.

## Testing Baseline

- Unit/integration tests: `npx vitest run --reporter=verbose`
- Coverage gate: `npx vitest run --coverage`
- Release smoke E2E: `npx playwright test tests/e2e/smoke.spec.ts`

Coverage thresholds remain strict (`80/80/75/80`) and are scoped to critical runtime/security modules in `vitest.config.ts`.

## Security and Dependency Gates

- Blocking gate: `npm run audit:prod` (`npm audit --omit=dev --audit-level=high`)
- Visibility gate (non-blocking artifact): `npm run audit:full:json`

## Review Checklist

Before requesting review:

1. Typechecks pass (`renderer` and `node`).
2. Strict lint + architecture lint pass.
3. Targeted/new tests pass and cover security/runtime behavior.
4. No new type escapes in production paths.
5. Updated docs/checklists reference concrete evidence commands where applicable.
