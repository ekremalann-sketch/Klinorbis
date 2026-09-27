import type { Metadata } from "next";

export const SITE_URL = "https://klinorbis.ekremalan.chatgpt.site";
const OG_IMAGE = { url: "/og/klinorbis-og.png", width: 1200, height: 630, alt: "Klinorbis hastane operasyon kontrol kulesi" };

/** Başlık, açıklama, kanonik adres, TR/EN dil bağlantısı ve paylaşım kartı. */
export function pageMeta(input: { title: string; description: string; path: string; locale?: "tr_TR" | "en_US" }): Metadata {
  return {
    title: input.title,
    description: input.description,
    alternates: { canonical: input.path, languages: { tr: "/", en: "/en" } },
    openGraph: { type: "website", siteName: "KLINORBIS", locale: input.locale ?? "tr_TR", url: input.path, title: input.title, description: input.description, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: input.title, description: input.description, images: [OG_IMAGE.url] },
  };
}

/** Oturum gerektiren operatör ekranları arama motorlarına kapalıdır. */
export const privateMeta: Metadata = { robots: { index: false, follow: false } };

export function structuredData(description: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "KLINORBIS",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    inLanguage: ["tr", "en"],
    description,
    isAccessibleForFree: true,
    sameAs: ["https://github.com/ekremalann-sketch/Klinorbis"],
  };
}
