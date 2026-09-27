import { sql } from "drizzle-orm";
import { getDb } from "../db";

// Sites deployments do not automatically run the checked-in Drizzle migration.
// Add only the new handoff table and indexes, without altering existing records.
let ready: Promise<void> | undefined;
export function ensureShiftSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const db = getDb();
      await db.run(sql.raw(`CREATE TABLE IF NOT EXISTS shift_handoffs (
        id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
        unit_code TEXT NOT NULL, from_email TEXT NOT NULL, to_email TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
        open_tickets INTEGER NOT NULL DEFAULT 0, open_tasks INTEGER NOT NULL DEFAULT 0,
        moved_tickets INTEGER NOT NULL DEFAULT 0, moved_tasks INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, decided_at INTEGER, decided_by TEXT
      )`));
      await db.run(sql.raw("CREATE INDEX IF NOT EXISTS shift_handoffs_unit_status ON shift_handoffs (unit_code,status)"));
      await db.run(sql.raw("CREATE UNIQUE INDEX IF NOT EXISTS shift_handoffs_one_pending ON shift_handoffs (from_email,unit_code) WHERE status = 'pending'"));
    })().catch((error) => { ready = undefined; throw error; });
  }
  return ready;
}
