import { eq } from "drizzle-orm";
import { integrationEvents } from "../db/schema";
import type { getDb } from "../db";
export function demoEnabled() {
 return (globalThis as typeof globalThis & { __KLINORBIS_DEMO_ENABLED?: string }).__KLINORBIS_DEMO_ENABLED === "1";
}
export async function automationStopped(db: ReturnType<typeof getDb>) {
 const [row] = await db.select().from(integrationEvents).where(eq(integrationEvents.eventId, "automation:control")).limit(1);
 return row?.status === "paused";
}
