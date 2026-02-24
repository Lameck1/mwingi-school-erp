# Migration Rollback Policy

This project uses forward incremental database migrations under `electron/main/database/migrations/incremental`.

## Rollback Strategy

- Reversible migrations expose `down(db)` and may be rolled back in controlled environments.
- Irreversible migrations require backup-and-restore recovery and must not be downgraded in place.
- Rollback strategy coverage is tracked in `electron/main/database/migrations/rollback-policy.ts` and verified by tests.

## Backup-and-Restore Protocol (Irreversible Migrations)

1. Stop the app and ensure no SQLite writers are active.
2. Create a verified file backup of the live DB and WAL/SHM companions.
3. Restore the target application build.
4. Restore the verified DB backup matching that build's migration level.
5. Start the app and run migration verification checks before enabling traffic.

## Required Verification After Rollback

- Run `npx vitest run electron/main/database/migrations/__tests__/incremental-migrations.test.ts`.
- Run `npm run lint:eslint:strict`.
- Run `npx tsc --noEmit -p tsconfig.node.json`.
