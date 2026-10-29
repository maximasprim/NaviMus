import { describe, it, expect, vi, beforeEach } from "vitest";
import { ConflictError, NotFoundError } from "@travel/types";
import { TenantService } from "./tenant-service.js";
import type { TenantRepository } from "../repositories/tenant-repository.js";
import type { AdminOperationsRepository } from "../repositories/admin-operations-repository.js";
import type { MetricsRepository } from "../repositories/metrics-repository.js";
import type { AuthService } from "@travel/service-auth/internal";
import type { Database } from "@travel/database";

vi.mock("../domain-verification.js", () => ({
  VERIFICATION_SUBDOMAIN: "_NaviMus-verify",
  generateVerificationToken: () => "NaviMus-verify=test-token",
  verifyDomainOwnership: vi.fn(),
}));
vi.mock("@travel/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@travel/database")>();
  return { ...actual, getTenantUsageSnapshot: vi.fn() };
});

import { verifyDomainOwnership } from "../domain-verification.js";
import { getTenantUsageSnapshot } from "@travel/database";

beforeEach(() => {
  vi.clearAllMocks();
});

function tenant(overrides: Record<string, unknown> = {}) {
  return {
    id: "tenant-1",
    name: "Acme Travel",
    slug: "acme-travel",
    status: "active",
    settings: null,
    customDomain: null,
    customDomainVerifiedAt: null,
    planId: null,
    ownerUserId: "owner-1",
    createdAt: new Date("2026-01-01"),
    deletedAt: null,
    ...overrides,
  };
}

function fakeTenants(overrides: Partial<Record<keyof TenantRepository, unknown>> = {}): TenantRepository {
  return {
    findById: vi.fn().mockResolvedValue(tenant()),
    findBySlug: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockResolvedValue(tenant()),
    setOwner: vi.fn(),
    list: vi.fn().mockResolvedValue({ items: [tenant()], total: 1 }),
    update: vi.fn().mockResolvedValue(tenant()),
    suspend: vi.fn().mockResolvedValue(tenant({ status: "suspended" })),
    reactivate: vi.fn().mockResolvedValue(tenant({ status: "active" })),
    setCustomDomain: vi.fn().mockResolvedValue(tenant({ customDomain: "acmetravel.com" })),
    markCustomDomainVerified: vi.fn(),
    clearCustomDomain: vi.fn(),
    deleteIfNoOwner: vi.fn(),
    listPlans: vi.fn().mockResolvedValue([]),
    findPlanById: vi.fn().mockResolvedValue({ id: "plan-1", code: "starter" }),
    assignPlan: vi.fn().mockResolvedValue(tenant({ planId: "plan-1" })),
    hardDelete: vi.fn(),
    exportData: vi.fn().mockResolvedValue({ tenant: tenant() }),
    ...overrides,
  } as unknown as TenantRepository;
}

function fakeAuth(overrides: Record<string, unknown> = {}): AuthService {
  return {
    createTenantOwner: vi.fn().mockResolvedValue({ userId: "owner-1" }),
    ...overrides,
  } as unknown as AuthService;
}

function fakeOps(overrides: Record<string, unknown> = {}): AdminOperationsRepository {
  return {
    writeAuditLog: vi.fn(),
    ...overrides,
  } as unknown as AdminOperationsRepository;
}

function fakeMetrics(overrides: Record<string, unknown> = {}): MetricsRepository {
  return {
    getActiveCounts: vi.fn().mockResolvedValue({ activeDestinations: 0, activePackages: 0, activeOperators: 0 }),
    getBookingCounts: vi.fn().mockResolvedValue({ total: 0, byStatus: {} }),
    ...overrides,
  } as unknown as MetricsRepository;
}

const fakeDb = {} as Database;

function buildService(overrides: {
  tenants?: TenantRepository;
  auth?: AuthService;
  ops?: AdminOperationsRepository;
  metrics?: MetricsRepository;
} = {}) {
  return new TenantService(
    overrides.tenants ?? fakeTenants(),
    overrides.auth ?? fakeAuth(),
    overrides.ops ?? fakeOps(),
    overrides.metrics ?? fakeMetrics(),
    fakeDb
  );
}

const CREATE_INPUT = {
  name: "Acme Travel",
  ownerEmail: "owner@acme.test",
  ownerPassword: "Sup3r-Secret!",
  ownerFirstName: "Ada",
  ownerLastName: "Lovelace",
};

describe("TenantService.createTenant", () => {
  it("creates the tenant and its owner, and audits with the given actor", async () => {
    const tenants = fakeTenants();
    const auth = fakeAuth();
    const ops = fakeOps();
    const service = buildService({ tenants, auth, ops });

    const result = await service.createTenant(CREATE_INPUT, "super-admin-1");

    expect(tenants.create).toHaveBeenCalledWith({ name: "Acme Travel", slug: "acme-travel", status: undefined });
    expect(auth.createTenantOwner).toHaveBeenCalledWith("tenant-1", expect.objectContaining({ email: "owner@acme.test" }));
    expect(tenants.setOwner).toHaveBeenCalledWith("tenant-1", "owner-1");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ actorUserId: "super-admin-1", action: "tenant.created", tenantId: null })
    );
    expect(result.ownerUserId).toBe("owner-1");
  });

  it("rejects a slug that's already taken", async () => {
    const tenants = fakeTenants({ findBySlug: vi.fn().mockResolvedValue(tenant()) });
    const service = buildService({ tenants });

    await expect(service.createTenant(CREATE_INPUT, "super-admin-1")).rejects.toThrow(ConflictError);
    expect(tenants.create).not.toHaveBeenCalled();
  });

  it("cleans up the orphaned tenant if creating the owner user fails", async () => {
    const tenants = fakeTenants();
    const auth = fakeAuth({ createTenantOwner: vi.fn().mockRejectedValue(new Error("db exploded")) });
    const service = buildService({ tenants, auth });

    await expect(service.createTenant(CREATE_INPUT, "super-admin-1")).rejects.toThrow("db exploded");
    expect(tenants.deleteIfNoOwner).toHaveBeenCalledWith("tenant-1");
  });
});

describe("TenantService.signUp", () => {
  it("creates a trial tenant and audits the new owner as the actor, not an empty string", async () => {
    const tenants = fakeTenants();
    const ops = fakeOps();
    const service = buildService({ tenants, ops });

    await service.signUp(CREATE_INPUT);

    expect(tenants.create).toHaveBeenCalledWith(expect.objectContaining({ status: "trial" }));
    expect(ops.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "tenant.self_signup", actorUserId: "owner-1" })
    );
  });
});

describe("TenantService.suspendTenant / reactivateTenant", () => {
  it("suspends and audits with the reason", async () => {
    const tenants = fakeTenants();
    const ops = fakeOps();
    const service = buildService({ tenants, ops });

    const result = await service.suspendTenant("tenant-1", "Non-payment", "admin-1");

    expect(tenants.suspend).toHaveBeenCalledWith("tenant-1", "Non-payment");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.suspended" }));
    expect(result.status).toBe("suspended");
  });

  it("throws NotFoundError for a tenant that doesn't exist", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(null) });
    const service = buildService({ tenants });

    await expect(service.suspendTenant("missing", undefined, "admin-1")).rejects.toThrow(NotFoundError);
  });
});

describe("TenantService.requestCustomDomain", () => {
  it("claims the domain and returns the DNS record to publish", async () => {
    const tenants = fakeTenants();
    const service = buildService({ tenants });

    const result = await service.requestCustomDomain("tenant-1", "AcmeTravel.com", "admin-1");

    expect(tenants.setCustomDomain).toHaveBeenCalledWith("tenant-1", "acmetravel.com", "NaviMus-verify=test-token");
    expect(result.verified).toBe(false);
    expect(result.dnsRecord).toEqual({ type: "TXT", name: "_NaviMus-verify.acmetravel.com", value: "NaviMus-verify=test-token" });
  });

  it("surfaces a friendly conflict when the domain is already claimed", async () => {
    const dbError = Object.assign(new Error("duplicate key"), { code: "23505" });
    const tenants = fakeTenants({ setCustomDomain: vi.fn().mockRejectedValue(dbError) });
    const service = buildService({ tenants });

    await expect(service.requestCustomDomain("tenant-1", "taken.com", "admin-1")).rejects.toThrow(ConflictError);
  });
});

describe("TenantService.verifyCustomDomain", () => {
  it("rejects when no domain has been requested yet", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(tenant({ customDomain: null })) });
    const service = buildService({ tenants });

    await expect(service.verifyCustomDomain("tenant-1", "admin-1")).rejects.toThrow(ConflictError);
  });

  it("returns verified:false without marking anything when the DNS record isn't found yet", async () => {
    const tenants = fakeTenants({
      findById: vi.fn().mockResolvedValue(
        tenant({ customDomain: "acmetravel.com", settings: { customDomainVerificationToken: "NaviMus-verify=abc" } })
      ),
    });
    vi.mocked(verifyDomainOwnership).mockResolvedValueOnce(false);
    const service = buildService({ tenants });

    const result = await service.verifyCustomDomain("tenant-1", "admin-1");

    expect(result.verified).toBe(false);
    expect(tenants.markCustomDomainVerified).not.toHaveBeenCalled();
  });

  it("marks verified and audits once the DNS record matches", async () => {
    const tenants = fakeTenants({
      findById: vi.fn().mockResolvedValue(
        tenant({ customDomain: "acmetravel.com", settings: { customDomainVerificationToken: "NaviMus-verify=abc" } })
      ),
    });
    const ops = fakeOps();
    vi.mocked(verifyDomainOwnership).mockResolvedValueOnce(true);
    const service = buildService({ tenants, ops });

    const result = await service.verifyCustomDomain("tenant-1", "admin-1");

    expect(result.verified).toBe(true);
    expect(tenants.markCustomDomainVerified).toHaveBeenCalledWith("tenant-1");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.custom_domain.verified" }));
  });

  it("short-circuits without a new DNS lookup if already verified", async () => {
    const tenants = fakeTenants({
      findById: vi.fn().mockResolvedValue(tenant({ customDomain: "acmetravel.com", customDomainVerifiedAt: new Date() })),
    });
    const service = buildService({ tenants });

    const result = await service.verifyCustomDomain("tenant-1", "admin-1");

    expect(result.verified).toBe(true);
    expect(verifyDomainOwnership).not.toHaveBeenCalled();
  });
});

describe("TenantService.assignPlan", () => {
  it("rejects an unknown plan id", async () => {
    const tenants = fakeTenants({ findPlanById: vi.fn().mockResolvedValue(null) });
    const service = buildService({ tenants });

    await expect(service.assignPlan("tenant-1", "no-such-plan", "super-admin-1")).rejects.toThrow(NotFoundError);
  });

  it("assigns the plan and audits it at the platform level", async () => {
    const tenants = fakeTenants();
    const ops = fakeOps();
    const service = buildService({ tenants, ops });

    await service.assignPlan("tenant-1", "plan-1", "super-admin-1");

    expect(tenants.assignPlan).toHaveBeenCalledWith("tenant-1", "plan-1");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null, action: "tenant.plan_assigned" }));
  });

  it("allows clearing a plan with null", async () => {
    const tenants = fakeTenants();
    const service = buildService({ tenants });

    await service.assignPlan("tenant-1", null, "super-admin-1");

    expect(tenants.findPlanById).not.toHaveBeenCalled();
    expect(tenants.assignPlan).toHaveBeenCalledWith("tenant-1", null);
  });
});

describe("TenantService.hardDelete", () => {
  it("refuses to delete a tenant that isn't suspended", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(tenant({ status: "active" })) });
    const service = buildService({ tenants });

    await expect(service.hardDelete("tenant-1", "acme-travel", "super-admin-1")).rejects.toThrow(ConflictError);
    expect(tenants.hardDelete).not.toHaveBeenCalled();
  });

  it("refuses when the confirmation slug doesn't match", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(tenant({ status: "suspended" })) });
    const service = buildService({ tenants });

    await expect(service.hardDelete("tenant-1", "wrong-slug", "super-admin-1")).rejects.toThrow(ConflictError);
    expect(tenants.hardDelete).not.toHaveBeenCalled();
  });

  it("deletes and writes a platform-level (tenantId: null) audit entry once suspended and confirmed", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(tenant({ status: "suspended" })) });
    const ops = fakeOps();
    const service = buildService({ tenants, ops });

    await service.hardDelete("tenant-1", "acme-travel", "super-admin-1");

    expect(tenants.hardDelete).toHaveBeenCalledWith("tenant-1");
    expect(ops.writeAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: null, action: "tenant.deleted", actorUserId: "super-admin-1" })
    );
  });
});

describe("TenantService.exportData", () => {
  it("throws for a missing tenant", async () => {
    const tenants = fakeTenants({ findById: vi.fn().mockResolvedValue(null) });
    const service = buildService({ tenants });

    await expect(service.exportData("missing")).rejects.toThrow(NotFoundError);
  });

  it("delegates to the repository once the tenant is confirmed to exist", async () => {
    const tenants = fakeTenants();
    const service = buildService({ tenants });

    await service.exportData("tenant-1");

    expect(tenants.exportData).toHaveBeenCalledWith(tenant());
  });
});

describe("TenantService.getUsage", () => {
  it("delegates to the shared usage-snapshot helper with the service's own db", async () => {
    vi.mocked(getTenantUsageSnapshot).mockResolvedValueOnce({
      plan: { planId: null, planCode: null, planName: null, maxOperators: null, maxStaffUsers: null, maxBookingsPerMonth: null, commissionRatePercent: null },
      usage: { bookingsThisMonth: 0, activeOperators: 0, staffUsers: 0 },
      atLimit: { bookingsThisMonth: false, activeOperators: false, staffUsers: false },
    });
    const service = buildService();

    const result = await service.getUsage("tenant-1");

    expect(getTenantUsageSnapshot).toHaveBeenCalledWith(fakeDb, "tenant-1");
    expect(result.usage.bookingsThisMonth).toBe(0);
  });
});
