/**
 * Data format versions. `meta.json` records the schemaVersion the data was written with.
 *
 * - Data without a schemaVersion was written by ICCWorship 1.0.x (schema 0).
 * - Schema 1 (1.1): converted presentation slides are stored relative to the data folder
 *   ("media://local/cache%2Fpresentations%2F…") so a backup restored on another PC keeps working. Older
 *   absolute paths stay valid (main remaps them when the folder moved), so 0 → 1 changes no data.
 *
 * To change the data format: bump SCHEMA_VERSION and add a migration that turns version N-1 data into N.
 * Migrations are pure (they get a read/write context), run in order, and must be idempotent — they can run
 * again after an interrupted start, and on old backups being restored.
 */
export const SCHEMA_VERSION = 1

export interface MigrationContext {
  /** a data file's parsed content (e.g. 'songs', 'settings', 'meta'), or undefined if missing */
  read(name: string): unknown
  write(name: string, value: unknown): void
}

export interface Migration {
  /** the schema version this migration produces */
  to: number
  describe: string
  run(ctx: MigrationContext): void
}

export const MIGRATIONS: Migration[] = [
  {
    to: 1,
    describe: 'version the data; presentation slides may be stored relative to the data folder',
    run: () => {
      /* nothing to convert: old absolute slide paths keep working */
    }
  }
]

export type SchemaCheck = { kind: 'current' } | { kind: 'migrate'; from: number } | { kind: 'newer'; version: number }

/** What to do with data written with `version` (undefined = 1.0.x, before versions were recorded). */
export function checkSchema(version: unknown, current = SCHEMA_VERSION): SchemaCheck {
  const v = typeof version === 'number' && Number.isInteger(version) && version >= 0 ? version : 0
  if (v > current) return { kind: 'newer', version: v }
  if (v < current) return { kind: 'migrate', from: v }
  return { kind: 'current' }
}

/** Runs every migration after `from`, then stamps meta.schemaVersion (last, so an interruption re-runs them). */
export function runMigrations(ctx: MigrationContext, from: number, migrations = MIGRATIONS, current = SCHEMA_VERSION): string[] {
  const done: string[] = []
  for (const m of [...migrations].sort((a, b) => a.to - b.to)) {
    if (m.to <= from || m.to > current) continue
    m.run(ctx)
    done.push(`${m.to}: ${m.describe}`)
  }
  const meta = (ctx.read('meta') as Record<string, unknown> | undefined) || {}
  ctx.write('meta', { ...meta, schemaVersion: current })
  return done
}
