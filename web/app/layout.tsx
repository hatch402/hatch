import type { Metadata } from "next";
import { Archivo, Martian_Mono, Public_Sans } from "next/font/google";
import "./globals.css";

const display = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-display",
  display: "swap",
});

const body = Public_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

const mono = Martian_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "HATCH",
  description:
    "How much lending collateral on Robinhood Chain can actually exit on-chain. Measured daily against the venues a liquidator contract can call.",
  metadataBase: new URL("https://hatch402.xyz"),
  openGraph: {
    title: "HATCH",
    siteName: "HATCH",
    description:
      "How much lending collateral on Robinhood Chain can actually exit on-chain.",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: "@hatch402" },
  verification: {
    other: { "virtual-protocol-site-verification": "cf48097bf55798261024758d527bbf0f" },
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
