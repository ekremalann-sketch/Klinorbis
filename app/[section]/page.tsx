import { requireChatGPTUser } from "../chatgpt-auth";
import { notFound } from "next/navigation";
import Dashboard, { type View } from "../dashboard";

export const dynamic = "force-dynamic";

const sections = new Set<View>([
  "inbox",
  "flow",
  "requests",
  "appointments",
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
  if (!sections.has(section as View)) notFound();
  return <AuthenticatedSection section={section as View} />;
}

import { privateMeta } from "../../lib/seo";
export const metadata = privateMeta;

async function AuthenticatedSection({ section }: { section: View }) {
  await requireChatGPTUser(`/${section}`);
  return <Dashboard initialView={section} />;
}
