import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { brand } from "@/config/brand";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const b = brand();
  return {
    metadataBase: new URL(b.siteUrl),
    title: { default: `${b.name} | ${b.tagline}`, template: `%s | ${b.name}` },
    description: b.description,
    applicationName: b.name,
    openGraph: { type: "website", siteName: b.name, description: b.description, url: "/" },
    twitter: { card: "summary_large_image" },
    alternates: { canonical: "/" },
  };
}

export const viewport: Viewport = { themeColor: brand().themeColor, width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
