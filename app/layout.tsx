import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL ?? "http://localhost:3000"),
  title: "TradePilot — Trading & research platform",
  description: "Chart and scan markets, run reproducible backtests, validate ensembles, and paper trade safely.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "TradePilot Research",
    description: "Backtest. Validate. Paper trade.",
    type: "website",
    images: [{ url: "/og-research.png", width: 1730, height: 909, alt: "TradePilot Research workflow" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TradePilot Research",
    description: "Backtest. Validate. Paper trade.",
    images: ["/og-research.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>;
}
