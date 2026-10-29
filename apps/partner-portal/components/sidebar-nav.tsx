"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type IconName = "dashboard" | "packages" | "accommodations" | "vehicles" | "bookings" | "reviews" | "earnings" | "documents";

/** 24x24 line icons, drawn inline so the portal needs no icon dependency. */
const ICONS: Record<IconName, ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  packages: (<><path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z" /><path d="M3 7.5 12 12l9-4.5M12 12v9" /></>),
  accommodations: (<><path d="M3 19V7M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6" /><circle cx="7" cy="11.5" r="1.8" /></>),
  vehicles: (<><path d="M4 16v-4.5L6.2 6h11.6L20 11.5V16" /><path d="M3 16h18v3H3z" /><path d="M4 11.5h16" /></>),
  bookings: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  reviews: (<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.8 6.8 19.6l1-5.8-4.3-4.1 5.9-.9z" />),
  earnings: (<><rect x="3" y="6" width="18" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5h.01M17.5 14.5h.01" /></>),
  documents: (<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>),
};

interface NavItem { href: string; label: string; icon: IconName }
interface NavGroup { heading?: string; items: NavItem[] }

// Every link from the previous top bar is still here - only grouped.
const GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Dashboard", icon: "dashboard" }] },
  {
    heading: "Listings",
    items: [
      { href: "/packages", label: "Packages", icon: "packages" },
      { href: "/accommodations", label: "Accommodation", icon: "accommodations" },
      { href: "/vehicles", label: "Vehicles", icon: "vehicles" },
    ],
  },
  {
    heading: "Business",
    items: [
      { href: "/bookings", label: "Bookings", icon: "bookings" },
      { href: "/reviews", label: "Reviews", icon: "reviews" },
      { href: "/earnings", label: "Earnings", icon: "earnings" },
      { href: "/documents", label: "Documents", icon: "documents" },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav() {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Main" className="flex flex-col gap-5 text-sm">
      {GROUPS.map((group, gi) => (
        <div key={group.heading ?? gi}>
          {group.heading && <p className="mb-1.5 px-3 text-xs font-medium text-sand/45">{group.heading}</p>}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={`relative flex items-center gap-3 rounded-lg px-3 py-1.5 transition-colors ${
                      active ? "bg-white/10 font-medium text-white" : "text-sand/70 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-gold" aria-hidden />}
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                      aria-hidden
                    >
                      {ICONS[item.icon]}
                    </svg>
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
