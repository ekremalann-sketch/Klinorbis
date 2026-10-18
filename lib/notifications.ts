// Personel bildirimleri: bir birime iş düştüğünde o birimin etkin üyelerine, gecikme yükseltmesinde birim
// sorumlusuna ve operasyon yöneticisine uygulama içi bildirim yazılır.
//
// Bildirim metninde hasta kimliği bulunmaz: yalnız iş başlığı, birim ve referans. Aynı olay (dedupe_key)
// ikinci kez bildirim üretmez; bu sayede yeniden deneme ve eşzamanlı döngüler çift bildirim açmaz.
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { getDb } from "../db";
import { staffAccounts, staffNotifications, unitMemberships } from "../db/schema";
import { redactPII } from "./privacy";

type Db = ReturnType<typeof getDb>;
type Stmt = Parameters<Db["batch"]>[0][number];
export type NotificationInput = { kind: string; title: string; detail: string; path: string; key: string };

// D1 tek ifadede en fazla 100 bağlı parametre kabul eder; satır başına 7 parametre → 12 satırlık parçalar.
const CHUNK = 12;
const clip = (value: string, max: number) => redactPII(value).maskedText.slice(0, max);

/** Birimin etkin üyeleri (isteğe bağlı rol süzgeci). Hesabı kapalı olanlar hariç. */
export async function unitRecipients(db: Db, unitCode: string, roles?: string[]) {
  const rows = await db.select({ email: unitMemberships.email, role: staffAccounts.systemRole }).from(unitMemberships)
    .innerJoin(staffAccounts, eq(staffAccounts.email, unitMemberships.email))
    .where(and(eq(unitMemberships.unitCode, unitCode), eq(unitMemberships.active, true), eq(staffAccounts.active, true)));
  return [...new Set(rows.filter((r) => !roles || roles.includes(r.role)).map((r) => r.email))];
}

export async function roleRecipients(db: Db, role: string) {
  const rows = await db.select({ email: staffAccounts.email }).from(staffAccounts).where(and(eq(staffAccounts.systemRole, role), eq(staffAccounts.active, true)));
  return rows.map((r) => r.email);
}

/** Bildirim ekleme ifadeleri (bir batch'e eklenebilir). Alıcı yoksa boş dizi. */
export function notificationStatements(db: Db, recipients: string[], input: NotificationInput, now = new Date()): Stmt[] {
  const rows = [...new Set(recipients)].map((email) => ({
    email, kind: input.kind, title: clip(input.title, 120), detail: clip(input.detail, 240), path: input.path.startsWith("/") ? input.path.slice(0, 120) : "/inbox",
    dedupeKey: `${input.key}:${email}`.slice(0, 200), createdAt: now,
  }));
  const out: Stmt[] = [];
  for (let i = 0; i < rows.length; i += CHUNK) out.push(db.insert(staffNotifications).values(rows.slice(i, i + CHUNK)).onConflictDoNothing());
  return out;
}

/** Birime iş düştüğünü üyelerine bildiren ifadeler. */
export async function unitTaskNotifications(db: Db, unitCode: string, input: NotificationInput, now = new Date()) {
  return notificationStatements(db, await unitRecipients(db, unitCode), input, now);
}

export async function listNotifications(db: Db, email: string, limit = 30) {
  const [items, [count]] = await Promise.all([
    db.select({ id: staffNotifications.id, kind: staffNotifications.kind, title: staffNotifications.title, detail: staffNotifications.detail, path: staffNotifications.path, createdAt: staffNotifications.createdAt, readAt: staffNotifications.readAt })
      .from(staffNotifications).where(eq(staffNotifications.email, email)).orderBy(desc(staffNotifications.createdAt), desc(staffNotifications.id)).limit(limit),
    db.select({ unread: sql<number>`count(*)` }).from(staffNotifications).where(and(eq(staffNotifications.email, email), isNull(staffNotifications.readAt))),
  ]);
  return { items, unread: Number(count?.unread ?? 0) };
}

/** Okundu işareti yalnız kişinin kendi bildirimlerine uygulanır. ids boşsa tümü. */
export async function markNotificationsRead(db: Db, email: string, ids: number[] | "all", now = new Date()) {
  const own = and(eq(staffNotifications.email, email), isNull(staffNotifications.readAt));
  const where = ids === "all" ? own : ids.length ? and(own, inArray(staffNotifications.id, ids.slice(0, 50))) : null;
  if (!where) return 0;
  const changed = await db.update(staffNotifications).set({ readAt: now }).where(where).returning({ id: staffNotifications.id });
  return changed.length;
}
