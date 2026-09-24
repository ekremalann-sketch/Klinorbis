import { notFound } from "next/navigation";
import Dashboard, { type View } from "../../dashboard";

export const dynamic = "force-dynamic";

const detailSections = new Set<View>(["inbox", "requests", "appointments", "calls", "units"]);

export default async function DetailPage({ params }: { params: Promise<{ section: string; reference: string }> }) {
  const { section, reference } = await params;
  if (!detailSections.has(section as View) || !/^[A-Za-z0-9._-]{2,96}$/.test(reference)) notFound();
  return <Dashboard initialView={section as View} initialReference={reference} />;
}
