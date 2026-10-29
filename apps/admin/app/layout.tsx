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
  title: "NaviMus Admin",
  description: "Internal operations dashboard.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${zilla.variable} ${inter.variable} ${plexMono.variable}`}>
      <body className="overflow-hidden">
        {/* App shell: fixed window, sidebar + scrolling content - and no menus at all on the login page. */}
        <AppShell sidebar={<Sidebar />}>{children}</AppShell>
      </body>
    </html>
  );
}
