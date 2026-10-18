// Kullanım: DATABASE_URL=postgres://… npm run migrate
import { connectPostgres } from "../db.ts";
import { migrate } from "../migrate.ts";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL tanımlı değil."); process.exit(1); }
const db = await connectPostgres(url);
try {
  const done = await migrate(db);
  console.log(done.length ? `Uygulandı: ${done.join(", ")}` : "Veritabanı güncel.");
} finally {
  await db.close();
}
