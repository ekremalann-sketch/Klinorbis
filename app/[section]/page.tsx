import { requireChatGPTUser } from "../chatgpt-auth";
import { notFound } from "next/navigation";
import Dashboard, { type View } from "../dashboard";

export const dynamic = "force-dynamic";

// "merkez" = Operasyon Merkezi (önceden "/" idi; yenileyince pazarlama sayfasına düşülüyordu).
// Türkçe adresler: /islerim → İşlerim, /birimim → Birimim.
const ALIASES: Record<string, View> = { merkez: "dashboard", islerim: "mywork", birimim: "myunit" };
const sections = new Set<string>([
  "merkez",
  "islerim",
  "birimim",
  "inbox",
  "flow",
  "requests",
  "appointments",
  "access",
  "playbooks",
  "simulation",
  "calls",
  "approvals",
  "automation",
  "capacity",
  "integrations",
  "units",
  "staff",
  "reports",
  "privacy",
  "security",
  "audit",
]);

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!sections.has(section)) notFound();
  return <AuthenticatedSection section={ALIASES[section] ?? (section as View)} path={`/${section}`} />;
}

import { privateMeta } from "../../lib/seo";
export const metadata = privateMeta;

async function AuthenticatedSection({ section, path }: { section: View; path: string }) {
  await requireChatGPTUser(path);
  return <Dashboard initialView={section} />;
}
