// Test yardımcıları: her test dosyası temiz bir PGlite (PostgreSQL 17) açar ve migrasyonları uygular.
// Yalnız sentetik veri kullanılır.
import { connectPglite, type Database } from "../src/db.ts";
import { migrate } from "../src/migrate.ts";

export async function freshDb(): Promise<Database> {
  const db = await connectPglite();
  await migrate(db);
  return db;
}

/** Sentetik kurum + yerleşke + iki birim + yatak; kimlikleri döndürür (yönetici bağlamında, RLS dışı kurulum). */
export async function seedTenant(db: Database, code: string) {
  const t = (await db.query<{ id: string }>("INSERT INTO kb.tenants (code, name, kind) VALUES ($1, $2, 'ozel') RETURNING id", [code, `Kurgusal Hastane ${code}`])).rows[0].id;
  const c = (await db.query<{ id: string }>("INSERT INTO kb.campuses (tenant_id, code, name) VALUES ($1, 'MRK', 'Merkez') RETURNING id", [t])).rows[0].id;
  const unit = async (uc: string, name: string, kind = "operational") => (await db.query<{ id: string }>("INSERT INTO kb.units (tenant_id, campus_id, code, name, kind) VALUES ($1, $2, $3, $4, $5) RETURNING id", [t, c, uc, name, kind])).rows[0].id;
  const ytk = await unit("YTK", "Yatak Yönetimi"), ctm = await unit("CTM", "Temizlik"), dhl = await unit("DHL", "İç Hastalıkları", "clinical");
  const room = (await db.query<{ id: string }>("INSERT INTO kb.rooms (tenant_id, unit_id, code) VALUES ($1, $2, '312') RETURNING id", [t, dhl])).rows[0].id;
  const bed = (await db.query<{ id: string }>("INSERT INTO kb.beds (tenant_id, room_id, unit_id, code) VALUES ($1, $2, $3, '312-A') RETURNING id", [t, room, dhl])).rows[0].id;
  const staff = async (sub: string, role: string, units: string[]) => {
    const id = (await db.query<{ id: string }>("INSERT INTO kb.staff (tenant_id, external_subject, display_label) VALUES ($1, $2, $3) RETURNING id", [t, sub, sub])).rows[0].id;
    await db.query("INSERT INTO kb.staff_roles (tenant_id, staff_id, role_code, granted_by) VALUES ($1, $2, $3, 'kurulum')", [t, id, role]);
    for (const u of units) await db.query("INSERT INTO kb.unit_memberships (tenant_id, staff_id, unit_id) VALUES ($1, $2, $3)", [t, id, u]);
    return id;
  };
  return { tenantId: t, campusId: c, units: { ytk, ctm, dhl }, roomId: room, bedId: bed, staff };
}
