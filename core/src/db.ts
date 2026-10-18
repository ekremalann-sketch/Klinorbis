// Veritabanı erişim katmanı: aynı kod hem üretimde PostgreSQL (pg) hem testte PGlite (gerçek PostgreSQL 17, WASM)
// ile çalışır. Uygulama her işlemi withContext() içinde yapar: işlem başında rol kb_app'e düşürülür ve kurum, kullanıcı,
// birim kapsamı SET LOCAL ile verilir; satır güvenliği (RLS) bu bağlama göre filtreler.
export type Row = Record<string, unknown>;
export interface Queryable {
  query<T extends Row = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  /** Parametresiz, çok ifadeli SQL (yalnız migrasyon gibi güvenilir dosyalar için). */
  exec(sql: string): Promise<void>;
}
export interface Database extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export type AppRole = "kb_app" | "kb_bridge" | "kb_auditor" | "kb_reporting";
export type Context = {
  tenantId: string;
  actor: string;
  role?: AppRole;
  unitIds?: string[];
  allUnits?: boolean;
  canReidentify?: boolean;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES: AppRole[] = ["kb_app", "kb_bridge", "kb_auditor", "kb_reporting"];

/** Bağlamı doğrular; geçersiz kurum/birim kimliği veya rol ile işlem başlamaz. */
export function validateContext(ctx: Context) {
  if (!UUID.test(ctx.tenantId)) throw new Error("Geçersiz kurum kimliği");
  if (!ctx.actor || ctx.actor.length > 200) throw new Error("Geçersiz işlem yapan");
  for (const u of ctx.unitIds ?? []) if (!UUID.test(u)) throw new Error("Geçersiz birim kimliği");
  if (ctx.role && !ROLES.includes(ctx.role)) throw new Error("Geçersiz rol");
}

export async function withContext<T>(db: Database, ctx: Context, fn: (tx: Queryable) => Promise<T>): Promise<T> {
  validateContext(ctx);
  return db.transaction(async (tx) => {
    // Rol adı beyaz listeden geldiği için biçimlendirme güvenli; değerler parametreyle verilir.
    await tx.query(`SET LOCAL ROLE ${ctx.role ?? "kb_app"}`);
    await tx.query(
      `SELECT set_config('app.tenant_id', $1, true), set_config('app.actor', $2, true), set_config('app.unit_ids', $3, true),
              set_config('app.all_units', $4, true), set_config('app.can_reidentify', $5, true)`,
      [ctx.tenantId, ctx.actor, `{${(ctx.unitIds ?? []).join(",")}}`, ctx.allUnits ? "on" : "off", ctx.canReidentify ? "on" : "off"],
    );
    return fn(tx);
  });
}

/** Üretim: node-postgres havuzu. Bağlantı Türkiye'deki sunucuya TLS ile yapılır (sslmode=verify-full önerilir). */
export async function connectPostgres(connectionString: string): Promise<Database> {
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString, max: 20, idleTimeoutMillis: 30_000, statement_timeout: 15_000 });
  return {
    query: (sql, params) => pool.query(sql, params as unknown[]) as never,
    exec: async (sql) => { await pool.query(sql); },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const out = await fn({ query: (sql, params) => client.query(sql, params as unknown[]) as never, exec: async (sql) => { await client.query(sql); } });
        await client.query("COMMIT");
        return out;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}

/** Test ve tek makineli deneme: PGlite (gömülü PostgreSQL 17). */
export async function connectPglite(): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite();
  await db.waitReady;
  return {
    query: (sql, params) => db.query(sql, params) as never,
    exec: async (sql) => { await db.exec(sql); },
    transaction: (fn) => db.transaction((tx) => fn({ query: (sql, params) => tx.query(sql, params) as never, exec: async (sql) => { await tx.exec(sql); } })),
    close: () => db.close(),
  };
}
