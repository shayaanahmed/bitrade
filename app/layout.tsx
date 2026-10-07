import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "TradePilot — Crypto trading assistant",
  description: "Chart, scan and simulate crypto trades with a focused strategy workspace.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "TradePilot — Crypto trading assistant",
    description: "Chart. Scan. Trade with clarity.",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "TradePilot crypto trading workspace" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TradePilot — Crypto trading assistant",
    description: "Chart. Scan. Trade with clarity.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
