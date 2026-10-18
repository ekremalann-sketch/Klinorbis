import { requireChatGPTUser } from "../chatgpt-auth";
import { notFound } from "next/navigation";
import Dashboard, { type View } from "../dashboard";

export const dynamic = "force-dynamic";

// "merkez" = Operasyon Merkezi (önceden "/" idi; yenileyince pazarlama sayfasına düşülüyordu).
const sections = new Set<string>([
  "merkez",
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
  return <AuthenticatedSection section={section === "merkez" ? "dashboard" : (section as View)} />;
}

import { privateMeta } from "../../lib/seo";
export const metadata = privateMeta;

async function AuthenticatedSection({ section }: { section: View }) {
  await requireChatGPTUser(section === "dashboard" ? "/merkez" : `/${section}`);
  return <Dashboard initialView={section} />;
}
