import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { pageMeta, SITE_URL, structuredData } from "../lib/seo";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const HOME_TITLE = "KLINORBIS | Hastane Operasyon Kontrol Kulesi";
const HOME_DESCRIPTION = "Kapasite, transfer, çağrı, talep, vardiya ve onay akışlarını insan denetimiyle birleştiren çalışan hastane operasyon prototipi. Sentetik demo verisi; klinik karar vermez.";

export const metadata: Metadata = {
  ...pageMeta({ title: HOME_TITLE, description: HOME_DESCRIPTION, path: "/" }),
  metadataBase: new URL(SITE_URL),
  applicationName: "KLINORBIS",
  robots: { index: true, follow: true },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light",
  themeColor: "#0b213c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        {/* Arama motorları için yazılım tanımı; çalıştırılabilir betik değildir. */}
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData(HOME_DESCRIPTION)).replace(/</g, "\\u003c") }} />
      </body>
    </html>
  );
}
