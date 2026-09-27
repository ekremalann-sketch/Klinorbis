import type { Metadata } from "next";
import EnglishDemo from "./english-demo";
import { pageMeta } from "../../../lib/seo";

export const metadata: Metadata = pageMeta({
  title: "KLINORBIS Demo | Hospital operations",
  description: "Interactive, synthetic hospital operations scenario. No real patient information or clinical decisions.",
  path: "/en/demo", locale: "en_US",
});

export default function EnglishDemoPage(){ return <EnglishDemo/> }
