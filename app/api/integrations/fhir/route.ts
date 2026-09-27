import { appendAudit } from "../../../../lib/audit";
import { getDb } from "../../../../db";
import { sampleCapacityBundle, validateCapacityBundle } from "../../../../lib/fhir";
import { assertBrowserMutation, assertJsonRequest, enforceRateLimit, requireActor, SecurityError, securityResponse } from "../../../../lib/security";

export const dynamic = "force-dynamic";
const noStore = { "cache-control": "no-store, private" };
// Entegrasyonu yöneten roller: operasyon yöneticisi ve bilgi güvenliği yetkilisi.
const allowed = (role: string) => role === "operations_manager" || role === "security_officer";

// GET: sentetik örnek paket. POST: gönderilen FHIR R4 Bundle'ı doğrular; HİÇBİR ŞEY SAKLAMAZ.
export async function GET(request: Request) {
  try {
    const actor = await requireActor(request);
    if (!allowed(actor.role)) throw new SecurityError(403, "FHIR doğrulayıcıyı operasyon yöneticisi veya güvenlik yetkilisi kullanır.", "FORBIDDEN");
    return Response.json({ sample: sampleCapacityBundle() }, { headers: noStore });
  } catch (error) { return securityResponse(error, request); }
}

export async function POST(request: Request) {
  try {
    assertJsonRequest(request, 262_144);
    assertBrowserMutation(request);
    const actor = await requireActor(request);
    if (!allowed(actor.role)) throw new SecurityError(403, "FHIR doğrulayıcıyı operasyon yöneticisi veya güvenlik yetkilisi kullanır.", "FORBIDDEN");
    await enforceRateLimit(request, actor, "fhir.validate", 20, 60);
    const text = await request.text();
    if (text.length > 262_144) throw new SecurityError(413, "Paket 256 KB sınırını aşıyor.", "PAYLOAD_TOO_LARGE");
    let body: unknown;
    try { body = JSON.parse(text); } catch { return Response.json({ ok: false, errors: ["Geçerli JSON değil."], warnings: [], units: [], beds: 0 }, { status: 400, headers: noStore }); }
    const report = validateCapacityBundle(body);
    // İçerik değil, yalnız sonuç özeti denetim izine yazılır.
    await appendAudit(getDb(), { actor: actor.email, action: "fhir.validate", resource: "integration:fhir", result: report.ok ? "success" : "rejected", detail: `${report.beds} yatak, ${report.units.length} birim, ${report.errors.length} hata` });
    return Response.json(report, { status: report.ok ? 200 : 422, headers: noStore });
  } catch (error) { return securityResponse(error, request); }
}
