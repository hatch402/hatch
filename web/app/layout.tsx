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
  title: "LASTOUT — liquidation coverage on Robinhood Chain",
  description:
    "How much lending collateral on Robinhood Chain can actually exit on-chain. Measured daily against the only venue a liquidator contract can call.",
  metadataBase: new URL("https://lastout.xyz"),
  openGraph: {
    title: "LASTOUT",
    description:
      "How much lending collateral on Robinhood Chain can actually exit on-chain.",
    type: "website",
  },
  twitter: { card: "summary_large_image", site: "@lastout_xyz" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
