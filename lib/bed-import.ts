// K10: Excel'den yatak listesi. Excel'de satırları seçip kopyalayın ve yapıştırın (sekmeyle ayrılmış) ya da CSV yükleyin.
// Sütunlar: yatak_kodu, kampus, bina, kat, birim, oda. Bulut demo yalnız KURGUSAL kod kabul eder (ör. YTK-SIM-101).
export type BedRow = { id: string; campus: string; building: string; floor: string; unit: string; room: string };
export type ImportResult = { rows: BedRow[]; errors: string[] };
export const MAX_IMPORT_ROWS = 500;
export const BED_ID = /^[A-Z]{2,4}-SIM-\d{3}$/;
const HEADER = ["yatak_kodu", "kampus", "bina", "kat", "birim", "oda"];

const fold = (v: string) => v.toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/\s+/g, "_");
function splitLine(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  // CSV: virgül veya noktalı virgül; tırnaklı alanlar desteklenir.
  const sep = line.split(";").length > line.split(",").length ? ";" : ",";
  const out: string[] = []; let cur = "", q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (ch === sep && !q) { out.push(cur.trim()); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}
const clean = (v: string | undefined, max = 40) => String(v ?? "").replace(/[<>]/g, "").trim().slice(0, max);

export function parseBedList(text: string): ImportResult {
  const lines = String(text ?? "").replace(/\r/g, "").split("\n").filter((l) => l.trim());
  const errors: string[] = [];
  if (!lines.length) return { rows: [], errors: ["Liste boş."] };
  let cells = lines.map(splitLine);
  if (cells[0].map(fold).join(",") === HEADER.join(",") || fold(cells[0][0] ?? "") === "yatak_kodu") cells = cells.slice(1);
  if (cells.length > MAX_IMPORT_ROWS) return { rows: [], errors: [`En fazla ${MAX_IMPORT_ROWS} satır yüklenebilir.`] };
  const rows: BedRow[] = []; const seen = new Set<string>();
  cells.forEach((c, i) => {
    const line = i + 1;
    const id = clean(c[0], 20).toUpperCase();
    if (!BED_ID.test(id)) { errors.push(`${line}. satır: yatak kodu kurgusal biçimde olmalı (ör. YTK-SIM-101).`); return; }
    if (seen.has(id)) { errors.push(`${line}. satır: ${id} iki kez yazılmış.`); return; }
    const [campus, building, floor, unit, room] = [clean(c[1]), clean(c[2]), clean(c[3]), clean(c[4], 6).toUpperCase(), clean(c[5])];
    if (!campus || !building || !floor || !/^[A-Z]{2,6}$/.test(unit) || !room) { errors.push(`${line}. satır: kampüs, bina, kat, birim kodu ve oda dolu olmalı.`); return; }
    seen.add(id); rows.push({ id, campus, building, floor, unit, room });
  });
  return { rows, errors };
}
