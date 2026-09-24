#!/usr/bin/env node

import { createHmac, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const argOf = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const BASE = String(argOf("--base", "https://klinorbis.ekremalan.chatgpt.site")).replace(/\/$/, "");
const JSON_OUT = argOf("--json");
const SECRET = process.env.KLINORBIS_N8N_SHARED_SECRET || "";
const SITES_TOKEN = process.env.KLINORBIS_SITES_AUTH_TOKEN || "";
const results = [];
const STATES = { OK: "DOĞRULANDI", WAIT: "VERİ BEKLİYOR", FAIL: "BAŞARISIZ" };

function record(id, title, state, detail) {
  results.push({ olcut: id, baslik: title, durum: state, detay: sanitize(detail) });
}

function sanitize(value) {
  return String(value)
    .replace(/\b[1-9]\d{10}\b/g, "[TCKN_MASKED]")
    .replace(/\b(?:\+?90\s?|0)?(?:5\d{2}|[2-4]\d{2})[\s().-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}\b/g, "[PHONE_MASKED]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL_MASKED]")
    .slice(0, 1_500);
}

async function http(method, path, { headers = {}, body = null } = {}) {
  const requestHeaders = { accept: "application/json", ...headers };
  if (SITES_TOKEN) {
    requestHeaders["OAI-Sites-Authorization"] = SITES_TOKEN.startsWith("Bearer ")
      ? SITES_TOKEN
      : `Bearer ${SITES_TOKEN}`;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers: requestHeaders,
      body,
      signal: controller.signal,
      redirect: "manual",
    });
    const raw = await response.text();
    let json = null;
    try { json = JSON.parse(raw); } catch { /* non-JSON dispatch response */ }
    return { status: response.status, json, isJson: json !== null };
  } finally {
    clearTimeout(timer);
  }
}

function dispatchBlocked(response) {
  return response.status === 401 && !response.isJson;
}

function authenticationRequired(response) {
  return response.status === 401 && (
    !response.isJson || response.json?.code === "AUTH_REQUIRED"
  );
}

function validCounter(value) {
  return Number.isInteger(value) && value >= 0;
}

async function main() {
  console.log(`KLINORBIS izleme · ${new Date().toISOString()} · hedef: ${BASE}`);
  console.log(`Sites makine anahtarı: ${SITES_TOKEN ? "tanımlı" : "tanımsız"} · HMAC anahtarı: ${SECRET ? "tanımlı" : "tanımsız"}`);

  const site = await http("GET", "/");
  const statusResponse = await http("GET", "/api/automation/status");
  if (site.status === 200 && statusResponse.status === 200 && statusResponse.isJson) {
    record(1, "Site ve güvenli otomasyon durumu erişilebilir", STATES.OK, "Ana sayfa 200 · otomasyon durumu 200");
  } else if (authenticationRequired(site) || authenticationRequired(statusResponse)) {
    record(1, "Site ve güvenli otomasyon durumu erişilebilir", STATES.WAIT, "Yetkili kullanıcı oturumu veya imzalı ajan yanıtı bekleniyor.");
  } else {
    record(1, "Site ve güvenli otomasyon durumu erişilebilir", STATES.FAIL, `Ana sayfa ${site.status} · otomasyon durumu ${statusResponse.status}`);
  }

  let agentRun = null;
  if (!SECRET) {
    record(2, "Ajan tetikleme HTTP 202", STATES.WAIT, "KLINORBIS_N8N_SHARED_SECRET tanımsız; yazma işlemi yapılmadı.");
  } else {
    const eventId = `monitor-${randomUUID()}`;
    const timestamp = String(Date.now());
    const body = JSON.stringify({ action: "tick" });
    const signature = createHmac("sha256", SECRET).update(`${timestamp}.${eventId}.${body}`).digest("hex");
    const response = await http("POST", "/api/automation/agent", {
      headers: {
        "content-type": "application/json",
        "x-klinorbis-event-id": eventId,
        "x-klinorbis-timestamp": timestamp,
        "x-klinorbis-signature": signature,
      },
      body,
    });
    if (response.status === 202 && response.json?.ok) {
      agentRun = response.json;
      record(2, "Ajan tetikleme HTTP 202", STATES.OK, `HTTP 202 · taranan ${response.json.cycle?.scanned ?? 0} · tamamlanan ${response.json.cycle?.completed ?? 0}`);
    } else if (response.status === 200 && response.json?.duplicate) {
      agentRun = response.json;
      record(2, "Ajan tetikleme HTTP 202", STATES.OK, "Idempotency doğrulandı; yinelenen olay ikinci kez çalıştırılmadı.");
    } else if (dispatchBlocked(response)) {
      record(2, "Ajan tetikleme HTTP 202", STATES.WAIT, "Sites dispatch makine erişim anahtarı bekliyor; HMAC isteği uygulamaya ulaşmadı.");
    } else {
      record(2, "Ajan tetikleme HTTP 202", STATES.FAIL, `HTTP ${response.status}${response.json?.code ? ` · ${response.json.code}` : ""}`);
    }
  }

  const monitor = agentRun?.monitor || (
    statusResponse.status === 200 && statusResponse.isJson ? statusResponse.json : null
  );
  const agent = agentRun?.status || monitor?.agent || null;
  if (agent) {
    record(3, "Ajan sağlığı ve son tur sonucu", agent.state === "running" && agent.lastCycleStatus === "completed" ? STATES.OK : STATES.FAIL,
      `state=${agent.state} · sonTur=${agent.lastCycleStatus ?? "yok"} · başarılı=${agent.lastRunSucceeded === true}`);
    record(4, "Son başarılı çalışma ≤ 3 dakika", validCounter(agent.ageSeconds) && agent.ageSeconds <= 180 && agent.lastRunSucceeded === true ? STATES.OK : STATES.FAIL,
      `yaş=${agent.ageSeconds ?? "yok"} sn · son başarılı=${agent.lastSuccessfulRunAt ?? "yok"}`);
    const jobs = agent.jobs || {};
    const countersValid = [jobs.queued, jobs.completed, jobs.deadLetter].every(validCounter);
    record(5, "İş sayaçları doğrulanmış sayılar", countersValid ? STATES.OK : STATES.FAIL,
      countersValid ? `kuyruk=${jobs.queued} · tamamlanan=${jobs.completed} · dead-letter=${jobs.deadLetter}` : "Sayaçlardan biri eksik veya sayısal değil.");
  } else {
    for (const [id, title] of [[3, "Ajan sağlığı ve son tur sonucu"], [4, "Son başarılı çalışma ≤ 3 dakika"], [5, "İş sayaçları doğrulanmış sayılar"]]) {
      record(id, title, STATES.WAIT, "İmzalı ajan yanıtı veya yetkili durum verisi alınamadı.");
    }
  }

  if (monitor) {
    const deadLetterTotal = Number(monitor.deadLetterTotal ?? monitor.agent?.jobs?.deadLetter ?? 0);
    const failed = Array.isArray(monitor.failed) ? monitor.failed : [];
    if (deadLetterTotal === 0) {
      record(6, "Dead-letter sayısı ve hata nedeni", STATES.OK, "Dead-letter kuyruğu boş.");
    } else if (failed.length >= deadLetterTotal && failed.every((job) => job.lastError)) {
      record(6, "Dead-letter sayısı ve hata nedeni", STATES.FAIL, `${deadLetterTotal} karantina işi: ${failed.slice(0, 5).map((job) => `${job.jobKey} [${job.ruleCode}] ${job.lastError}`).join(" | ")}`);
    } else {
      record(6, "Dead-letter sayısı ve hata nedeni", STATES.WAIT, `${deadLetterTotal} karantina işi var; tüm hata nedenleri görünür değil.`);
    }

    const decisions = Array.isArray(monitor.decisions) ? monitor.decisions : [];
    const validDecisions = decisions.filter((decision) =>
      typeof decision.decisionCode === "string" && decision.decisionCode.length > 0 &&
      typeof decision.decisionDetail === "string" && decision.decisionDetail.length > 0 &&
      Array.isArray(decision.alternatives) && decision.training === true);
    record(7, "Sevk kararları kodlu, gerekçeli ve alternatifli", validDecisions.length > 0 ? STATES.OK : STATES.WAIT,
      validDecisions.length ? `${validDecisions.length} doğrulanmış eğitim/pilot kararı bulundu.` : "Doğrulanabilir karar kaydı henüz oluşmadı.");

    const pilot = monitor.pilotData;
    const inspectedPilotRecords = Number(pilot?.inspected ?? 0);
    const pilotState = inspectedPilotRecords === 0
      ? STATES.WAIT
      : pilot?.trainingTagged > 0 && pilot?.nonTrainingFound === 0
        ? STATES.OK
        : STATES.FAIL;
    record(8, "Pilot verisi eğitim etiketiyle ayrılmış", pilotState,
      `incelenen=${inspectedPilotRecords} · eğitim etiketli=${pilot?.trainingTagged ?? 0} · etiketsiz=${pilot?.nonTrainingFound ?? 0}`);

    const connectors = Array.isArray(monitor.connectors) ? monitor.connectors : [];
    const n8n = connectors.find((connector) => connector.id === "n8n-self-hosted");
    const n8nTruthful = Boolean(n8n) && (
      n8n.configuration?.endpointConfigured
        ? n8n.configuration?.signingKeyConfigured && n8n.state === "connected"
        : n8n.state !== "connected"
    );
    record(9, "n8n bağlantı iddiası yapılandırmayla tutarlı", n8nTruthful ? STATES.OK : STATES.FAIL,
      n8n ? `durum=${n8n.state} · adres=${Boolean(n8n.configuration?.endpointConfigured)} · imza=${Boolean(n8n.configuration?.signingKeyConfigured)}` : "n8n bağlayıcısı bulunamadı.");

    const required = new Set(["klinorbis-worker", "capacity-orchestrator", "n8n-self-hosted", "hospital-pbx", "hbys"]);
    const present = new Set(connectors.map((connector) => connector.id));
    record(10, "Pilot, HBYS, santral ve n8n ayrı bağlayıcılar", [...required].every((id) => present.has(id)) ? STATES.OK : STATES.FAIL,
      [...required].map((id) => `${id}:${present.has(id) ? "var" : "yok"}`).join(" · "));
  } else {
    for (const [id, title] of [[6, "Dead-letter sayısı ve hata nedeni"], [7, "Sevk kararları kodlu, gerekçeli ve alternatifli"], [8, "Pilot verisi eğitim etiketiyle ayrılmış"], [9, "n8n bağlantı iddiası yapılandırmayla tutarlı"], [10, "Pilot, HBYS, santral ve n8n ayrı bağlayıcılar"]]) {
      record(id, title, STATES.WAIT, "Güvenli ve kimliksiz izleme özeti alınamadı.");
    }
  }

  results.sort((left, right) => left.olcut - right.olcut);
  const icons = { [STATES.OK]: "✅", [STATES.WAIT]: "⏳", [STATES.FAIL]: "❌" };
  for (const result of results) console.log(`${icons[result.durum]} Ölçüt ${result.olcut} · ${result.baslik} → ${result.durum}\n   ${result.detay}`);
  const summary = {
    dogrulanan: results.filter((result) => result.durum === STATES.OK).length,
    veriBekleyen: results.filter((result) => result.durum === STATES.WAIT).length,
    basarisiz: results.filter((result) => result.durum === STATES.FAIL).length,
  };
  console.log(`\nÖzet: ${summary.dogrulanan} doğrulandı · ${summary.veriBekleyen} veri bekliyor · ${summary.basarisiz} başarısız`);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ hedef: BASE, zaman: new Date().toISOString(), ozet: summary, sonuclar: results }, null, 2), { mode: 0o600 });
  process.exitCode = summary.basarisiz > 0 ? 1 : summary.veriBekleyen > 0 ? 3 : 0;
}

main().catch((error) => {
  console.error(`İzleme aracı tamamlanamadı: ${sanitize(error?.message || error)}`);
  process.exitCode = 2;
});
