"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

export type View =
  | "dashboard"
  | "inbox"
  | "flow"
  | "requests"
  | "appointments"
  | "calls"
  | "approvals"
  | "automation"
  | "capacity"
  | "integrations"
  | "units"
  | "staff"
  | "reports"
  | "privacy"
  | "security"
  | "audit";
type DateValue = string | number | Date | null | undefined;
type Task = {
  reference: string;
  ticketReference?: string | null;
  callReference?: string | null;
  unitCode: string;
  assignedRole: string;
  status: string;
  priority: string;
  dueAt?: DateValue;
  acceptedBy?: string | null;
  acceptedAt?: DateValue;
  updatedAt?: DateValue;
};
type TicketEvent = {
  id: number;
  eventType: string;
  actor: string;
  fromUnitCode?: string | null;
  toUnitCode?: string | null;
  detail: string;
  createdAt: DateValue;
};
type Ticket = {
  id: number;
  reference: string;
  patientAlias: string;
  subject: string;
  unit: string;
  unitCode: string;
  previousUnitCode?: string | null;
  assignedRole: string;
  acceptedBy?: string | null;
  acceptedAt?: DateValue;
  priority: string;
  status: string;
  channel: string;
  createdAt: DateValue;
  updatedAt: DateValue;
  slaDueAt?: DateValue;
  humanApprovalRequired?: boolean;
  task?: Task | null;
  history: TicketEvent[];
};
type Unit = {
  code: string;
  name: string;
  kind: string;
  scope: string;
  slaMinutes: number;
  queue: number;
  assignedRole: string;
};
type Facility = {
  code: string;
  name: string;
  campusType: string;
  city: string;
  status: string;
  totalBeds: number;
  training: boolean;
  updatedAt: DateValue;
};
type Capacity = {
  facilityCode: string;
  unitCode: string;
  resourceCode: string;
  resourceLabel: string;
  total: number;
  occupied: number;
  reserved: number;
  blocked: number;
  cleaning: number;
  staffed: number;
  dischargeForecast: number;
  incoming: number;
  outgoing: number;
  available: number;
  status: string;
  training: boolean;
  updatedAt: DateValue;
};
type Transfer = {
  reference: string;
  patientAlias: string;
  sourceFacilityCode: string;
  targetFacilityCode: string;
  requestedUnitCode: string;
  resourceCode: string;
  resourceLabel: string;
  requestedCount: number;
  priority: string;
  status: string;
  decisionCode?: string | null;
  decisionDetail?: string | null;
  alternatives: Array<{ facilityCode?: string; available?: number }>;
  ticketReference?: string | null;
  training: boolean;
  createdAt: DateValue;
  decidedAt?: DateValue;
  updatedAt: DateValue;
};
type Shift = {
  reference: string;
  staffLabel: string;
  facilityCode: string;
  unitCode: string;
  role: string;
  shiftCode: string;
  status: string;
  handoffTo?: string | null;
  training: boolean;
  startedAt: DateValue;
  endsAt: DateValue;
  updatedAt: DateValue;
};
type ReportAssignment = {
  reference: string;
  reportCode: string;
  title: string;
  scopeType: string;
  facilityCode?: string | null;
  unitCode?: string | null;
  assignedRole: string;
  schedule: string;
  status: string;
  delivery: string;
  result: Record<string, unknown>;
  training: boolean;
  lastRunAt?: DateValue;
  nextRunAt: DateValue;
};
type CallMessage = {
  id: number;
  sequence: number;
  speakerType: string;
  speakerLabel: string;
  message: string;
  redacted: boolean;
  createdAt: DateValue;
};
type Call = {
  reference: string;
  patientAlias: string;
  source: string;
  direction: string;
  status: string;
  unitCode: string;
  assignedRole: string;
  summary?: string | null;
  training: boolean;
  requiresHuman: boolean;
  startedAt: DateValue;
  lastMessageAt: DateValue;
  endedAt?: DateValue;
  messages: CallMessage[];
  task?: Task | null;
};
type Event = {
  id: number;
  ticketReference: string;
  rule: string;
  outcome: string;
  unitCode?: string | null;
  eventType: string;
  actor: string;
  createdAt: DateValue;
};
type Approval = {
  reference: string;
  ticketReference?: string | null;
  callReference?: string | null;
  unitCode: string;
  approvalType: string;
  status: string;
  createdAt: DateValue;
};
type Staff = {
  accountKey: string;
  displayLabel: string;
  systemRole: string;
  active: boolean;
  lastSeenAt?: DateValue;
  memberships: Array<{
    unitCode: string;
    unitRole: string;
    canManageTickets: boolean;
    canReadCalls: boolean;
  }>;
};
type Audit = {
  id: number;
  actor: string;
  action: string;
  resource: string;
  result: string;
  detail?: string | null;
  previousHash: string;
  currentHash: string;
  createdAt: DateValue;
};
type Snapshot = {
  generatedAt: string;
  identity: {
    label: string;
    role: string;
    unitCodes: string[];
    canSeeAllUnits: boolean;
  };
  units: Unit[];
  tickets: Ticket[];
  tasks: Task[];
  calls: Call[];
  events: Event[];
  approvals: Approval[];
  jobs: { queued: number; completed: number; deadLetter: number };
  automation: {
    pilot: null | {
      enabled: true;
      disclosure: string;
      runReference: string;
      callReference: string;
      ticketReference: string;
      scenarioCode: string;
      scenarioTitle: string;
      unitCode: string;
      step: number;
      totalSteps: number;
      stepLabel: string;
      nextStepAt: string;
      engine: string;
    };
    controlTower: null | {
      enabled: true;
      disclosure: string;
      runReference: string;
      transferReference: string;
      ticketReference: string;
      scenarioCode: string;
      sourceFacilityCode: string;
      targetFacilityCode: string;
      unitCode: string;
      step: number;
      totalSteps: number;
      stepLabel: string;
      nextStepAt: string;
      engine: string;
    };
    agent: {
      state: "running" | "degraded" | "stale" | "waiting";
      lastRunAt: DateValue;
      lastSuccessfulRunAt: DateValue;
      lastRunSucceeded: boolean;
      lastCycleStatus: string | null;
      lastActor: string | null;
      ageSeconds: number | null;
      heartbeatWindowSeconds: number;
      trigger: string;
    };
    connectors: Array<{
      id: string;
      name: string;
      provider: string;
      state: "active" | "connected" | "adapter_ready" | "not_configured";
      truthLabel: string;
      detail: string;
      configuration: { endpointConfigured: boolean; signingKeyConfigured: boolean };
    }>;
  };
  facilities: Facility[];
  capacity: Capacity[];
  capacitySummary: {
    total: number;
    occupied: number;
    reserved: number;
    available: number;
    blocked: number;
    dischargeForecast: number;
    incoming: number;
    outgoing: number;
    transfersOpen: number;
    autoAccepted: number;
    autoRejected: number;
    checking: number;
  };
  transfers: Transfer[];
  shifts: Shift[];
  reports: ReportAssignment[];
  security: Array<{
    id: number;
    eventType: string;
    severity: string;
    path: string;
    detail: string;
    createdAt: DateValue;
  }>;
  staff: Staff[];
  audit: Audit[];
};
type SecurityStatus = {
  posture: string;
  controls: Record<string, boolean>;
  eventCount: number;
  recent: Snapshot["security"];
  generatedAt: string;
};
type Receipt = {
  title: string;
  detail: string;
  path: string;
  actionLabel: string;
};
type DialogKind = "ticket" | "appointment" | "call" | null;
type ApiError = { error?: string };
type Destination = {
  unitCode: string;
  unitName: string;
  assignedRole: string;
  taskReference?: string;
  queueStatus?: string;
};
type CallCreateResponse = ApiError & { call: Call; destination: Destination };
type TicketCreateResponse = ApiError & {
  ticket: Ticket;
  destination: Destination;
};
type CallMessageResponse = ApiError & {
  call: Call;
  destination: Destination;
  emergency: boolean;
};
type ApprovalDecisionResponse = ApiError & {
  approval: Approval;
  relatedReference: string;
};

const viewPaths: Record<View, string> = {
  dashboard: "/",
  inbox: "/inbox",
  flow: "/flow",
  requests: "/requests",
  appointments: "/appointments",
  calls: "/calls",
  approvals: "/approvals",
  automation: "/automation",
  capacity: "/capacity",
  integrations: "/integrations",
  units: "/units",
  staff: "/staff",
  reports: "/reports",
  privacy: "/privacy",
  security: "/security",
  audit: "/audit",
};
const titles: Record<View, string> = {
  dashboard: "Operasyon Merkezi",
  inbox: "Ortak İş Kutusu",
  flow: "Uçtan Uca Akış",
  requests: "Hasta Talepleri",
  appointments: "Randevu Talepleri",
  calls: "Çağrı ve Konuşmalar",
  approvals: "İnsan Onayları",
  automation: "Canlı Otomasyon",
  capacity: "Kapasite ve Transfer",
  integrations: "Entegrasyon Sağlığı",
  units: "Hastane Birimleri",
  staff: "Personel ve Yetki",
  reports: "Operasyon Raporları",
  privacy: "KVKK ve Etik",
  security: "Siber Güvenlik Merkezi",
  audit: "Denetim İzleri",
};
const nav: Array<{ view: View; icon: string; label: string; group?: string }> =
  [
    { view: "dashboard", icon: "▦", label: "Operasyon Merkezi" },
    { view: "inbox", icon: "◎", label: "Ortak İş Kutusu" },
    { view: "flow", icon: "⇢", label: "Uçtan Uca Akış" },
    { view: "requests", icon: "◉", label: "Hasta Talepleri" },
    { view: "appointments", icon: "▣", label: "Randevu Talepleri" },
    { view: "calls", icon: "☎", label: "Çağrı ve Konuşmalar" },
    { view: "approvals", icon: "✓", label: "İnsan Onayları" },
    {
      view: "automation",
      icon: "⌘",
      label: "Canlı Otomasyon",
      group: "OPERASYON",
    },
    { view: "capacity", icon: "↔", label: "Kapasite ve Transfer" },
    { view: "integrations", icon: "⌁", label: "Entegrasyon Sağlığı" },
    { view: "units", icon: "◇", label: "Birim Çalışma Masaları" },
    { view: "staff", icon: "♙", label: "Personel ve Yetki" },
    { view: "reports", icon: "▥", label: "Raporlar" },
    { view: "privacy", icon: "⌾", label: "KVKK ve Etik", group: "GÜVENCE" },
    { view: "security", icon: "⬡", label: "Siber Güvenlik" },
    { view: "audit", icon: "≡", label: "Denetim İzleri" },
  ];
const roleNames: Record<string, string> = {
  operations_manager: "Operasyon Yöneticisi",
  unit_manager: "Birim Sorumlusu",
  clinician: "Klinik Rol",
  call_agent: "Çağrı Merkezi Görevlisi",
  privacy_officer: "KVKK Yetkilisi",
  security_officer: "Bilgi Güvenliği Yetkilisi",
};
const controlNames: Record<string, [string, string]> = {
  platformIdentity: [
    "Platform kimliği",
    "Oturum kimliği sunucu başlığından alınır; tarayıcı rol seçemez.",
  ],
  serverAuthorization: [
    "Sunucu yetkilendirmesi",
    "Her yazma işlemi sunucuda rol ve yetki kontrolünden geçer.",
  ],
  unitIsolation: [
    "Birim izolasyonu",
    "Personel yalnız üyeliği bulunan birim kuyruğunu görür.",
  ],
  objectAuthorization: [
    "Kayıt bazlı erişim",
    "Talep ve görüşme kimliği değiştirilse bile birim yetkisi yeniden doğrulanır.",
  ],
  csrfOriginDefense: [
    "CSRF ve köken koruması",
    "Başka siteden işlem üretme denemeleri engellenir.",
  ],
  rateLimiting: [
    "Hız sınırlama",
    "Aşırı API kullanımı D1 sayaçlarıyla durdurulur ve olay kaydı açılır.",
  ],
  bodySizeLimit: [
    "İstek boyutu sınırı",
    "Aşırı büyük gövdeler işlenmeden reddedilir.",
  ],
  piiRedaction: [
    "PII maskeleme",
    "TCKN, telefon ve e-posta iş akışına girmeden maskelenir.",
  ],
  tamperEvidentAudit: [
    "Zincirli denetim izi",
    "Kayıtlar önceki hash ile bağlanarak değişiklik izi oluşturur.",
  ],
  signedWebhooks: [
    "İmzalı santral webhook'u",
    "HMAC, zaman penceresi ve olay kimliğiyle sahte/replay çağrı olayı engellenir.",
  ],
  securityHeaders: [
    "Tarayıcı güvenlik başlıkları",
    "CSP, clickjacking, MIME ve izin politikaları Worker katmanında uygulanır.",
  ],
  externalHealthDataTransfer: [
    "Dış sağlık verisi aktarımı",
    "Bu pilotta kapalıdır; genel AI/n8n bulutuna sağlık verisi çıkmaz.",
  ],
};

export default function Dashboard({
  initialView = "dashboard",
  initialReference,
}: {
  initialView?: View;
  initialReference?: string;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [security, setSecurity] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [bell, setBell] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const knownCalls = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  const refreshInFlight = useRef(false);

  const navigate = useCallback(
    (view: View, reference?: string) => {
      const base = viewPaths[view];
      router.push(
        reference ? `${base}/${encodeURIComponent(reference)}` : base,
      );
      setMenu(false);
      setBell(false);
    },
    [router],
  );

  const refresh = useCallback(
    async (silent = false) => {
      if (refreshInFlight.current) return;
      refreshInFlight.current = true;
      try {
        const response = await fetch("/api/workspace", { cache: "no-store" });
        const data = (await response.json()) as Snapshot & { error?: string };
        if (!response.ok)
          throw new Error(data.error || "Çalışma alanı okunamadı.");
        if (initialized.current) {
          const incoming = data.calls.find(
            (call) =>
              !knownCalls.current.has(call.reference) &&
              ["ringing", "active", "human_handoff"].includes(call.status),
          );
          if (incoming) {
            setReceipt({
              title: incoming.training
                ? "Yeni kimliksiz pilot görüşme akışa düştü"
                : "Yeni gelen görüşme otomatik açıldı",
              detail: `${incoming.reference} · ${unitName(data, incoming.unitCode)} · ${incoming.assignedRole}${incoming.training ? " · GERÇEK HASTA DEĞİL" : ""}`,
              path: `/calls/${encodeURIComponent(incoming.reference)}`,
              actionLabel: "Görüşmeye dön",
            });
            if (!incoming.training || initialView === "calls") {
              router.push(`/calls/${encodeURIComponent(incoming.reference)}`);
            }
          }
        }
        knownCalls.current = new Set(data.calls.map((call) => call.reference));
        initialized.current = true;
        setSnapshot(data);
        setError("");
        if (!silent) setLoading(false);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Sunucu bağlantısı kurulamadı.",
        );
        if (!silent) setLoading(false);
      } finally {
        refreshInFlight.current = false;
      }
    },
    [initialView, router],
  );

  const refreshSecurity = useCallback(async () => {
    try {
      const response = await fetch("/api/security/status", {
        cache: "no-store",
      });
      if (response.ok) setSecurity((await response.json()) as SecurityStatus);
    } catch {
      /* Main workspace remains available if assurance telemetry is temporarily unavailable. */
    }
  }, []);

  useEffect(() => {
    const initialTimer = window.setTimeout(() => {
      void refresh();
      if (initialView === "security" || initialView === "privacy")
        void refreshSecurity();
    }, 0);
    const timer = window.setInterval(() => void refresh(true), 5000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, [initialView, refresh, refreshSecurity]);

  const notices = useMemo(() => {
    if (!snapshot) return [];
    const pendingApprovals = snapshot.approvals
      .filter((approval) => approval.status === "pending")
      .map((approval) => ({
        id: approval.reference,
        title: "İnsan onayı bekleniyor",
        detail: `${approval.reference} · ${unitName(snapshot, approval.unitCode)}`,
        time: formatTime(approval.createdAt),
        path: approval.ticketReference
          ? `/requests/${approval.ticketReference}`
          : `/calls/${approval.callReference}`,
        urgent: true,
      }));
    const queuedTasks = snapshot.tasks
      .filter((task) => task.status === "queued")
      .slice(0, 8)
      .map((task) => ({
        id: task.reference,
        title: `${task.assignedRole} kuyruğunda yeni görev`,
        detail: `${task.reference} · ${unitName(snapshot, task.unitCode)}`,
        time: formatTime(task.updatedAt),
        path: task.ticketReference
          ? `/requests/${task.ticketReference}`
          : `/calls/${task.callReference}`,
        urgent: task.priority === "Acil",
      }));
    return [...pendingApprovals, ...queuedTasks].slice(0, 12);
  }, [snapshot]);

  async function secureMutation<T extends ApiError>(
    url: string,
    body?: unknown,
  ): Promise<T> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-klinorbis-request": "browser",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await response.json()) as T;
    if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
    return data;
  }

  async function ticketAction(
    reference: string,
    action: "accept" | "start" | "resolve" | "transfer",
    targetUnitCode?: string,
  ) {
    setBusy(`${reference}:${action}`);
    try {
      const response = await fetch("/api/tickets", {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          "x-klinorbis-request": "browser",
        },
        body: JSON.stringify({ reference, action, targetUnitCode }),
      });
      const data = (await response.json()) as ApiError;
      if (!response.ok) throw new Error(data.error || "İşlem tamamlanamadı.");
      await refresh(true);
    } catch (cause) {
      setReceipt({
        title: "Talep işlemi uygulanmadı",
        detail: cause instanceof Error ? cause.message : "Sunucu işlemi reddetti.",
        path: viewPaths[initialView],
        actionLabel: "Ekrana dön",
      });
    } finally {
      setBusy("");
    }
  }

  async function sendCallMessage(
    reference: string,
    speakerType: "caller" | "agent" | "clinician",
    message: string,
  ) {
    setBusy(`${reference}:message`);
    try {
      const data = await secureMutation<CallMessageResponse>(
        "/api/calls/messages",
        { callReference: reference, speakerType, message },
      );
      setReceipt({
        title: data.emergency
          ? "Acil insan devri otomatik açıldı"
          : "Konuşma satırı görüşmeye eklendi",
        detail: data.emergency
          ? `${data.destination.unitName} · ${data.destination.assignedRole} · insan onayı bekleniyor`
          : `${reference} · ${data.destination.unitName} · kalıcı görüşme kaydı`,
        path: `/calls/${reference}`,
        actionLabel: "Görüşmeye dön",
      });
      await refresh(true);
    } catch (cause) {
      setReceipt({
        title: "Konuşma eklenmedi",
        detail:
          cause instanceof Error ? cause.message : "Sunucu işlemi reddetti.",
        path: `/calls/${reference}`,
        actionLabel: "Görüşmeye dön",
      });
    } finally {
      setBusy("");
    }
  }

  async function decideApproval(
    reference: string,
    decision: "approve" | "reject",
  ) {
    setBusy(`${reference}:${decision}`);
    try {
      const data = await secureMutation<ApprovalDecisionResponse>(
        "/api/approvals",
        { reference, decision },
      );
      const isCall = Boolean(data.approval.callReference);
      setReceipt({
        title:
          decision === "approve"
            ? "İnsan onayı verildi"
            : "Onay reddedildi ve insan incelemesine bırakıldı",
        detail: `${reference} · ${unitName(snapshot!, data.approval.unitCode)} · ${data.relatedReference}`,
        path: isCall
          ? `/calls/${data.relatedReference}`
          : `/requests/${data.relatedReference}`,
        actionLabel: "İlgili kaydı aç",
      });
      await refresh(true);
    } catch (cause) {
      setReceipt({
        title: "Onay kararı uygulanmadı",
        detail:
          cause instanceof Error ? cause.message : "Sunucu işlemi reddetti.",
        path: "/approvals",
        actionLabel: "Onaylara dön",
      });
    } finally {
      setBusy("");
    }
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const kind = String(form.get("kind"));
    setBusy("create");
    try {
      if (kind === "call") {
        const data = await secureMutation<CallCreateResponse>("/api/calls", {
          patientAlias: form.get("patientAlias"),
          openingMessage: form.get("openingMessage"),
        });
        setDialog(null);
        setReceipt({
          title: "Gelen çağrı kaydı açıldı",
          detail: `${data.call.reference} · ${data.destination.unitName} · ${data.destination.taskReference}`,
          path: `/calls/${data.call.reference}`,
          actionLabel: "Görüşmeyi aç",
        });
        await refresh(true);
        router.push(`/calls/${data.call.reference}`);
      } else {
        const subject =
          kind === "appointment"
            ? `${form.get("branch")} randevu talebi · tercih edilen tarih ${form.get("date")}`
            : form.get("subject");
        const response = await fetch("/api/tickets", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-klinorbis-request": "browser",
          },
          body: JSON.stringify({
            patientAlias: form.get("patientAlias"),
            subject,
            unitCode: kind === "appointment" ? "RND" : form.get("unitCode"),
            channel: "Web",
          }),
        });
        const data = (await response.json()) as TicketCreateResponse;
        if (!response.ok)
          throw new Error(data.error || "Talep oluşturulamadı.");
        setDialog(null);
        setReceipt({
          title: "Talep oluşturuldu ve kalıcı birim kuyruğuna gönderildi",
          detail: `${data.ticket.reference} · ${data.destination.unitName} · ${data.destination.assignedRole} · ${data.destination.taskReference}`,
          path: `/units/${data.destination.unitCode}`,
          actionLabel: "Hedef birimi aç",
        });
        await refresh(true);
        router.push(
          `/${kind === "appointment" ? "appointments" : "requests"}/${data.ticket.reference}`,
        );
      }
    } catch (cause) {
      setReceipt({
        title: "Kayıt oluşturulmadı",
        detail:
          cause instanceof Error ? cause.message : "Sunucu işlemi reddetti.",
        path: viewPaths[initialView],
        actionLabel: "Ekrana dön",
      });
    } finally {
      setBusy("");
    }
  }

  if (loading)
    return (
      <main className="loading-screen">
        <span className="brand-mark">K</span>
        <b>KLINORBIS çalışma alanı güvenli biçimde açılıyor…</b>
      </main>
    );
  if (!snapshot)
    return (
      <main className="loading-screen error-screen">
        <b>Çalışma alanı açılamadı</b>
        <p>{error}</p>
        <button className="primary" onClick={() => void refresh()}>
          Yeniden bağlan
        </button>
      </main>
    );

  const selectedTicket =
    initialReference &&
    ["requests", "inbox", "appointments"].includes(initialView)
      ? snapshot.tickets.find((ticket) => ticket.reference === initialReference)
      : undefined;
  const selectedCall =
    initialReference && initialView === "calls"
      ? snapshot.calls.find((call) => call.reference === initialReference)
      : snapshot.calls[0];
  const selectedUnit =
    initialReference && initialView === "units"
      ? snapshot.units.find((unit) => unit.code === initialReference)
      : undefined;

  return (
    <main className="shell">
      {menu && (
        <button
          className="menu-scrim"
          aria-label="Menüyü kapat"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={`sidebar ${menu ? "open" : ""}`}>
        <div className="brand">
          <span className="brand-mark">K</span>
          <div>
            <b>KLINORBIS</b>
            <small>HOSPITAL OPERATIONS</small>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const badge =
              item.view === "inbox"
                ? snapshot.tasks.filter(
                    (task) => !["completed", "cancelled"].includes(task.status),
                  ).length
                : item.view === "approvals"
                  ? snapshot.approvals.filter(
                      (approval) => approval.status === "pending",
                    ).length
                  : item.view === "calls"
                    ? snapshot.calls.filter((call) =>
                        [
                          "ringing",
                          "active",
                          "human_handoff",
                          "transferred",
                        ].includes(call.status),
                      ).length
                    : 0;
            return (
              <span key={item.view}>
                {item.group && <p>{item.group}</p>}
                <button
                  className={initialView === item.view ? "active" : ""}
                  onClick={() => navigate(item.view)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {badge > 0 && <i>{badge}</i>}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="system">
          <span className={`pulse ${error ? "off" : ""}`} />
          <div>
            <b>{error ? "Eşitleme uyarısı" : "Sunucu akışı bağlı"}</b>
            <small>{formatTime(snapshot.generatedAt)} · 2,5 sn yenileme</small>
          </div>
        </div>
      </aside>
      <section className="content">
        <header>
          <div className="header-title">
            <button
              aria-label="Menüyü aç"
              className="mobile-menu"
              onClick={() => setMenu(!menu)}
            >
              ☰
            </button>
            <div>
              <h1>{titles[initialView]}</h1>
              <p>
                {snapshot.identity.canSeeAllUnits
                  ? "Tüm hastane operasyon kapsamı"
                  : `${snapshot.identity.unitCodes.length} yetkili birim`}{" "}
                · sunucu rolü
              </p>
            </div>
          </div>
          <div className="header-actions">
            <div className="identity-chip">
              <span className="avatar">YK</span>
              <div>
                <b>{snapshot.identity.label}</b>
                <small>
                  {roleNames[snapshot.identity.role] || snapshot.identity.role}
                </small>
              </div>
            </div>
            <button
              className="bell"
              aria-label="Bildirim merkezini aç"
              onClick={() => setBell(!bell)}
            >
              ♧{notices.length > 0 && <i>{notices.length}</i>}
            </button>
            {bell && (
              <NotificationPanel
                notices={notices}
                open={(path) => router.push(path)}
                close={() => setBell(false)}
              />
            )}
          </div>
        </header>
        <ControlRibbon snapshot={snapshot} navigate={navigate} />
        {receipt && (
          <ReceiptBar
            receipt={receipt}
            go={(path) => router.push(path)}
            close={() => setReceipt(null)}
          />
        )}
        {error && (
          <div className="notice danger">Son eşitleme başarısız: {error}</div>
        )}
        {initialView === "dashboard" && (
          <Overview
            snapshot={snapshot}
            navigate={navigate}
            create={() => setDialog("ticket")}
          />
        )}
        {initialView === "inbox" && (
          <TicketWorkspace
            title="Ortak iş kutusu"
            text="Yetkili olduğunuz birimlerdeki gerçek görevler; kabul, aktarım ve sonuç aynı kayıt zincirindedir."
            snapshot={snapshot}
            query={query}
            setQuery={setQuery}
            open={(reference) => navigate("inbox", reference)}
          />
        )}
        {initialView === "flow" && (
          <FlowWorkspace
            snapshot={snapshot}
            openTicket={(reference) => navigate("requests", reference)}
            openCall={(reference) => navigate("calls", reference)}
          />
        )}
        {initialView === "requests" && (
          <TicketWorkspace
            title="Hasta talepleri"
            text="Her talebin hedef birimi, görev sahibi, SLA'sı ve kalıcı işlem geçmişi görünür."
            snapshot={snapshot}
            query={query}
            setQuery={setQuery}
            open={(reference) => navigate("requests", reference)}
            create={() => setDialog("ticket")}
          />
        )}
        {initialView === "appointments" && (
          <AppointmentWorkspace
            snapshot={snapshot}
            open={(reference) => navigate("appointments", reference)}
            create={() => setDialog("appointment")}
          />
        )}
        {initialView === "calls" && (
          <CallsWorkspace
            snapshot={snapshot}
            selected={selectedCall}
            open={(reference) => navigate("calls", reference)}
            create={() => setDialog("call")}
            sendMessage={sendCallMessage}
            busy={busy}
          />
        )}
        {initialView === "approvals" && (
          <ApprovalWorkspace
            snapshot={snapshot}
            decide={decideApproval}
            openTicket={(reference) => navigate("requests", reference)}
            openCall={(reference) => navigate("calls", reference)}
            busy={busy}
          />
        )}
        {initialView === "automation" && (
          <AutomationWorkspace
            snapshot={snapshot}
            security={security}
            openRecord={(reference) =>
              navigate(reference.startsWith("CAG-") || reference.startsWith("TRN-") ? "calls" : "requests", reference)
            }
          />
        )}
        {initialView === "capacity" && (
          <CapacityWorkspace
            snapshot={snapshot}
            openUnit={(code) => navigate("units", code)}
            openTicket={(reference) => navigate("requests", reference)}
          />
        )}
        {initialView === "integrations" && (
          <IntegrationWorkspace
            snapshot={snapshot}
            openAutomation={() => navigate("automation")}
            openCapacity={() => navigate("capacity")}
            openCalls={() => navigate("calls")}
            openAppointments={() => navigate("appointments")}
          />
        )}
        {initialView === "units" &&
          (selectedUnit ? (
            <UnitWorkspace
              snapshot={snapshot}
              unit={selectedUnit}
              openTicket={(reference) => navigate("requests", reference)}
              openCall={(reference) => navigate("calls", reference)}
              back={() => navigate("units")}
            />
          ) : (
            <UnitsWorkspace
              snapshot={snapshot}
              open={(code) => navigate("units", code)}
            />
          ))}
        {initialView === "staff" && <StaffWorkspace snapshot={snapshot} />}
        {initialView === "reports" && <ReportsWorkspace snapshot={snapshot} />}
        {initialView === "privacy" && <PrivacyWorkspace security={security} />}
        {initialView === "security" && (
          <SecurityWorkspace
            status={security}
            workspaceEvents={snapshot.security}
            refresh={() => void refreshSecurity()}
          />
        )}
        {initialView === "audit" && <AuditWorkspace audit={snapshot.audit} />}
      </section>
      <nav className="mobile-bottom">
        <button
          className={initialView === "dashboard" ? "active" : ""}
          onClick={() => navigate("dashboard")}
        >
          <span>▦</span>Merkez
        </button>
        <button
          className={initialView === "inbox" ? "active" : ""}
          onClick={() => navigate("inbox")}
        >
          <span>◎</span>İş Kutusu
        </button>
        <button
          className="mobile-create"
          aria-label="Yeni talep"
          onClick={() => setDialog("ticket")}
        >
          <span>＋</span>
        </button>
        <button
          className={initialView === "calls" ? "active" : ""}
          onClick={() => navigate("calls")}
        >
          <span>☎</span>Çağrı
        </button>
        <button
          className={initialView === "automation" ? "active" : ""}
          onClick={() => navigate("automation")}
        >
          <span>⌘</span>Canlı
        </button>
      </nav>
      {selectedTicket && (
        <TicketDrawer
          snapshot={snapshot}
          ticket={selectedTicket}
          close={() => navigate(initialView)}
          busy={busy}
          act={ticketAction}
        />
      )}
      {dialog && (
        <CreateDialog
          kind={dialog}
          units={snapshot.units}
          busy={busy === "create"}
          close={() => setDialog(null)}
          submit={submitDialog}
        />
      )}
    </main>
  );
}

function Hero({
  title,
  text,
  button,
  onClick,
}: {
  title: string;
  text: string;
  button?: string;
  onClick?: () => void;
}) {
  return (
    <div className="hero-row">
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
      {button && (
        <button className="primary" onClick={onClick}>
          {button}
        </button>
      )}
    </div>
  );
}
function Stat({
  value,
  label,
  sub,
}: {
  value: string | number;
  label: string;
  sub?: string;
}) {
  return (
    <article className="stat">
      <span className="stat-icon blue">◉</span>
      <div>
        <strong>{value}</strong>
        <p>{label}</p>
        <small>{sub || "Kalıcı sunucu kaydı"}</small>
      </div>
    </article>
  );
}
function ReceiptBar({
  receipt,
  go,
  close,
}: {
  receipt: Receipt;
  go: (path: string) => void;
  close: () => void;
}) {
  return (
    <div
      className={`receipt-bar ${receipt.title.includes("uygulanmadı") || receipt.title.includes("oluşturulmadı") ? "error" : ""}`}
    >
      <span>✓</span>
      <div>
        <b>{receipt.title}</b>
        <p>{receipt.detail}</p>
      </div>
      <button onClick={() => go(receipt.path)}>{receipt.actionLabel} →</button>
      <button
        className="receipt-close"
        aria-label="Bildirimi kapat"
        onClick={close}
      >
        ×
      </button>
    </div>
  );
}
function NotificationPanel({
  notices,
  open,
  close,
}: {
  notices: Array<{
    id: string;
    title: string;
    detail: string;
    time: string;
    path: string;
    urgent: boolean;
  }>;
  open: (path: string) => void;
  close: () => void;
}) {
  return (
    <div className="notification-pop">
      <div className="pop-head">
        <div>
          <b>İşlem bildirimleri</b>
          <small>Her bildirim doğrudan ilgili kayda gider</small>
        </div>
        <button onClick={close}>×</button>
      </div>
      {notices.length ? (
        notices.map((notice) => (
          <button
            key={notice.id}
            onClick={() => {
              close();
              open(notice.path);
            }}
          >
            <i className={notice.urgent ? "urgent" : "task"} />
            <span>
              <b>{notice.title}</b>
              <small>{notice.detail}</small>
            </span>
            <time>{notice.time}</time>
          </button>
        ))
      ) : (
        <div className="empty">Bekleyen bildirim yok.</div>
      )}
      <div className="pop-foot">
        Statik bildirim yoktur; görev ve onay kayıtlarından üretilir.
      </div>
    </div>
  );
}

function ControlRibbon({
  snapshot,
  navigate,
}: {
  snapshot: Snapshot;
  navigate: (view: View, reference?: string) => void;
}) {
  const control = snapshot.automation.controlTower;
  return (
    <section className="control-ribbon" aria-live="polite">
      <button onClick={() => navigate("automation")}>
        <span className="pulse" />
        <span>
          <small>7/24 KURAL MOTORU</small>
          <b>{control?.stepLabel || "Sunucu otomasyonu eşitleniyor"}</b>
        </span>
        <em>{control ? `${control.step + 1}/${control.totalSteps}` : "…"}</em>
      </button>
      <button onClick={() => navigate("capacity")}>
        <small>SEVK / TRANSFER</small>
        <b>{snapshot.capacitySummary.transfersOpen} açık</b>
        <span>{snapshot.capacitySummary.checking} kontrolde</span>
      </button>
      <button onClick={() => navigate("capacity")}>
        <small>UYGUN KAYNAK</small>
        <b>{snapshot.capacitySummary.available}</b>
        <span>{snapshot.capacitySummary.reserved} rezerve</span>
      </button>
      <button onClick={() => navigate("reports")}>
        <small>TABURCULUK</small>
        <b>{snapshot.capacitySummary.dischargeForecast} beklenen</b>
        <span>{snapshot.reports.filter((report) => report.status === "active").length} aktif rapor</span>
      </button>
      <button onClick={() => navigate("staff")}>
        <small>VARDİYA KAPSAMI</small>
        <b>{snapshot.shifts.filter((shift) => shift.status === "active").length} ekip</b>
        <span>{snapshot.shifts.filter((shift) => shift.status === "handoff").length} devir</span>
      </button>
    </section>
  );
}

function Overview({
  snapshot,
  navigate,
  create,
}: {
  snapshot: Snapshot;
  navigate: (view: View, reference?: string) => void;
  create: () => void;
}) {
  const openTasks = snapshot.tasks.filter(
    (task) => !["completed", "cancelled"].includes(task.status),
  );
  const activeCalls = snapshot.calls.filter(
    (call) =>
      ["ringing", "active", "human_handoff"].includes(call.status) &&
      !call.training,
  );
  const activePilotCalls = snapshot.calls.filter(
    (call) => ["ringing", "active", "human_handoff"].includes(call.status) && call.training,
  );
  return (
    <>
      <Hero
        title="Hastane ağı kendi kendine karar veren tek operasyon zincirinde"
        text="Sistemler arası talepler; kapasite, vardiya, rezervasyon, blokaj ve alternatif kampüs verisine göre otomatik kabul edilir, reddedilir veya yeniden yönlendirilir. Klinik karar üretilmez."
        button="＋ Yeni talep"
        onClick={create}
      />
      <section className="stats">
        <Stat value={openTasks.length} label="Açık operasyon işi" />
        <Stat value={snapshot.capacitySummary.transfersOpen} label="Açık sevk / transfer" />
        <Stat value={snapshot.capacitySummary.available} label="Uygun kaynak" sub={`${snapshot.capacitySummary.reserved} rezerve · ${snapshot.capacitySummary.blocked} bloke/temizlik`} />
        <Stat value={snapshot.capacitySummary.dischargeForecast} label="Beklenen taburculuk" sub="Canlı pilot kapasite matrisi" />
        <Stat value={snapshot.capacitySummary.autoAccepted} label="Otomatik kabul / alternatif" />
        <Stat value={snapshot.capacitySummary.autoRejected} label="Gerekçeli otomatik ret" />
        <Stat value={activeCalls.length + activePilotCalls.length} label="Aktif görüşme" sub={`${activeCalls.length} gerçek · ${activePilotCalls.length} pilot`} />
        <Stat value={snapshot.reports.filter((report) => report.status === "active").length} label="Zamanlanmış rapor" />
      </section>
      <div className="ops-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Öncelikli görevler</h3>
              <p>Hedef birim ve görev sahibi sunucudan gelir.</p>
            </div>
            <button className="text-button" onClick={() => navigate("inbox")}>
              Tümünü aç →
            </button>
          </div>
          <TaskList
            snapshot={snapshot}
            tasks={openTasks.slice(0, 7)}
            open={(task) =>
              navigate(
                task.ticketReference ? "requests" : "calls",
                task.ticketReference || task.callReference || undefined,
              )
            }
          />
        </section>
        <LiveFeed
          events={snapshot.events}
          openRecord={(reference) =>
            navigate(reference.startsWith("CAG-") || reference.startsWith("TRN-") ? "calls" : "requests", reference)
          }
        />
      </div>
      <section className="action-grid">
        {[
          ["Ortak İş Kutusu", "Otomatik sahiplik ve SLA", "inbox"],
          ["Uçtan Uca Akış", "Tüm vaka aşamaları", "flow"],
          ["Canlı Görüşmeler", "Santralden anlık ekleme", "calls"],
          ["İnsan Onayları", "Klinik ve hassas kararlar", "approvals"],
          ["Birim Masaları", "Kuyruk ve görünürlük", "units"],
          ["Otomasyon", "Worker, retry ve karantina", "automation"],
          ["Kapasite ve Transfer", "Yatak, devir ve lojistik", "capacity"],
          ["Personel ve Vardiya", "Kim nerede, hangi hastane ve devirde", "staff"],
          ["Canlı Raporlar", "Kapasite, sevk, taburculuk ve otomasyon", "reports"],
          ["Entegrasyon Sağlığı", "n8n, santral ve HBYS", "integrations"],
          ["Siber Güvenlik", "Savunma ve olay kaydı", "security"],
          ["Denetim İzleri", "Hash zincirli kayıt", "audit"],
        ].map(([title, text, view]) => (
          <button key={title} onClick={() => navigate(view as View)}>
            <b>{title}</b>
            <span>{text}</span>
            <em>→</em>
          </button>
        ))}
      </section>
    </>
  );
}

function TicketWorkspace({
  title,
  text,
  snapshot,
  query,
  setQuery,
  open,
  create,
}: {
  title: string;
  text: string;
  snapshot: Snapshot;
  query: string;
  setQuery: (value: string) => void;
  open: (reference: string) => void;
  create?: () => void;
}) {
  const tickets = snapshot.tickets.filter((ticket) =>
    `${ticket.reference} ${ticket.subject} ${ticket.unit} ${ticket.assignedRole} ${ticket.status}`
      .toLocaleLowerCase("tr-TR")
      .includes(query.toLocaleLowerCase("tr-TR")),
  );
  return (
    <>
      <Hero
        title={title}
        text={text}
        button={create ? "＋ Talep oluştur" : undefined}
        onClick={create}
      />
      <div className="toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Referans, konu, birim, görev sahibi veya durum ara…"
        />
        <span>{tickets.length} kayıt</span>
      </div>
      <TicketTable tickets={tickets} open={open} />
    </>
  );
}
function TicketTable({
  tickets,
  open,
}: {
  tickets: Ticket[];
  open: (reference: string) => void;
}) {
  return (
    <div className="panel data-panel">
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>TALEP</th>
              <th>HEDEF BİRİM / GÖREV</th>
              <th>ÖNCELİK / SLA</th>
              <th>DURUM</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {tickets.map((ticket) => (
              <tr key={ticket.reference}>
                <td>
                  <b>{ticket.subject}</b>
                  <small>
                    {ticket.reference} · {ticket.patientAlias} ·{" "}
                    {ticket.channel}
                  </small>
                </td>
                <td>
                  <b>{ticket.unit}</b>
                  <small>
                    {ticket.task?.reference || "Görev kaydı bekleniyor"} ·{" "}
                    {ticket.assignedRole}
                  </small>
                </td>
                <td>
                  <span
                    className={`badge ${ticket.priority.toLocaleLowerCase("tr-TR")}`}
                  >
                    {ticket.priority}
                  </span>
                  <small>
                    {ticket.slaDueAt
                      ? `Son süre ${formatTime(ticket.slaDueAt)}`
                      : "SLA tanımsız"}
                  </small>
                </td>
                <td>
                  <span
                    className={`state-pill ${ticket.task?.status || "queued"}`}
                  >
                    {ticket.status}
                  </span>
                  <small>{statusLabel(ticket.task?.status)}</small>
                </td>
                <td>
                  <button
                    className="row-open"
                    onClick={() => open(ticket.reference)}
                  >
                    Kaydı aç →
                  </button>
                </td>
              </tr>
            ))}
            {!tickets.length && (
              <tr>
                <td colSpan={5} className="empty">
                  Yetki kapsamınızda kayıt bulunmuyor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function TaskList({
  snapshot,
  tasks,
  open,
}: {
  snapshot: Snapshot;
  tasks: Task[];
  open: (task: Task) => void;
}) {
  return (
    <div className="compact-list">
      {tasks.map((task) => (
        <button key={task.reference} onClick={() => open(task)}>
          <span
            className={`priority-line ${task.priority.toLocaleLowerCase("tr-TR")}`}
          />
          <span>
            <b>
              {task.reference} · {task.assignedRole}
            </b>
            <small>
              {unitName(snapshot, task.unitCode)} ·{" "}
              {task.ticketReference || task.callReference}
            </small>
          </span>
          <strong>{statusLabel(task.status)}</strong>
          <em>→</em>
        </button>
      ))}
      {!tasks.length && <div className="empty">Açık görev yok.</div>}
    </div>
  );
}

function AppointmentWorkspace({
  snapshot,
  open,
  create,
}: {
  snapshot: Snapshot;
  open: (reference: string) => void;
  create: () => void;
}) {
  const tickets = snapshot.tickets.filter(
    (ticket) => ticket.unitCode === "RND" || ticket.previousUnitCode === "RND",
  );
  const confirmed = tickets.filter(
    (ticket) => ticket.status === "Çözüldü",
  ).length;
  return (
    <>
      <Hero
        title="Randevu talepleri"
        text="Bu ekran kesin HBYS takvimi göstermez; yalnız kalıcı randevu taleplerini, doğrulama görevini ve sonucunu gösterir."
        button="＋ Randevu talebi"
        onClick={create}
      />
      <section className="stats">
        <Stat value={tickets.length} label="Toplam talep" />
        <Stat
          value={tickets.filter((t) => t.task?.status === "queued").length}
          label="Kuyrukta"
        />
        <Stat
          value={
            tickets.filter(
              (t) =>
                t.task?.status === "accepted" ||
                t.task?.status === "in_progress",
            ).length
          }
          label="İşlemde"
        />
        <Stat value={confirmed} label="Sonuçlanan" />
      </section>
      <div className="legal-note">
        <b>HBYS bağlantı durumu</b>
        <p>
          Canlı slot ve doktor takvimi henüz kurumsal HBYS tarafından
          sağlanmıyor. Bu nedenle ekranda hayalî randevu saati veya doktor adı
          gösterilmez; doğrulanan entegrasyon geldiğinde aynı görev zincirine
          bağlanır.
        </p>
      </div>
      <TicketTable tickets={tickets} open={open} />
    </>
  );
}

function FlowWorkspace({
  snapshot,
  openTicket,
  openCall,
}: {
  snapshot: Snapshot;
  openTicket: (reference: string) => void;
  openCall: (reference: string) => void;
}) {
  const stages = [
    { key: "queued", title: "Kural kontrolü", text: "Kapasite, vardiya ve politika" },
    {
      key: "accepted",
      title: "Otomatik kabul",
      text: "Kaynak ayrıldı ve hedef oluştu",
    },
    { key: "in_progress", title: "Sistemler arası işlem", text: "Sevk, devir veya birim işi sürüyor" },
    { key: "completed", title: "Sonuçlandı", text: "Kapanış ve denetim izi" },
  ];
  const items = [
    ...snapshot.tickets.map((ticket) => ({
      id: ticket.reference,
      kind: ticket.channel === "Canlı Pilot" ? "Pilot talep" : "Talep",
      title: ticket.subject,
      unitCode: ticket.unitCode,
      owner: ticket.assignedRole,
      priority: ticket.priority,
      status: ticket.task?.status || "queued",
      updatedAt: ticket.updatedAt,
      open: () => openTicket(ticket.reference),
    })),
    ...snapshot.calls.map((call) => ({
      id: call.reference,
      kind: call.reference === snapshot.automation.pilot?.callReference ? "Canlı pilot görüşme" : call.training ? "Eğitim görüşmesi" : "Görüşme",
      title: call.patientAlias,
      unitCode: call.unitCode,
      owner: call.assignedRole,
      priority: call.requiresHuman ? "Acil" : "Normal",
      status:
        call.task?.status ||
        (call.status === "completed" ? "completed" : "queued"),
      updatedAt: call.lastMessageAt,
      open: () => openCall(call.reference),
    })),
  ];
  const overdue = snapshot.tasks.filter(
    (task) =>
      task.dueAt &&
      new Date(task.dueAt).getTime() < new Date(snapshot.generatedAt).getTime() &&
      !["completed", "cancelled"].includes(task.status),
  ).length;
  return (
    <>
      <Hero
        title="Uçtan uca hastane iş akışı"
        text="Kayıt hangi sistemden gelirse gelsin; kural kontrolü, otomatik kabul/ret, alternatif kampüs, işlem ve kapanış aynı panoda izlenir."
      />
      <section className="stats">
        <Stat value={items.length} label="Toplam aktif kayıt" />
        <Stat
          value={items.filter((item) => item.status === "queued").length}
          label="Kural kontrolünde"
        />
        <Stat value={overdue} label="SLA riski" />
        <Stat
          value={
            snapshot.approvals.filter(
              (approval) => approval.status === "pending",
            ).length
          }
          label="İnsan onayı"
        />
      </section>
      <div className="flow-board">
        {stages.map((stage) => {
          const stageItems = items.filter((item) => item.status === stage.key);
          return (
            <section key={stage.key} className={`flow-column ${stage.key}`}>
              <header>
                <div>
                  <b>{stage.title}</b>
                  <small>{stage.text}</small>
                </div>
                <span>{stageItems.length}</span>
              </header>
              <div>
                {stageItems.map((item) => (
                  <button key={item.id} onClick={item.open}>
                    <span
                      className={`badge ${item.priority.toLocaleLowerCase("tr-TR")}`}
                    >
                      {item.priority}
                    </span>
                    <small>
                      {item.kind} · {item.id}
                    </small>
                    <b>{item.title}</b>
                    <p>
                      {unitName(snapshot, item.unitCode)} · {item.owner}
                    </p>
                    <time>{formatDateTime(item.updatedAt)}</time>
                  </button>
                ))}
                {!stageItems.length && (
                  <p className="flow-empty">Bu aşamada kayıt yok.</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="legal-note">
        <b>Eksiksiz görünürlük kuralı</b>
        <p>
          Kart açıldığında doğrudan kaynak talep veya görüşmeye gider. Kapasite
          kararı değiştiğinde kart hedef hastane ve birimle birlikte yeni aşamaya
          taşınır; kullanıcı kabul düğmesine basmaz ve tarayıcı içi kopya tutulmaz.
        </p>
      </div>
    </>
  );
}

function ApprovalWorkspace({
  snapshot,
  decide,
  openTicket,
  openCall,
  busy,
}: {
  snapshot: Snapshot;
  decide: (reference: string, decision: "approve" | "reject") => void;
  openTicket: (reference: string) => void;
  openCall: (reference: string) => void;
  busy: string;
}) {
  const pending = snapshot.approvals.filter(
    (approval) => approval.status === "pending",
  );
  // Sunucu da aynı kuralı uygular; burada yalnız yetkisiz rolde düğmeler gizlenir.
  const canDecide = ["operations_manager", "unit_manager", "clinician"].includes(
    snapshot.identity.role,
  );
  const decided = snapshot.approvals.filter(
    (approval) => approval.status !== "pending",
  );
  const openRelated = (approval: Approval) =>
    approval.ticketReference
      ? openTicket(approval.ticketReference)
      : approval.callReference && openCall(approval.callReference);
  return (
    <>
      <Hero
        title="İnsan onayı ve güvenli devir kapıları"
        text="Klinik, acil ve hassas işlemler otomasyon tarafından sonuçlandırılmaz; yetkili kişi kararı kalıcı kayda işler."
      />
      <section className="stats">
        <Stat value={pending.length} label="Karar bekliyor" />
        <Stat
          value={decided.filter((item) => item.status === "approved").length}
          label="Onaylandı"
        />
        <Stat
          value={decided.filter((item) => item.status === "rejected").length}
          label="Reddedildi"
        />
        <Stat
          value={snapshot.units.filter((unit) => unit.queue > 0).length}
          label="Aktif birim kuyruğu"
        />
      </section>
      <section className="panel approval-list">
        <div className="panel-head">
          <div>
            <h3>Bekleyen kararlar</h3>
            <p>
              Her karar ilgili görev, görüşme/talep ve denetim izini birlikte
              günceller.
            </p>
          </div>
        </div>
        {pending.map((approval) => (
          <article key={approval.reference}>
            <span className="approval-icon">!</span>
            <div>
              <small>
                {approval.reference} · {approval.approvalType}
              </small>
              <b>{unitName(snapshot, approval.unitCode)}</b>
              <p>
                {approval.ticketReference || approval.callReference} ·{" "}
                {formatDateTime(approval.createdAt)}
              </p>
            </div>
            <button className="secondary" onClick={() => openRelated(approval)}>
              Kaydı aç
            </button>
            {canDecide ? (
              <>
                <button
                  disabled={Boolean(busy)}
                  onClick={() => decide(approval.reference, "reject")}
                >
                  Reddet
                </button>
                <button
                  className="primary"
                  disabled={Boolean(busy)}
                  onClick={() => decide(approval.reference, "approve")}
                >
                  {busy === `${approval.reference}:approve`
                    ? "İşleniyor…"
                    : "Onayla"}
                </button>
              </>
            ) : (
              <small>Karar yetkisi: operasyon/birim yöneticisi veya klinik rol</small>
            )}
          </article>
        ))}
        {!pending.length && (
          <div className="empty">Bekleyen insan onayı yok.</div>
        )}
      </section>
      {decided.length > 0 && (
        <section className="panel approval-history">
          <div className="panel-head">
            <div>
              <h3>Son kararlar</h3>
              <p>Yetki kapsamındaki karar geçmişi</p>
            </div>
          </div>
          {decided.slice(0, 20).map((approval) => (
            <button
              key={approval.reference}
              onClick={() => openRelated(approval)}
            >
              <span className={`state-pill ${approval.status}`}>
                {approval.status === "approved" ? "Onaylandı" : "Reddedildi"}
              </span>
              <b>{approval.reference}</b>
              <small>
                {unitName(snapshot, approval.unitCode)} ·{" "}
                {approval.ticketReference || approval.callReference}
              </small>
              <em>→</em>
            </button>
          ))}
        </section>
      )}
    </>
  );
}

function CallsWorkspace({
  snapshot,
  selected,
  open,
  create,
  sendMessage,
  busy,
}: {
  snapshot: Snapshot;
  selected?: Call;
  open: (reference: string) => void;
  create: () => void;
  sendMessage: (
    reference: string,
    speakerType: "caller" | "agent" | "clinician",
    message: string,
  ) => Promise<void>;
  busy: string;
}) {
  const activePilotReference = snapshot.automation.pilot?.callReference;
  const [speaker, setSpeaker] = useState<"caller" | "agent" | "clinician">(
    "agent",
  );
  const [draft, setDraft] = useState("");
  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || draft.trim().length < 2) return;
    await sendMessage(selected.reference, speaker, draft.trim());
    setDraft("");
  }
  return (
    <>
      <Hero
        title="Canlı çağrı ve konuşma çalışma masası"
        text="Gerçek santral olayları bağlandığında otomatik açılır; bu prototipte kimliksiz pilot görüşme de sunucuda adım adım ilerler ve yeni cümleler anında ekrana düşer."
        button="☎ Gelen çağrı kaydı"
        onClick={create}
      />
      <div className="integration-strip">
        <span className="pulse" />
        <div>
          <b>Canlı pilot görüşme akıyor · gerçek çağrı alıcısı hazır</b>
          <p>
            Pilot konuşma yaklaşık yedi saniyede bir sunucuda ilerler. HMAC imzalı kurum santrali henüz bağlı değildir; iki kaynak ekranda kesin biçimde ayrılır.
          </p>
        </div>
      </div>
      <div className="call-layout">
        <section className="panel call-list">
          <div className="panel-head">
            <div>
              <h3>Görüşme oturumları</h3>
              <p>Kalıcı sunucu kaydı · otomatik yenilenir</p>
            </div>
            <div className="call-live-counts">
              <span className="live"><i /> {snapshot.calls.filter((call) => ["ringing", "active", "human_handoff"].includes(call.status) && !call.training).length} GERÇEK</span>
              <span className="live pilot"><i /> {snapshot.calls.filter((call) => ["ringing", "active", "human_handoff"].includes(call.status) && call.training).length} PİLOT</span>
            </div>
          </div>
          {snapshot.calls.map((call) => (
            <button
              key={call.reference}
              className={selected?.reference === call.reference ? "active" : ""}
              onClick={() => open(call.reference)}
            >
              <span className="call-avatar">☎</span>
              <span>
                <b>{call.patientAlias}</b>
                <small>
                  {call.reference} · {unitName(snapshot, call.unitCode)} ·{" "}
                  {formatTime(call.lastMessageAt)}
                </small>
              </span>
              <em>{call.reference === activePilotReference ? "PİLOT CANLI" : call.training ? "EĞİTİM" : callStatus(call.status)}</em>
            </button>
          ))}
          {!snapshot.calls.length && (
            <div className="empty">Henüz görüşme oturumu yok.</div>
          )}
        </section>
        {selected ? (
          <section className="panel transcript">
            <div className="panel-head">
              <div>
                <h3>
                  {selected.reference} · {selected.patientAlias}
                </h3>
                <p>
                  {selected.source} · {unitName(snapshot, selected.unitCode)} ·{" "}
                  {selected.assignedRole}
                </p>
              </div>
              <span className={`state-pill ${selected.status}`}>
                {selected.training
                  ? "EĞİTİM VERİSİ"
                  : callStatus(selected.status)}
              </span>
            </div>
            {selected.training && (
              <div className="training-banner">
                <b>{selected.reference === activePilotReference ? "Kimliksiz canlı pilot senaryo" : "Kimliksiz eğitim kaydı"}</b>
                <span>Sunucuya kalıcı kaydedilir; gerçek hasta veya gerçek santral çağrısı değildir.</span>
              </div>
            )}
            <div className="summary-box">
              <b>Yapılandırılmış görüşme özeti</b>
              <p>
                {selected.summary ||
                  "Görüşme sürüyor; görevli doğrulaması sonrası özet oluşacak."}
              </p>
              <small>
                AI özeti klinik karar değildir; insan doğrulaması olmadan sonuç
                kaydına dönüşmez.
              </small>
            </div>
            <div className="call-ownership">
              <span>
                <small>GÖREV</small>
                <b>{selected.task?.reference || "Görev hazırlanıyor"}</b>
              </span>
              <span>
                <small>SİSTEM ATAMASI</small>
                <b>
                  {selected.task?.acceptedBy
                    ? selected.task.acceptedBy
                    : "Kural motoru değerlendiriyor"}
                </b>
              </span>
              <span>
                <small>DURUM</small>
                <b>{statusLabel(selected.task?.status)}</b>
              </span>
              <div className="auto-owner-chip"><i /> OTOMATİK</div>
            </div>
            <div className="messages" aria-live="polite">
              {selected.messages.map((message) => (
                <div
                  key={message.id}
                  className={`message ${message.speakerType}`}
                >
                  <div className="message-meta">
                    <b>{message.speakerLabel}</b>
                    <time>{formatTime(message.createdAt)}</time>
                  </div>
                  <p>{message.message}</p>
                  {message.redacted && <small>Hassas alanlar maskelendi</small>}
                </div>
              ))}
            </div>
            {!selected.training && selected.status !== "completed" && (
              <form className="message-composer" onSubmit={submitMessage}>
                <div>
                  <label htmlFor="speaker-type">Konuşan</label>
                  <select
                    id="speaker-type"
                    value={speaker}
                    onChange={(event) =>
                      setSpeaker(
                        event.target.value as "caller" | "agent" | "clinician",
                      )
                    }
                  >
                    <option value="agent">Çağrı görevlisi</option>
                    <option value="caller">Arayanın ifadesi</option>
                    <option value="clinician">Klinik personel</option>
                  </select>
                </div>
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  minLength={2}
                  maxLength={2000}
                  required
                  placeholder="Görüşmede söylenen yeni cümleyi yazın; kaydedildiği anda tüm yetkili birim ekranlarında görünür…"
                />
                <button className="primary" disabled={Boolean(busy)}>
                  {busy === `${selected.reference}:message`
                    ? "Ekleniyor…"
                    : "Konuşmaya ekle"}
                </button>
              </form>
            )}
            <div className="call-route">
              <span className="auto-route-icon">⇢</span>
              <div>
                <small>OTOMATİK HEDEF VE DURUM</small>
                <b>{unitName(snapshot, selected.unitCode)} · {selected.assignedRole}</b>
                <p>Kapasite ve iş kuralı sonucu sunucuda değiştiğinde bu görüşme kullanıcı aktarımı olmadan hedef çalışma masasına taşınır.</p>
              </div>
              <span className={`state-pill ${selected.task?.status || "queued"}`}>{statusLabel(selected.task?.status)}</span>
            </div>
          </section>
        ) : (
          <section className="panel empty-state">
            <b>Bir görüşme seçin</b>
            <p>
              Konuşma, görev, yönlendirme ve insan devri aynı ekranda açılır.
            </p>
          </section>
        )}
      </div>
    </>
  );
}

function AutomationWorkspace({
  snapshot,
  security,
  openRecord,
}: {
  snapshot: Snapshot;
  security: SecurityStatus | null;
  openRecord: (reference: string) => void;
}) {
  const pilot = snapshot.automation.pilot;
  const control = snapshot.automation.controlTower;
  const agentRunning = snapshot.automation.agent.state === "running" && snapshot.automation.agent.lastCycleStatus !== "failed";
  const agentDegraded = snapshot.automation.agent.state === "degraded";
  const rules = [
    "Sistem talebi → kapasite + vardiya + blokaj kontrolü",
    "Kaynak uygunsa → otomatik ön kabul + rezervasyon",
    "Kaynak yoksa → gerekçeli ret + alternatif kampüs taraması",
    "Alternatif uygunsa → otomatik yeniden yönlendirme",
    "Kabul → transport + hedef birim + devir takibi",
    "Acil sinyal → normal akışı durdur → insan devri",
    "Santral olayı → HMAC + replay kontrolü",
    "Başarısız iş → jitter retry → dead-letter",
    "Her yazma → hash zincirli audit",
    "Yetki dışı istek → engelle → güvenlik olayı",
  ];
  return (
    <>
      <Hero
        title="Canlı otomasyon komuta merkezi"
        text="Kapasite, sevk, taburculuk, vardiya ve görüşme motorları kullanıcı düğmesine ihtiyaç duymadan sürekli ilerler. Her kararın girdisi, hedefi, sonucu ve gerekçesi görünür."
      />
      {control && (
        <section className="control-live-card" aria-live="polite">
          <div className="pilot-live-head">
            <span className="live"><i /> SİSTEMLER ARASI CANLI</span>
            <small>{control.disclosure} · {control.engine}</small>
          </div>
          <div className="pilot-live-main">
            <div>
              <small>ŞU ANKİ OTOMATİK KARAR DÖNGÜSÜ</small>
              <h3>{control.sourceFacilityCode} → {facilityName(snapshot, control.targetFacilityCode)} · {unitName(snapshot, control.unitCode)}</h3>
              <p>{control.stepLabel}</p>
            </div>
            <button className="primary" onClick={() => openRecord(control.ticketReference)}>Karar kaydını aç →</button>
          </div>
          <div className="pilot-progress" aria-label={`Kapasite akış adımı ${control.step + 1}/${control.totalSteps}`}>
            <progress max={control.totalSteps} value={control.step + 1} aria-label={`Kapasite ilerlemesi ${control.step + 1}/${control.totalSteps}`} />
          </div>
          <div className="pilot-live-meta">
            <span><b>{control.transferReference}</b><small>sevk kaydı</small></span>
            <span><b>{snapshot.capacitySummary.available}</b><small>uygun kaynak</small></span>
            <span><b>{snapshot.capacitySummary.autoAccepted}/{snapshot.capacitySummary.autoRejected}</b><small>kabul / ret</small></span>
            <span><b>{formatTime(control.nextStepAt)}</b><small>sonraki adım</small></span>
          </div>
        </section>
      )}
      {pilot && (
        <section className="pilot-live-card" aria-live="polite">
          <div className="pilot-live-head">
            <span className="live"><i /> PİLOT CANLI</span>
            <small>{pilot.disclosure} · {pilot.engine}</small>
          </div>
          <div className="pilot-live-main">
            <div>
              <small>ŞU AN ÇALIŞAN SENARYO</small>
              <h3>{pilot.scenarioTitle}</h3>
              <p>{pilot.stepLabel}</p>
            </div>
            <button className="primary" onClick={() => openRecord(pilot.callReference)}>
              Canlı görüşmeyi aç →
            </button>
          </div>
          <div className="pilot-progress" aria-label={`Pilot akış adımı ${pilot.step + 1}/${pilot.totalSteps}`}>
            <progress max={pilot.totalSteps} value={pilot.step + 1} aria-label={`Pilot ilerlemesi ${pilot.step + 1}/${pilot.totalSteps}`} />
          </div>
          <div className="pilot-live-meta">
            <span><b>{pilot.runReference}</b><small>çalıştırma</small></span>
            <span><b>{unitName(snapshot, pilot.unitCode)}</b><small>hedef birim</small></span>
            <span><b>{pilot.step + 1}/{pilot.totalSteps}</b><small>canlı adım</small></span>
            <span><b>{formatTime(pilot.nextStepAt)}</b><small>sonraki olay</small></span>
          </div>
        </section>
      )}
      <div className="engine-status">
        <div className="engine-main">
          <span className={agentRunning ? "pulse" : "pulse waiting"} />
          <div>
            <b>{agentRunning ? "Otomasyon ajanı çalışıyor" : agentDegraded ? "Otomasyon ajanının son turu başarısız" : "Otomasyon ajanı zamanlayıcı bağlantısı bekliyor"}</b>
            <small>
              {snapshot.automation.agent.lastRunAt
                ? `Son ajan turu ${formatTime(snapshot.automation.agent.lastRunAt)} · ${snapshot.automation.agent.lastCycleStatus || "durum bekleniyor"} · son başarılı ${formatTime(snapshot.automation.agent.lastSuccessfulRunAt)}`
                : "Henüz doğrulanmış ajan çalıştırması yok"}
            </small>
          </div>
          <span className={`continuous-badge ${agentRunning ? "" : "waiting"}`}><i /> {agentRunning ? "KULLANICI TETİĞİ YOK · AKTİF" : "n8n / ZAMANLAYICI BAĞLANTISI BEKLİYOR"}</span>
        </div>
        <Stat value={snapshot.jobs.queued} label="Kuyrukta" />
        <Stat value={snapshot.jobs.completed} label="Tamamlanan" />
        <Stat value={snapshot.jobs.deadLetter} label="Karantina" />
      </div>
      <div className="automation-layout">
        <section className="panel rule-cards">
          <div className="panel-head">
            <div>
              <h3>Kodda etkin iş kuralları</h3>
              <p>Her kartın arkasında kalıcı kayıt ve API işlemi vardır.</p>
            </div>
          </div>
          {rules.map((rule, index) => (
            <div key={rule}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{rule}</b>
                <small>Sunucu kontrolü · denetim izi zorunlu</small>
              </div>
              <i>ETKİN</i>
            </div>
          ))}
        </section>
        <LiveFeed events={snapshot.events} openRecord={openRecord} />
      </div>
      <section className="panel connector-panel">
        <div className="panel-head">
          <div>
            <h3>Otomasyon ve entegrasyon motorları</h3>
            <p>Bağlı, hazır ve yapılandırılmamış durumlar birbirinden ayrılır.</p>
          </div>
          <a className="secondary button-link" href="/integrations/klinorbis-n8n-workflows.json" download>
            n8n akış paketini indir
          </a>
        </div>
        <div className="connector-grid">
          {snapshot.automation.connectors.map((connector) => (
            <article key={connector.id}>
              <span className={`connector-state ${connector.state}`}>{connector.truthLabel}</span>
              <small>{connector.provider}</small>
              <b>{connector.name}</b>
              <p>{connector.detail}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="legal-note">
        <b>Gerçek bağlantı sınırı</b>
        <p>
          {security?.controls.signedWebhooks
            ? "İmzalı webhook güvenliği etkin; kurum santrali henüz olay göndermiyor."
            : "Webhook anahtarı yapılandırma kontrolü bekliyor."}{" "}
          Kimliksiz pilot görüşmeler canlılık ve uçtan uca davranışı göstermek için sunucuya gerçekten kaydedilir; gerçek santral veya n8n bağlantısı olarak sunulmaz.
        </p>
      </div>
    </>
  );
}
function LiveFeed({ events, openRecord }: { events: Event[]; openRecord: (reference: string) => void }) {
  return (
    <section className="panel live-panel">
      <div className="panel-head">
        <div>
          <h3>Sunucu olay akışı</h3>
          <p>D1 automation_events · pilot olaylar açıkça etiketlidir</p>
        </div>
        <span className="live">
          <i /> CANLI
        </span>
      </div>
      <div className="timeline">
        {events.slice(0, 15).map((event) => {
          const canOpen = /^(CAG|TRN|TLP|PLT|S2S)-/.test(event.ticketReference);
          return (
          <button className="event" key={event.id} disabled={!canOpen} onClick={() => canOpen && openRecord(event.ticketReference)}>
            <span className={`event-icon ${event.eventType === "pilot" ? "amber" : "green"}`}>
              {event.eventType === "pilot" ? "P" : "✓"}
            </span>
            <div>
              <b>{event.rule} {event.eventType === "pilot" && <em>PİLOT</em>}</b>
              <p>
                {event.ticketReference} · {event.outcome}
              </p>
              <small>
                {formatTime(event.createdAt)} · {event.unitCode || "Sistem"}
              </small>
            </div>
            <span className="event-open">→</span>
          </button>
          );
        })}
        {!events.length && <div className="empty">Henüz sunucu olayı yok.</div>}
      </div>
    </section>
  );
}

function CapacityWorkspace({
  snapshot,
  openUnit,
  openTicket,
}: {
  snapshot: Snapshot;
  openUnit: (code: string) => void;
  openTicket: (reference: string) => void;
}) {
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const capacity = facilityFilter === "ALL" ? snapshot.capacity : snapshot.capacity.filter((row) => row.facilityCode === facilityFilter);
  const transfers = (facilityFilter === "ALL"
    ? snapshot.transfers
    : snapshot.transfers.filter((row) => row.targetFacilityCode === facilityFilter)
  ).slice(0, 30);
  const visibleTotal = capacity.reduce((sum, row) => sum + row.total, 0);
  const visibleOccupied = capacity.reduce((sum, row) => sum + row.occupied, 0);
  const visibleAvailable = capacity.reduce((sum, row) => sum + row.available, 0);
  const visibleDischarge = capacity.reduce((sum, row) => sum + row.dischargeForecast, 0);
  const openTransfer = (transfer: Transfer) => {
    if (transfer.ticketReference) openTicket(transfer.ticketReference);
    else openUnit(transfer.requestedUnitCode);
  };
  return (
    <>
      <Hero
        title="Hastane ağı kapasite ve otomatik sevk komuta merkezi"
        text="Her hastanenin personelli kapasitesi, dolu/rezerve/bloke kaynakları, taburculuk tahmini ve sistemler arası kabul kararı aynı canlı matriste görünür."
      />
      <section className="stats">
        <Stat value={visibleAvailable} label="Güvenli kullanılabilir kaynak" />
        <Stat value={visibleOccupied} label="Dolu / kullanımda" sub={`${visibleTotal} toplam tanımlı kaynak`} />
        <Stat value={visibleDischarge} label="Beklenen taburculuk" />
        <Stat value={transfers.filter((row) => !["completed", "auto_rejected"].includes(row.status)).length} label="Açık sevk / transfer" />
        <Stat value={transfers.filter((row) => ["auto_accepted", "auto_rerouted", "scheduled", "transport_assigned", "in_transit", "completed"].includes(row.status)).length} label="Otomatik kabul / alternatif" />
        <Stat value={transfers.filter((row) => row.status === "auto_rejected").length} label="Gerekçeli otomatik ret" />
        <Stat value={transfers.filter((row) => ["received", "checking"].includes(row.status)).length} label="Kural kontrolünde" />
        <Stat value={snapshot.shifts.filter((shift) => shift.status === "active" && (facilityFilter === "ALL" || shift.facilityCode === facilityFilter)).length} label="Aktif vardiya ekibi" />
      </section>
      <section className="facility-network" aria-label="Hastane filtresi">
        <button className={facilityFilter === "ALL" ? "active" : ""} onClick={() => setFacilityFilter("ALL")}>
          <small>AĞ KAPSAMI</small><b>Tüm hastaneler</b><span>{snapshot.facilities.length} kampüs · {snapshot.capacity.length} kaynak satırı</span>
        </button>
        {snapshot.facilities.map((facility) => {
          const rows = snapshot.capacity.filter((row) => row.facilityCode === facility.code);
          const available = rows.reduce((sum, row) => sum + row.available, 0);
          const discharge = rows.reduce((sum, row) => sum + row.dischargeForecast, 0);
          return (
            <button key={facility.code} className={facilityFilter === facility.code ? "active" : ""} onClick={() => setFacilityFilter(facility.code)}>
              <small>{facility.code} · {facility.city}</small><b>{facility.name}</b><span>{available} uygun · {discharge} taburculuk tahmini</span>
            </button>
          );
        })}
      </section>
      <div className="capacity-command-grid">
        <section className="panel capacity-matrix">
          <div className="panel-head"><div><h3>Canlı kaynak matrisi</h3><p>Bir satıra dokununca ilgili birimin çalışma masası açılır.</p></div><span className="live"><i /> 2,5 SN</span></div>
          <div className="capacity-head"><span>HASTANE / BİRİM</span><span>KAYNAK</span><span>DOLU</span><span>REZ.</span><span>BLOKE</span><span>UYGUN</span><span>TAHMİN</span><span>DURUM</span></div>
          {capacity.map((row) => (
            <button key={`${row.facilityCode}-${row.unitCode}-${row.resourceCode}`} onClick={() => openUnit(row.unitCode)}>
              <span><b>{row.facilityCode} · {row.unitCode}</b><small>{facilityName(snapshot, row.facilityCode)}</small></span>
              <span><b>{row.resourceLabel}</b><small>{row.staffed}/{row.total} personelli</small></span>
              <strong>{row.occupied}</strong><strong>{row.reserved}</strong><strong>{row.blocked + row.cleaning}</strong><strong className={row.available === 0 ? "danger-value" : "success-value"}>{row.available}</strong><strong>{row.dischargeForecast}</strong>
              <em className={`capacity-state ${capacityStatus(row)}`}>{capacityStatusLabel(row)}</em>
            </button>
          ))}
          {!capacity.length && <div className="empty">Yetki kapsamınızda kapasite kaydı yok.</div>}
        </section>
        <section className="panel transfer-decisions">
          <div className="panel-head"><div><h3>Otomatik kabul / ret / alternatif kararları</h3><p>Her kararın gerekçesi ve hedef hastanesi görünür.</p></div><span>{transfers.length}</span></div>
          {transfers.map((transfer) => (
            <button key={transfer.reference} onClick={() => openTransfer(transfer)}>
              <span className={`decision-mark ${transfer.status}`}>{transferStatusIcon(transfer.status)}</span>
              <span><small>{transfer.reference} · {transfer.sourceFacilityCode} → {transfer.targetFacilityCode}</small><b>{transfer.resourceLabel} · {unitName(snapshot, transfer.requestedUnitCode)}</b><p>{transfer.decisionDetail || "Kapasite, vardiya ve blokaj kontrolü sürüyor."}</p></span>
              <span><em className={`state-pill ${transfer.status}`}>{transferStatus(transfer.status)}</em><time>{formatTime(transfer.updatedAt)}</time></span>
            </button>
          ))}
          {!transfers.length && <div className="empty">Yetki kapsamınızda sevk kaydı yok.</div>}
        </section>
      </div>
      <div className="legal-note">
        <b>Veri gerçeği ve klinik sınır</b>
        <p>Bu sayılar kimliksiz pilot kapasite verisidir; gerçek HBYS/RTLS bağlantısı değildir. Motor yalnız operasyonel kaynak ön kabulü, ret ve alternatif kampüs kararı verir. Teşhis, tedavi veya klinik uygunluk kararı üretmez.</p>
      </div>
    </>
  );
}

function IntegrationWorkspace({
  snapshot,
  openAutomation,
  openCapacity,
  openCalls,
  openAppointments,
}: {
  snapshot: Snapshot;
  openAutomation: () => void;
  openCapacity: () => void;
  openCalls: () => void;
  openAppointments: () => void;
}) {
  return (
    <>
      <Hero
        title="Entegrasyon sağlığı ve bağlantı gerçeği"
        text="Her dış sistem için gerçekten bağlı, yalnız adaptörü hazır veya henüz yapılandırılmamış durumu ayrı gösterilir."
      />
      <section className="stats">
        <Stat value={snapshot.automation.connectors.filter((item) => item.state === "active" || item.state === "connected").length} label="Canlı bağlantı" />
        <Stat value={snapshot.automation.connectors.filter((item) => item.state === "adapter_ready").length} label="Adaptörü hazır" />
        <Stat value={snapshot.automation.connectors.filter((item) => item.state === "not_configured").length} label="Bağlantı bekliyor" />
        <Stat value={snapshot.jobs.deadLetter} label="Hata karantinası" />
      </section>
      <div className="integration-grid">
        {snapshot.automation.connectors.map((connector) => (
          <article className="panel" key={connector.id}>
            <div className="integration-card-head">
              <span className={`connector-state ${connector.state}`}>{connector.truthLabel}</span>
              <small>{connector.provider}</small>
            </div>
            <h3>{connector.name}</h3>
            <p>{connector.detail}</p>
            {connector.id === "klinorbis-worker" && <button onClick={openAutomation}>Canlı çalıştırmaları aç →</button>}
            {connector.id === "capacity-orchestrator" && <button onClick={openCapacity}>Kapasite kararlarını aç →</button>}
            {connector.id === "n8n-self-hosted" && (
              <a className="button-link" href="/integrations/klinorbis-n8n-workflows.json" download>n8n akış sözleşmesini indir →</a>
            )}
            {connector.id === "hospital-pbx" && <button onClick={openCalls}>Çağrı alıcı ekranını aç →</button>}
            {connector.id === "hbys" && <button onClick={openAppointments}>Randevu doğrulama ekranını aç →</button>}
          </article>
        ))}
      </div>
      <section className="panel integration-contract">
        <div className="panel-head"><div><h3>n8n güvenli bağlantı sözleşmesi</h3><p>Ana iş kuralları KLINORBIS’te kalır; n8n yalnız orkestrasyon ve kurum adaptörüdür.</p></div></div>
        <ol>
          <li><b>Olay:</b><span>KLINORBIS yalnız kimliksiz olay metadatasını self-hosted n8n’e gönderir.</span></li>
          <li><b>İmza:</b><span>Her callback HMAC-SHA256, olay kimliği ve beş dakikalık replay penceresiyle doğrulanır.</span></li>
          <li><b>İdempotency:</b><span>Aynı olay kimliği ikinci kez işlem üretmez.</span></li>
          <li><b>İnsan kapısı:</b><span>Klinik, acil, veri aktarımı ve hak doğuran işlem insan kararı olmadan tamamlanmaz.</span></li>
          <li><b>Hata:</b><span>Retry bittiğinde iş karantinaya alınır; başarılı gibi gösterilmez.</span></li>
        </ol>
      </section>
    </>
  );
}

function UnitsWorkspace({
  snapshot,
  open,
}: {
  snapshot: Snapshot;
  open: (code: string) => void;
}) {
  return (
    <>
      <Hero
        title="Birim çalışma masaları"
        text={`${snapshot.units.length} yetkili birim; sayaçlar statik değil, açık görevlerden hesaplanır.`}
      />
      <div className="unit-grid">
        {snapshot.units.map((unit) => (
          <article key={unit.code}>
            <div className="unit-top">
              <span className={`unit-code ${unit.kind}`}>{unit.code}</span>
              <i>{unit.queue} açık görev</i>
            </div>
            <h3>{unit.name}</h3>
            <p>{unit.scope}</p>
            <div className="unit-metrics">
              <span>
                <b>{unit.queue}</b>
                <small>gerçek kuyruk</small>
              </span>
              <span>
                <b>{unit.slaMinutes} dk</b>
                <small>SLA hedefi</small>
              </span>
              <span>
                <b>
                  {snapshot.capacity.filter((row) => row.unitCode === unit.code).reduce((sum, row) => sum + row.available, 0)}
                </b>
                <small>uygun kaynak</small>
              </span>
              <span>
                <b>{snapshot.shifts.filter((shift) => shift.unitCode === unit.code && shift.status === "active").length}</b>
                <small>aktif vardiya</small>
              </span>
            </div>
            <div className="visibility">
              <b>Hedef görev sahibi</b>
              <small>{unit.assignedRole}</small>
            </div>
            <button onClick={() => open(unit.code)}>Birim akışını aç →</button>
          </article>
        ))}
      </div>
    </>
  );
}
function UnitWorkspace({
  snapshot,
  unit,
  openTicket,
  openCall,
  back,
}: {
  snapshot: Snapshot;
  unit: Unit;
  openTicket: (reference: string) => void;
  openCall: (reference: string) => void;
  back: () => void;
}) {
  const tasks = snapshot.tasks.filter((task) => task.unitCode === unit.code);
  const tickets = snapshot.tickets.filter(
    (ticket) => ticket.unitCode === unit.code,
  );
  const calls = snapshot.calls.filter((call) => call.unitCode === unit.code);
  const approvalsForUnit = snapshot.approvals.filter(
    (approval) =>
      approval.unitCode === unit.code && approval.status === "pending",
  );
  const events = snapshot.events.filter(
    (event) => event.unitCode === unit.code,
  );
  const members = snapshot.staff.filter(
    (staff) =>
      snapshot.identity.canSeeAllUnits ||
      staff.memberships.some((membership) => membership.unitCode === unit.code),
  );
  const capacityForUnit = snapshot.capacity.filter((row) => row.unitCode === unit.code);
  const shiftsForUnit = snapshot.shifts.filter((shift) => shift.unitCode === unit.code);
  const transfersForUnit = snapshot.transfers.filter((transfer) => transfer.requestedUnitCode === unit.code);
  return (
    <>
      <div className="hero-row">
        <div>
          <button className="back-link" onClick={back}>
            ← Tüm birimler
          </button>
          <h2>
            {unit.code} · {unit.name} çalışma masası
          </h2>
          <p>{unit.scope}</p>
        </div>
        <span className="unit-access-badge">Sunucu yetkisi doğrulandı</span>
      </div>
      <section className="stats">
        <Stat
          value={
            tasks.filter(
              (task) => !["completed", "cancelled"].includes(task.status),
            ).length
          }
          label="Açık görev"
        />
        <Stat value={capacityForUnit.reduce((sum, row) => sum + row.available, 0)} label="Uygun kaynak" />
        <Stat value={shiftsForUnit.filter((shift) => shift.status === "active").length} label="Aktif vardiya" />
        <Stat value={transfersForUnit.filter((transfer) => !["completed", "auto_rejected"].includes(transfer.status)).length} label="Açık sevk" />
      </section>
      <div className="unit-workspace-grid">
        {capacityForUnit.length > 0 && (
          <section className="panel unit-capacity-panel">
            <div className="panel-head"><div><h3>Birim kaynak ve kapasitesi</h3><p>Hastane bazında personelli, dolu, rezerve ve uygun kaynak</p></div></div>
            {capacityForUnit.map((row) => (
              <div key={`${row.facilityCode}-${row.resourceCode}`}>
                <span><b>{facilityName(snapshot, row.facilityCode)}</b><small>{row.resourceLabel}</small></span>
                <span><small>Dolu</small><b>{row.occupied}/{row.total}</b></span>
                <span><small>Rezerve</small><b>{row.reserved}</b></span>
                <span><small>Uygun</small><b className={row.available ? "success-value" : "danger-value"}>{row.available}</b></span>
                <em className={`capacity-state ${capacityStatus(row)}`}>{capacityStatusLabel(row)}</em>
              </div>
            ))}
          </section>
        )}
        {shiftsForUnit.length > 0 && (
          <section className="panel unit-shift-panel">
            <div className="panel-head"><div><h3>Vardiya ve devir görünümü</h3><p>Kim, hangi hastanede, hangi vardiyada</p></div></div>
            {shiftsForUnit.map((shift) => (
              <div key={shift.reference}>
                <span className="avatar">PE</span>
                <span><b>{shift.staffLabel}</b><small>{facilityName(snapshot, shift.facilityCode)} · {shift.role}</small></span>
                <span><b>{shift.shiftCode}</b><small>{formatTime(shift.startedAt)}–{formatTime(shift.endsAt)}</small></span>
                <em className={`shift-state ${shift.status}`}>{shiftStatus(shift.status)}</em>
              </div>
            ))}
          </section>
        )}
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Birim görev kuyruğu</h3>
              <p>
                Bu akış yalnız {unit.name} üyeleri ve yetkili yöneticilerce
                görülür.
              </p>
            </div>
          </div>
          <TaskList
            snapshot={snapshot}
            tasks={tasks}
            open={(task) =>
              task.ticketReference
                ? openTicket(task.ticketReference)
                : task.callReference && openCall(task.callReference)
            }
          />
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Görüşmeler</h3>
              <p>Birimle ilişkilendirilmiş gerçek oturumlar</p>
            </div>
          </div>
          <div className="compact-list">
            {calls.map((call) => (
              <button
                key={call.reference}
                onClick={() => openCall(call.reference)}
              >
                <span className="call-avatar">☎</span>
                <span>
                  <b>
                    {call.reference} · {call.patientAlias}
                  </b>
                  <small>
                    {callStatus(call.status)} · {formatTime(call.lastMessageAt)}
                  </small>
                </span>
                <em>→</em>
              </button>
            ))}
            {!calls.length && (
              <div className="empty">Bu birime bağlı görüşme yok.</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Birim talepleri</h3>
              <p>Kabul, işlem ve aktarım durumu</p>
            </div>
          </div>
          <div className="compact-list">
            {tickets.map((ticket) => (
              <button
                key={ticket.reference}
                onClick={() => openTicket(ticket.reference)}
              >
                <span
                  className={`priority-line ${ticket.priority.toLocaleLowerCase("tr-TR")}`}
                />
                <span>
                  <b>
                    {ticket.reference} · {ticket.subject}
                  </b>
                  <small>
                    {ticket.assignedRole} · {ticket.status}
                  </small>
                </span>
                <em>→</em>
              </button>
            ))}
            {!tickets.length && (
              <div className="empty">Bu birime bağlı talep yok.</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Onay kapıları</h3>
              <p>Bu birimde insan kararı bekleyen işlemler</p>
            </div>
          </div>
          <div className="compact-list">
            {approvalsForUnit.map((approval) => (
              <button
                key={approval.reference}
                onClick={() =>
                  approval.ticketReference
                    ? openTicket(approval.ticketReference)
                    : approval.callReference && openCall(approval.callReference)
                }
              >
                <span className="approval-icon">!</span>
                <span>
                  <b>{approval.reference}</b>
                  <small>{approval.approvalType} · karar bekliyor</small>
                </span>
                <em>→</em>
              </button>
            ))}
            {!approvalsForUnit.length && (
              <div className="empty">Bekleyen onay yok.</div>
            )}
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <div>
              <h3>Yetkili görünürlük</h3>
              <p>Rol seçimi tarayıcıdan yapılamaz.</p>
            </div>
          </div>
          <div className="member-list">
            {members.map((member) => (
              <div key={member.accountKey}>
                <span className="avatar">YK</span>
                <div>
                  <b>{member.displayLabel}</b>
                  <small>
                    {roleNames[member.systemRole] || member.systemRole} ·{" "}
                    {member.memberships.find((m) => m.unitCode === unit.code)
                      ?.unitRole || "Tüm birimler"}
                  </small>
                </div>
                <em>Aktif</em>
              </div>
            ))}
          </div>
        </section>
        <LiveFeed
          events={events}
          openRecord={(reference) =>
            reference.startsWith("CAG-") || reference.startsWith("TRN-")
              ? openCall(reference)
              : openTicket(reference)
          }
        />
      </div>
    </>
  );
}

function StaffWorkspace({ snapshot }: { snapshot: Snapshot }) {
  const [facilityFilter, setFacilityFilter] = useState("ALL");
  const shifts = facilityFilter === "ALL" ? snapshot.shifts : snapshot.shifts.filter((shift) => shift.facilityCode === facilityFilter);
  return (
    <>
      <Hero
        title="Personel, hastane, vardiya ve devir görünümü"
        text="Birim personeli yalnız kendi üyelik kapsamını görür; operasyon yöneticisi hastane ağı vardiya kapsamasını izler. Pilot ekipler gerçek personel adı kullanmadan açıkça etiketlenir."
      />
      <section className="stats">
        <Stat value={shifts.length} label="Vardiya kapsamı" />
        <Stat value={shifts.filter((shift) => shift.status === "active").length} label="Aktif ekip" />
        <Stat value={shifts.filter((shift) => shift.status === "handoff").length} label="Devirde" />
        <Stat value={shifts.filter((shift) => shift.status === "break").length} label="Molada" />
      </section>
      <section className="facility-tabs" aria-label="Hastane vardiya filtresi">
        <button className={facilityFilter === "ALL" ? "active" : ""} onClick={() => setFacilityFilter("ALL")}>Tüm hastaneler</button>
        {snapshot.facilities.map((facility) => <button key={facility.code} className={facilityFilter === facility.code ? "active" : ""} onClick={() => setFacilityFilter(facility.code)}>{facility.code} · {facility.name}</button>)}
      </section>
      <section className="panel shift-board">
        <div className="panel-head">
          <div>
            <h3>Canlı vardiya panosu</h3>
            <p>Kim nerede, hangi hastane ve birimde, hangi devir durumunda</p>
          </div>
          <span className="live"><i /> CANLI PİLOT</span>
        </div>
        <div className="shift-head"><span>EKİP / ROL</span><span>HASTANE</span><span>BİRİM</span><span>VARDİYA</span><span>DURUM / DEVİR</span></div>
        {shifts.map((shift) => (
          <div key={shift.reference}>
            <span><b>{shift.staffLabel}</b><small>{shift.role}</small></span>
            <span><b>{shift.facilityCode}</b><small>{facilityName(snapshot, shift.facilityCode)}</small></span>
            <span><b>{shift.unitCode}</b><small>{unitName(snapshot, shift.unitCode)}</small></span>
            <span><b>{shift.shiftCode}</b><small>{formatTime(shift.startedAt)}–{formatTime(shift.endsAt)}</small></span>
            <span><em className={`shift-state ${shift.status}`}>{shiftStatus(shift.status)}</em><small>{shift.handoffTo ? `Devir: ${shift.handoffTo}` : `Güncelleme ${formatTime(shift.updatedAt)}`}</small></span>
          </div>
        ))}
        {!shifts.length && <div className="empty">Yetki kapsamınızda vardiya kaydı yok.</div>}
      </section>
      <section className="staff-table panel identity-board">
        <div className="panel-head"><div><h3>Sunucu hesapları ve birim üyelikleri</h3><p>{snapshot.staff.length} etkin hesap · tarayıcıdan rol taklidi yapılamaz</p></div></div>
        {snapshot.staff.map((staff) => (
          <div key={staff.accountKey}><span className="avatar">YK</span><span><b>{staff.displayLabel}</b><small>{roleNames[staff.systemRole] || staff.systemRole} · {staff.memberships.length ? staff.memberships.map((m) => `${m.unitCode}/${m.unitRole}`).join(", ") : "Yönetim kapsamı veya birim üyeliği yok"}</small></span><em>{staff.lastSeenAt ? `Son erişim ${formatTime(staff.lastSeenAt)}` : "Henüz giriş yok"}</em><span className="state-pill active">Sunucu rolü</span></div>
        ))}
      </section>
      <div className="legal-note"><b>Yetki modeli</b><p>Site erişimi tek başına kayıt erişimi vermez. Her talep, çağrı, kapasite satırı, vardiya ve rapor sunucuda hastane/birim üyeliğine göre filtrelenir.</p></div>
    </>
  );
}
function ReportsWorkspace({ snapshot }: { snapshot: Snapshot }) {
  const [selectedCode, setSelectedCode] = useState(snapshot.reports[0]?.reportCode || "NETWORK_SUMMARY");
  const selected = snapshot.reports.find((report) => report.reportCode === selectedCode) || snapshot.reports[0];
  const completed = snapshot.tasks.filter(
    (task) => task.status === "completed",
  ).length;
  const resourceBase = Math.max(1, snapshot.capacitySummary.total);
  const occupancy = Math.round((snapshot.capacitySummary.occupied / resourceBase) * 100);
  const decisions = snapshot.capacitySummary.autoAccepted + snapshot.capacitySummary.autoRejected;
  const acceptance = decisions ? Math.round((snapshot.capacitySummary.autoAccepted / decisions) * 100) : 0;
  return (
    <>
      <Hero
        title="Canlı, görevli ve dışa aktarılabilir operasyon raporları"
        text="Raporlar zamanlanmış sunucu göreviyle otomatik yenilenir; hastane, birim, kapasite, sevk, taburculuk, vardiya ve otomasyon verisini yetki kapsamına göre gösterir."
      />
      <section className="stats">
        <Stat value={`${occupancy}%`} label="Kaynak kullanımı" />
        <Stat value={`${acceptance}%`} label="Otomatik kabul / alternatif" />
        <Stat value={snapshot.capacitySummary.dischargeForecast} label="Taburculuk tahmini" />
        <Stat value={snapshot.capacitySummary.transfersOpen} label="Açık sevk" />
        <Stat value={snapshot.tasks.length} label="Görev kaydı" />
        <Stat value={completed} label="Tamamlanan görev" />
        <Stat value={snapshot.jobs.deadLetter} label="Karantina" />
        <Stat value={snapshot.reports.filter((report) => report.status === "active").length} label="Aktif rapor görevi" />
      </section>
      <section className="report-assignment-grid">
        {snapshot.reports.map((report) => (
          <button key={report.reportCode} className={selected?.reportCode === report.reportCode ? "active" : ""} onClick={() => setSelectedCode(report.reportCode)}>
            <span className="report-icon">▥</span>
            <span><small>{report.reportCode} · {report.schedule}</small><b>{report.title}</b><p>{report.assignedRole} · {report.delivery}</p></span>
            <span><em className={`state-pill ${report.status}`}>{report.status === "active" ? "AKTİF" : report.status}</em><small>Son {formatTime(report.lastRunAt)}</small></span>
          </button>
        ))}
      </section>
      {selected && (
        <section className="panel report-detail">
          <div className="panel-head"><div><h3>{selected.title}</h3><p>{selected.assignedRole} rolüne görevli · sonraki çalışma {formatTime(selected.nextRunAt)}</p></div><a className="secondary button-link" href={`/api/reports/export?report=${encodeURIComponent(selected.reportCode)}`} download>Yetkili CSV indir</a></div>
          <div className="report-kpi-grid">
            {Object.entries(selected.result).slice(0, 12).map(([key, value]) => <span key={key}><small>{reportMetricLabel(key)}</small><b>{formatMetricValue(value)}</b></span>)}
            {!Object.keys(selected.result).length && <div className="empty">İlk zamanlanmış rapor çevrimi hazırlanıyor.</div>}
          </div>
        </section>
      )}
      <div className="report-grid operational-report-grid">
        <section className="panel report-bars">
          <h3>Hastane bazında uygun kaynak</h3>
          {snapshot.facilities.map((facility) => {
            const rows = snapshot.capacity.filter((row) => row.facilityCode === facility.code);
            const available = rows.reduce((sum, row) => sum + row.available, 0);
            const total = rows.reduce((sum, row) => sum + row.total, 0);
            return (
              <div key={facility.code}>
                <span>{facility.code} · {facility.name}</span>
                <i>
                  <progress max={Math.max(1, total)} value={available} aria-label={`${facility.name} uygun kaynak ${available}/${total}`} />
                </i>
                <strong>{available}</strong>
              </div>
            );
          })}
        </section>
        <section className="panel insight">
          <h3>Rapor görevlendirme ve veri kaynağı</h3>
          <p><b>Kapasite:</b> capacity_snapshots; personelli toplamdan dolu, rezerve, bloke ve temizlik düşülür.</p>
          <p><b>Sevk:</b> transfer_requests; kabul, ret, alternatif hedef ve karar gerekçesi.</p>
          <p><b>Vardiya:</b> staff_shifts; hastane, birim, vardiya ve devir durumu.</p>
          <p><b>Otomasyon:</b> workflow_jobs, retry, karantina ve audit olayları.</p>
          <p><b>Kapsam:</b> Sunucu rolü ve birim üyeliği; CSV dışa aktarma ayrıca denetim izine yazılır.</p>
        </section>
      </div>
    </>
  );
}
function PrivacyWorkspace({ security }: { security: SecurityStatus | null }) {
  return (
    <>
      <Hero
        title="KVKK ve etik teknik kapıları"
        text="Uyum iddiası değil; uygulamada çalışan minimizasyon, yetki, maskeleme ve insan onayı kontrolleri."
      />
      <div className="legal-warning">
        <b>Hukuki sınır</b>
        <p>
          Bu teknik kontroller, canlı hastane kullanımı için kurumun hukuk,
          KVKK, bilgi güvenliği ve klinik yönetim onayının yerine geçmez.
          Üretime geçişten önce veri envanteri, saklama-imha, aydınlatma, açık
          rıza gerekliliği, aktarım ve ihlal prosedürleri kurum özelinde
          doğrulanmalıdır.
        </p>
      </div>
      <div className="control-grid">
        {Object.entries(controlNames)
          .filter(([key]) =>
            [
              "unitIsolation",
              "objectAuthorization",
              "piiRedaction",
              "tamperEvidentAudit",
              "externalHealthDataTransfer",
            ].includes(key),
          )
          .map(([key, [title, detail]], index) => (
            <article key={key}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <b>{title}</b>
                <p>{detail}</p>
                <small>
                  {security?.controls[key]
                    ? "Yapılandırma tespit edildi; canlı test gerekli"
                    : key === "externalHealthDataTransfer"
                      ? "Pilot politikası: dışa aktarım kapalı"
                      : "Kodda mevcut; canlı doğrulama bekleniyor"}
                </small>
              </div>
              <em>{security?.controls[key] ? "✓" : "…"}</em>
            </article>
          ))}
      </div>
    </>
  );
}
function SecurityWorkspace({
  status,
  workspaceEvents,
  refresh,
}: {
  status: SecurityStatus | null;
  workspaceEvents: Snapshot["security"];
  refresh: () => void;
}) {
  const events = status?.recent || workspaceEvents;
  return (
    <>
      <Hero
        title="Savunmalı uygulama güvenliği"
        text="Hacklenemezlik vaadi yoktur; saldırı yüzeyini azaltan, engelleyen, kaydeden ve doğrulanabilir kontroller vardır."
        button="Durumu yenile"
        onClick={refresh}
      />
      <div className="security-posture">
        <span className="security-shield">⬡</span>
        <div>
          <b>
            {status
              ? "Pilot güvenlik kontrolleri"
              : "Güvenlik telemetrisi yükleniyor"}
          </b>
          <p>
            Kodda kimlik, yetki, birim izolasyonu, CSRF, hız sınırı, CSP ve olay
            kaydı önlemleri bulunur. Canlı ortam testi ve bağımsız inceleme bekleniyor.
          </p>
        </div>
        <strong>{status?.eventCount ?? workspaceEvents.length} olay</strong>
      </div>
      <div className="control-grid security-controls">
        {Object.entries(controlNames).map(([key, [title, detail]], index) => (
          <article key={key}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div>
              <b>{title}</b>
              <p>{detail}</p>
              <small>
                {status?.controls[key]
                  ? "YAPILANDIRMA TESPİT EDİLDİ"
                  : key === "externalHealthDataTransfer"
                    ? "KAPALI (GÜVENLİ VARSAYILAN)"
                    : "CANLI TEST BEKLENİYOR"}
              </small>
            </div>
            <em
              className={
                status?.controls[key] || key === "externalHealthDataTransfer"
                  ? "ok"
                  : "pending"
              }
            >
              {status?.controls[key] || key === "externalHealthDataTransfer"
                ? "✓"
                : "…"}
            </em>
          </article>
        ))}
      </div>
      <section className="panel security-events">
        <div className="panel-head">
          <div>
            <h3>Güvenlik olay günlüğü</h3>
            <p>Ham IP tutulmaz; tek yönlü hash ile olay korelasyonu yapılır.</p>
          </div>
        </div>
        {events.length ? (
          events.map((event) => (
            <div key={event.id}>
              <time>{formatDateTime(event.createdAt)}</time>
              <span className={`severity ${event.severity}`}>
                {event.severity}
              </span>
              <b>{event.eventType}</b>
              <small>
                {event.path} · {event.detail}
              </small>
            </div>
          ))
        ) : (
          <div className="empty">Kaydedilmiş güvenlik olayı yok.</div>
        )}
      </section>
      <div className="legal-note">
        <b>Üretim öncesi zorunlu kalan kontroller</b>
        <p>
          Bağımsız sızma testi, SAST/DAST, bağımlılık ve secret taraması,
          WAF/bot politikası, kurum SSO/MFA, SIEM alarmı, yedekleme-geri dönüş
          testi ve olay müdahale tatbikatı barındırma/kurum altyapısında ayrıca
          tamamlanmalıdır.
        </p>
      </div>
    </>
  );
}
function AuditWorkspace({ audit }: { audit: Audit[] }) {
  return (
    <>
      <Hero
        title="Hash zincirli denetim izleri"
        text="Her yazma işlemi aktör, kaynak, sonuç ve önceki kayıt özetiyle sunucuda tutulur."
      />
      <div className="panel audit-table" tabIndex={0} role="region" aria-label="Denetim kayıtları tablosu">
        <div className="audit-head">
          <span>ZAMAN</span>
          <span>AKTÖR</span>
          <span>İŞLEM</span>
          <span>KAYNAK / DETAY</span>
          <span>HASH</span>
        </div>
        {audit.map((entry) => (
          <div key={entry.id}>
            <time>{formatDateTime(entry.createdAt)}</time>
            <span>{maskActor(entry.actor)}</span>
            <b>{entry.action}</b>
            <small>
              {entry.resource} · {entry.detail || "Ayrıntı yok"}
            </small>
            <em title={entry.currentHash}>{entry.currentHash.slice(0, 10)}…</em>
          </div>
        ))}
        {!audit.length && (
          <div className="empty">Yetki kapsamında audit kaydı yok.</div>
        )}
      </div>
    </>
  );
}

function TicketDrawer({
  snapshot,
  ticket,
  close,
  busy,
  act,
}: {
  snapshot: Snapshot;
  ticket: Ticket;
  close: () => void;
  busy: string;
  act: (reference: string, action: "accept" | "start" | "resolve" | "transfer", targetUnitCode?: string) => void;
}) {
  // Sunucu aynı kuralları uygular (TICKET_OPERATOR_ROLES, kapalı talep); burada yalnız görünürlük.
  const canOperate =
    ["operations_manager", "unit_manager", "clinician", "call_agent"].includes(snapshot.identity.role) &&
    ticket.status !== "Çözüldü";
  const [targetUnit, setTargetUnit] = useState("");
  const working = busy.startsWith(`${ticket.reference}:`);
  const transfer = snapshot.transfers.find((item) => item.ticketReference === ticket.reference);
  const targetCapacity = transfer
    ? snapshot.capacity.find((row) => row.facilityCode === transfer.targetFacilityCode && row.unitCode === transfer.requestedUnitCode && row.resourceCode === transfer.resourceCode)
    : undefined;
  return (
    <div className="drawer-backdrop" onMouseDown={close}>
      <aside
        className="ticket-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="drawer-head">
          <div>
            <small>{ticket.reference}</small>
            <h2>{ticket.subject}</h2>
          </div>
          <button onClick={close}>×</button>
        </div>
        <div className="destination-card">
          <span className="unit-code operational">{ticket.unitCode}</span>
          <div>
            <small>MEVCUT HEDEF</small>
            <b>{ticket.unit}</b>
            <p>
              {ticket.task?.reference || "Görev hazırlanıyor"} ·{" "}
              {ticket.assignedRole} · {statusLabel(ticket.task?.status)}
            </p>
          </div>
        </div>
        <div className="ticket-summary">
          <span>
            <small>Hasta</small>
            <b>{ticket.patientAlias}</b>
          </span>
          <span>
            <small>Öncelik</small>
            <b>{ticket.priority}</b>
          </span>
          <span>
            <small>Durum</small>
            <b>{ticket.status}</b>
          </span>
          <span>
            <small>SLA</small>
            <b>{ticket.slaDueAt ? formatTime(ticket.slaDueAt) : "—"}</b>
          </span>
        </div>
        <section>
          <h3>Otomatik karar ve sahiplik</h3>
          <div className="automatic-decision">
            <span className={`decision-icon ${transfer?.status || ticket.task?.status || "checking"}`}>⌘</span>
            <div>
              <small>KULLANICI KABULÜ GEREKTİRMEYEN OPERASYON KARARI</small>
              <b>{transfer ? transferStatus(transfer.status) : statusLabel(ticket.task?.status)}</b>
              <p>{transfer?.decisionDetail || `${ticket.unit} kural motoru tarafından seçildi; görev ve SLA sunucuda otomatik açıldı.`}</p>
            </div>
          </div>
        </section>
        {transfer && (
          <section>
            <h3>Sistemler arası rota ve kaynak</h3>
            <div className="route-decision-grid">
              <span><small>KAYNAK</small><b>{transfer.sourceFacilityCode}</b></span>
              <span><small>HEDEF</small><b>{facilityName(snapshot, transfer.targetFacilityCode)}</b></span>
              <span><small>İSTENEN</small><b>{transfer.requestedCount} · {transfer.resourceLabel}</b></span>
              <span><small>UYGUN</small><b>{targetCapacity?.available ?? "—"}</b></span>
            </div>
            <p className="muted">Kapasite yetersizse motor uygun alternatif kampüsü tarar; alternatif de yoksa gerekçeli ret üretir. Klinik uygunluk kararı bu motorun kapsamı dışındadır.</p>
          </section>
        )}
        {canOperate ? (
          <section aria-labelledby={`actions-${ticket.reference}`}>
            <h3 id={`actions-${ticket.reference}`}>Birim işlemleri</h3>
            <div className="drawer-actions">
              <button type="button" disabled={working || ticket.status === "Kabul edildi"} onClick={() => act(ticket.reference, "accept")}>Görevi üstlen</button>
              <button type="button" disabled={working || ticket.status === "İşlemde"} onClick={() => act(ticket.reference, "start")}>İşleme al</button>
              <button type="button" className="primary" disabled={working} onClick={() => act(ticket.reference, "resolve")}>Görevi sonuçlandır</button>
            </div>
            <form
              className="drawer-transfer"
              onSubmit={(event) => {
                event.preventDefault();
                if (targetUnit) act(ticket.reference, "transfer", targetUnit);
              }}
            >
              <label htmlFor={`transfer-${ticket.reference}`}>Başka birime aktar</label>
              <select id={`transfer-${ticket.reference}`} value={targetUnit} onChange={(event) => setTargetUnit(event.target.value)} required>
                <option value="">Hedef birim seçin</option>
                {snapshot.units.filter((unit) => unit.code !== ticket.unitCode).map((unit) => (
                  <option key={unit.code} value={unit.code}>{unit.name}</option>
                ))}
              </select>
              <button type="submit" disabled={working || !targetUnit}>Aktar</button>
            </form>
            {working && <p className="muted" role="status">İşleniyor…</p>}
          </section>
        ) : (
          <section>
            <h3>Birim işlemleri</h3>
            <p className="muted">
              {ticket.status === "Çözüldü"
                ? "Talep sonuçlandırıldı; yeniden işlenemez."
                : "Bu rol talebi izleyebilir; durum değişikliği birim ekibi veya operasyon yöneticisi tarafından yapılır."}
            </p>
          </section>
        )}
        <section>
          <h3>Kalıcı işlem geçmişi</h3>
          <div className="drawer-timeline">
            {ticket.history.length ? (
              ticket.history.map((event, index) => (
                <div key={event.id}>
                  <span>{index + 1}</span>
                  <div>
                    <b>{eventTitle(event.eventType)}</b>
                    <small>{event.detail}</small>
                    <em>{formatDateTime(event.createdAt)}</em>
                  </div>
                </div>
              ))
            ) : (
              <div>
                <span>1</span>
                <div>
                  <b>Talep alındı</b>
                  <small>
                    {ticket.channel} · {ticket.unit} kuyruğu
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>
        <section>
          <h3>Görünürlük kapsamı</h3>
          <p className="muted">
            {ticket.unit} üyeleri, atanmış görev sahibi ve yetkili operasyon
            yöneticisi. Kayıt kimliği URL üzerinde değiştirilse bile sunucu
            birim yetkisini yeniden denetler.
          </p>
        </section>
      </aside>
    </div>
  );
}
function CreateDialog({
  kind,
  units,
  busy,
  close,
  submit,
}: {
  kind: Exclude<DialogKind, null>;
  units: Unit[];
  busy: boolean;
  close: () => void;
  submit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const clinical = units.filter((unit) => unit.kind === "clinical");
  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <form
        className="modal"
        onSubmit={submit}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div>
          <span className="brand-mark">K</span>
          <button type="button" onClick={close}>
            ×
          </button>
        </div>
        <input type="hidden" name="kind" value={kind} />
        <h2>
          {kind === "call"
            ? "Gelen çağrı kaydı"
            : kind === "appointment"
              ? "Randevu talebi"
              : "Yeni hasta talebi"}
        </h2>
        <p>
          Gönderildiğinde kayıt doğrudan sunucuya, hedef birim kuyruğuna ve
          denetim izine yazılır.
        </p>
        <label>
          Hasta/protokol takma adı
          <input
            name="patientAlias"
            required
            minLength={3}
            maxLength={40}
            placeholder="HST-0001"
          />
        </label>
        {kind === "call" ? (
          <label>
            Arayanın ilk ifadesi
            <textarea
              name="openingMessage"
              required
              minLength={3}
              maxLength={2000}
              placeholder="Görüşmede gerçekten söylenen ilk ifadeyi girin…"
            />
          </label>
        ) : kind === "appointment" ? (
          <>
            <label>
              Klinik branş
              <select name="branch" required>
                {clinical.map((unit) => (
                  <option key={unit.code} value={unit.name}>
                    {unit.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tercih edilen tarih
              <input name="date" type="date" required />
            </label>
          </>
        ) : (
          <>
            <label>
              Talep özeti
              <textarea
                name="subject"
                required
                minLength={6}
                maxLength={2000}
                placeholder="Gerekli en az bilgiyi yazın…"
              />
            </label>
            <label>
              İlk hedef birim
              <select name="unitCode" required>
                {units.map((unit) => (
                  <option value={unit.code} key={unit.code}>
                    {unit.code} · {unit.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <div className="form-security-note">
          Kimlik alanları maskelenir; acil olasılık sinyalinde normal otomasyon
          durur ve insan devri açılır.
        </div>
        <button className="primary" disabled={busy}>
          {busy ? "Sunucuya kaydediliyor…" : "Güvenli akışı başlat"}
        </button>
      </form>
    </div>
  );
}

function unitName(snapshot: Snapshot, code: string) {
  return snapshot.units.find((unit) => unit.code === code)?.name || code;
}
function facilityName(snapshot: Snapshot, code: string) {
  return snapshot.facilities.find((facility) => facility.code === code)?.name || code;
}
function transferStatus(status: string) {
  return ({
    received: "Sistem talebi alındı",
    checking: "Otomatik kontrol",
    auto_accepted: "Otomatik ön kabul",
    auto_rejected: "Kapasite yok · ret",
    auto_rerouted: "Alternatife yönlendirildi",
    scheduled: "Otomatik planlandı",
    transport_assigned: "Transport atandı",
    in_transit: "Sevk sürüyor",
    completed: "Devir tamamlandı",
  } as Record<string, string>)[status] || status;
}
function transferStatusIcon(status: string) {
  if (["auto_accepted", "auto_rerouted", "scheduled", "transport_assigned", "in_transit", "completed"].includes(status)) return "✓";
  if (status === "auto_rejected") return "×";
  return "⌘";
}
function capacityStatus(row: Capacity) {
  if (row.available <= 0) return "unavailable";
  if (row.available / Math.max(1, row.total) <= 0.1) return "critical";
  if (row.available / Math.max(1, row.total) <= 0.25) return "constrained";
  return "available";
}
function capacityStatusLabel(row: Capacity) {
  return ({ unavailable: "DOLU / KAPALI", critical: "KRİTİK", constrained: "SINIRLI", available: "UYGUN" } as Record<string, string>)[capacityStatus(row)];
}
function shiftStatus(status: string) {
  return ({ active: "Aktif", handoff: "Devirde", break: "Molada", off: "Vardiya dışı" } as Record<string, string>)[status] || status;
}
function reportMetricLabel(key: string) {
  return ({
    generatedAt: "Oluşturma", facilities: "Hastane", resources: "Kaynak satırı", available: "Uygun kaynak",
    dischargeForecast: "Taburculuk tahmini", transfersOpen: "Açık sevk", autoAccepted: "Otomatik kabul/alternatif",
    autoRejected: "Otomatik ret", activeTasks: "Aktif görev", activeShifts: "Aktif vardiya", handoffs: "Devir",
  } as Record<string, string>)[key] || key;
}
function formatMetricValue(value: unknown) {
  if (typeof value === "number") return new Intl.NumberFormat("tr-TR").format(value);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return formatDateTime(value);
  return String(value ?? "—");
}
function formatTime(value: DateValue) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleTimeString("tr-TR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}
function formatDateTime(value: DateValue) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("tr-TR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}
function statusLabel(status?: string | null) {
  return (
    (
      {
        queued: "Kural kontrolünde",
        accepted: "Otomatik kabul / atama",
        in_progress: "Sistemler arası işlemde",
        completed: "Tamamlandı",
        cancelled: "İptal",
        running: "Çalışıyor",
        dead_letter: "Karantina",
        received: "Sistem talebi alındı",
        checking: "Otomatik kontrol",
        auto_accepted: "Otomatik ön kabul",
        auto_rejected: "Kapasite yok · ret",
        auto_rerouted: "Alternatife yönlendirildi",
        scheduled: "Otomatik planlandı",
        transport_assigned: "Transport atandı",
        in_transit: "Sevk sürüyor",
      } as Record<string, string>
    )[status || ""] ||
    status ||
    "Durum bekleniyor"
  );
}
function callStatus(status: string) {
  return (
    (
      {
        ringing: "Çalıyor",
        active: "Görüşme sürüyor",
        human_handoff: "İnsan devri",
        transferred: "Otomatik aktarımda",
        completed: "Tamamlandı",
      } as Record<string, string>
    )[status] || status
  );
}
function eventTitle(eventType: string) {
  return (
    (
      {
        routed: "Birim kuyruğuna yönlendirildi",
        emergency_handoff: "Acil insan devri açıldı",
        accept: "Talep kabul edildi",
        start: "İşleme alındı",
        resolve: "Sonuçlandırıldı",
        transfer: "Birim aktarımı",
      } as Record<string, string>
    )[eventType] || eventType
  );
}
function maskActor(actor: string) {
  if (!actor.includes("@")) return actor;
  const [name, domain] = actor.split("@");
  return `${name.slice(0, 2)}***@${domain}`;
}
