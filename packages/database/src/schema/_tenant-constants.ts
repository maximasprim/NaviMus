/**
 * Split out from tenants.ts purely so _helpers.ts (which tenants.ts itself
 * depends on for idColumn/timestampColumns/softDeleteColumn) can reference
 * DEFAULT_TENANT_ID without a circular import between the two files.
 */
export const DEFAULT_TENANT_ID = "00000000-0000-0000-0000-000000000001";
export const DEFAULT_TENANT_SLUG = "default";
