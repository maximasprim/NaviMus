import type { Metadata } from "next";
import { Zilla_Slab, Inter, IBM_Plex_Mono } from "next/font/google";
// @ts-expect-error CSS imports are handled by the Next.js bundler.
import "./globals.css";
import { Sidebar } from "@/components/sidebar";
import { AppShell } from "@/components/app-shell";

const zilla = Zilla_Slab({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-zilla" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const plexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-plex-mono" });

export const metadata: Metadata = {
  title: "NaviMus Partner Portal",
  description: "Manage your packages, bookings, and earnings.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${zilla.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="overflow-hidden">
        <AppShell sidebar={<Sidebar />}>{children}</AppShell>
      </body>
    </html>
  );
}
