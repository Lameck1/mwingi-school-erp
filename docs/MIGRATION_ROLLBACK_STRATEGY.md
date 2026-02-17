# Migration Rollback Strategy

This document describes the rollback strategy for database migrations in the Mwingi School ERP system.

## Overview

The application uses **forward-only** SQLite migrations managed by `electron/main/database/migrations/index.ts`. There are no programmatic `down()` functions. Rollback is achieved via **backup-based restore**.

## How Migrations Work

1. Migrations run automatically at app startup via `runMigrations(db)`.
2. Each migration runs inside a `SAVEPOINT` — if it throws, only that migration is rolled back.
3. `PRAGMA foreign_keys` is toggled OFF per-migration to allow table rebuilds, then re-enabled.
4. After all migrations complete, `PRAGMA foreign_key_check` verifies FK integrity.
5. Applied migrations are recorded in the `migrations` table with a timestamp.

## Rollback Procedures

### Scenario 1: Migration Fails on Startup

**Automatic behavior:** The migration runner catches the error, rolls back the savepoint, and logs the failure. The app will start with the database at the last successful migration state.

**Manual recovery (if database is corrupted):**

```bash
# 1. Locate the most recent backup
#    Backups are stored in the userData/backups/ directory
#    The BackupService creates timestamped .db files

# 2. Stop the application

# 3. Replace the database file with the backup
cp userData/backups/mwingi-erp-backup-YYYYMMDD-HHMMSS.db userData/mwingi-school-erp.db

# 4. Restart the application
#    Migrations will re-run from the backup's last applied migration
```

### Scenario 2: Migration Succeeds but Causes Data Issues

1. **Identify the problematic migration** from the `migrations` table:

   ```sql
   SELECT * FROM migrations ORDER BY id DESC LIMIT 5;
   ```

2. **Restore from pre-migration backup:**
   - Use the most recent backup taken _before_ the problematic migration was applied.
   - The `BackupService` creates automatic backups; check `userData/backups/`.

3. **Apply a corrective migration** (preferred over restore when possible):
   - Create a new incremental migration in `electron/main/database/migrations/incremental/`
   - Name it with the next sequence number (e.g., `1018_fix_issue.ts`)
   - Register it in `migrations/index.ts`

### Scenario 3: Rolling Back a Release

1. **Before any release**, ensure a backup exists (CI/CD or manual).
2. **Downgrade the application** to the previous version.
3. **Restore the database** from the pre-upgrade backup.
4. The older application version will not attempt to run newer migrations.

## Pre-Migration Checklist

Before writing a new migration:

- [ ] Test the migration against a copy of production data
- [ ] Verify FK integrity: `PRAGMA foreign_key_check`
- [ ] Ensure the migration is idempotent where possible (`IF NOT EXISTS`, `INSERT OR IGNORE`)
- [ ] Document any destructive operations (column drops, table rebuilds)
- [ ] Coordinate with the backup schedule — ensure a recent backup exists

## Backup Integration

The `BackupService` (`electron/main/services/BackupService.ts`) provides:

- **Atomic writes** using temp files + rename (no partial backups)
- **Cryptographic filenames** via `crypto.randomUUID()`
- **WAL checkpoint** before backup to ensure consistency

### Manual Backup via IPC

```typescript
// From renderer
await globalThis.electronAPI.createBackup()
```

## Future Improvements

- [ ] Add automatic pre-migration backup in the migration runner
- [ ] Implement `down()` functions for high-risk migrations
- [ ] Add migration dry-run mode for testing
