import type { AccessRule } from "./access";

/**
 * Who may open each admin page. One table, used by BOTH the sidebar (which links to show) and the route guard
 * (which pages to open), so the two can never disagree. It mirrors what each page's API calls require
 * (the services' requireRoles / requirePermissions); the API remains the real enforcement.
 *
 * A rule matches if the person holds ANY listed role OR ANY listed permission. super_admin always matches.
 * `roles: []` therefore means "super_admin only". A path with no entry (e.g. /login) is not guarded.
 */
export const ROUTE_RULES: Record<string, AccessRule> = {
  "/": { roles: ["admin"] },
  "/tenants": { roles: [] },
  "/operators": { roles: ["admin", "travel_manager"] },
  "/users": { roles: ["admin"], permissions: ["user:manage"] },
  "/approvals": { roles: ["admin", "destination_manager", "travel_manager"] },
  "/bookings": { roles: ["admin", "travel_manager", "finance_manager", "customer_support"], permissions: ["booking:view"] },
  "/support": { roles: ["admin", "customer_support"], permissions: ["support:manage"] },
  "/moderation": { roles: ["admin", "customer_support"] },
  "/listings": { roles: ["admin", "destination_manager", "travel_manager"] },
  "/payments": { roles: ["admin", "finance_manager"] },
  "/invoices": { roles: ["admin", "finance_manager"] },
  "/reviews": { roles: ["admin", "customer_support"] },
  "/promotions": { roles: ["admin", "marketing_manager"] },
  "/audit-log": { roles: ["admin"] },
  "/site": { roles: ["admin"] },
  "/reference-data": { roles: ["admin", "destination_manager"] },
  "/notification-templates": { roles: ["admin", "marketing_manager"] },
  "/cancellation-policies": { roles: ["admin", "finance_manager"] },
  "/settings": { roles: ["admin"] },
};

/**
 * Things a person can DO on a page, which is sometimes narrower than who can open it
 * (e.g. a travel manager can see operators, but only an admin may approve or suspend them).
 */
export const ACTIONS = {
  /** Approve / reject / suspend operators. */
  manageOperators: { roles: ["admin"] },
  /** Approve or reject submitted destinations. */
  approveDestinations: { roles: ["admin", "destination_manager"] },
  /** Approve or reject submitted packages. */
  approvePackages: { roles: ["admin", "travel_manager"] },
  /** Add countries, regions, cities, categories and transfer locations. */
  editReferenceData: { roles: ["admin"] },
  editDestinations: { roles: ["admin", "destination_manager"] },
  editPackages: { roles: ["admin", "travel_manager"] },
  manageUsers: { roles: ["admin"], permissions: ["user:manage"] },
} satisfies Record<string, AccessRule>;

/** The rule for a URL path: the longest listed page that the path is, or sits under. "/" matches only itself. */
export function ruleForPath(pathname: string): AccessRule | undefined {
  if (pathname === "/") return ROUTE_RULES["/"];
  let best: string | undefined;
  for (const href of Object.keys(ROUTE_RULES)) {
    if (href === "/") continue;
    if (pathname === href || pathname.startsWith(`${href}/`)) {
      if (!best || href.length > best.length) best = href;
    }
  }
  return best ? ROUTE_RULES[best] : undefined;
}

/** Roles an admin can give someone. super_admin is offered to a platform admin only. */
export const ASSIGNABLE_ROLES = [
  "customer",
  "admin",
  "travel_manager",
  "destination_manager",
  "finance_manager",
  "customer_support",
  "marketing_manager",
  "tour_operator",
  "accommodation_provider",
  "transport_provider",
  "tour_guide",
] as const;
