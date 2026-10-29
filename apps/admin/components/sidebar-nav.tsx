"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

type IconName =
  | "dashboard" | "tenants" | "operators" | "users" | "approvals" | "bookings" | "support"
  | "moderation" | "audit" | "reference" | "templates" | "policies" | "settings" | "site";

/** 24x24 line icons, drawn inline so the admin app needs no icon dependency. */
const ICONS: Record<IconName, ReactNode> = {
  dashboard: (<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>),
  tenants: (<><path d="M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16" /><path d="M14 10h5a1 1 0 0 1 1 1v10" /><path d="M8 8h2M8 12h2M8 16h2" /><path d="M3 21h18" /></>),
  operators: (<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></>),
  users: (<><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3c2.2.7 3.5 2.6 3.5 5.7" /></>),
  approvals: (<><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.8 2.8L16 9.5" /></>),
  bookings: (<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  support: (<path d="M4 5h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-9l-5 4v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />),
  moderation: (<path d="M12 3 4.5 6v5.5c0 4.5 3 8 7.5 9.5 4.5-1.5 7.5-5 7.5-9.5V6L12 3z" />),
  audit: (<><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7M9 17h7" /></>),
  reference: (<><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>),
  templates: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 7 8.5 6 8.5-6" /></>),
  policies: (<><circle cx="12" cy="12" r="9" /><path d="m5.6 5.6 12.8 12.8" /></>),
  settings: (<><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></>),
  site: (<><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M7 6.5h.01M10 6.5h.01" /><path d="M8 14h8M8 17h5" /></>),
};

interface NavItem { href: string; label: string; icon: IconName }
interface NavGroup { heading?: string; items: NavItem[] }

// Every route from the previous sidebar is still here - only grouped.
const GROUPS: NavGroup[] = [
  { items: [{ href: "/", label: "Dashboard", icon: "dashboard" }] },
  {
    heading: "Platform",
    items: [
      { href: "/tenants", label: "Tenants", icon: "tenants" },
      { href: "/operators", label: "Operators", icon: "operators" },
      { href: "/users", label: "Users", icon: "users" },
      { href: "/approvals", label: "Approvals", icon: "approvals" },
    ],
  },
  {
    heading: "Operations",
    items: [
      { href: "/bookings", label: "Bookings", icon: "bookings" },
      { href: "/support", label: "Support", icon: "support" },
      { href: "/moderation", label: "Moderation", icon: "moderation" },
      { href: "/audit-log", label: "Audit log", icon: "audit" },
    ],
  },
  {
    heading: "Configuration",
    items: [
      { href: "/site", label: "Site content", icon: "site" },
      { href: "/reference-data", label: "Reference data", icon: "reference" },
      { href: "/notification-templates", label: "Notification templates", icon: "templates" },
      { href: "/cancellation-policies", label: "Cancellation policies", icon: "policies" },
      { href: "/settings", label: "Settings", icon: "settings" },
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
