"use client";

import { createContext, useContext } from "react";

const SiteNameContext = createContext<string>("NaviMus");

/** Hands the tenant's site name (set in Admin -> Site content -> Brand) to client components such as the booking ticket. */
export function SiteBrandProvider({ siteName, children }: { siteName: string; children: React.ReactNode }) {
  return <SiteNameContext.Provider value={siteName}>{children}</SiteNameContext.Provider>;
}

export function useSiteName(): string {
  return useContext(SiteNameContext);
}
