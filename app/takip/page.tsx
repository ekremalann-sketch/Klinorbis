import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../site-chrome";
import Tracking from "./tracking";

export const metadata: Metadata = {
  title: "Başvuru takibi · Klinorbis",
  description: "Hastane başvurunuzun hangi birimde olduğunu takip kodu ve PIN ile görün.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <main className="marketing-shell"><SiteHeader /><Tracking /><SiteFooter /></main>;
}
