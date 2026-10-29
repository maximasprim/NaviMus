import { and, eq, isNull, schema, scopedInsert, withTenant, type Database } from "@travel/database";
import { encryptField, decryptField } from "@travel/auth";

export interface TravelerInput {
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiryDate?: string;
  phone?: string;
  email?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  dietaryRequirements?: string;
  accessibilityRequirements?: string;
}

/**
 * Section 31 (traveler management). Passport numbers are encrypted
 * with @travel/auth's encryptField/decryptField before ever reaching
 * the database - `passportNumberEncrypted` never holds plaintext,
 * matching the column's own doc comment in the schema. Decryption
 * only happens in `get`/`listForOwner`, i.e. when a specific owner is
 * explicitly reading their own data, never in a broader listing.
 */
export class TravelerRepository {
  private toRow(tenantId: string, ownerUserId: string, input: TravelerInput) {
    return scopedInsert(tenantId, {
      ownerUserId,
      firstName: input.firstName,
      lastName: input.lastName,
      dateOfBirth: input.dateOfBirth,
      gender: input.gender,
      nationality: input.nationality,
      passportNumberEncrypted: input.passportNumber ? encryptField(input.passportNumber) : undefined,
      passportExpiryDate: input.passportExpiryDate,
      phone: input.phone,
      email: input.email,
      emergencyContactName: input.emergencyContactName,
      emergencyContactPhone: input.emergencyContactPhone,
      dietaryRequirements: input.dietaryRequirements,
      accessibilityRequirements: input.accessibilityRequirements,
    });
  }

  private toSafeOutput(row: typeof schema.travelers.$inferSelect) {
    const { passportNumberEncrypted, ...rest } = row;
    return {
      ...rest,
      // Only ever exposed as a presence flag, never the decrypted value,
      // in a list response - the full number is available via `get`
      // (single traveler) only, and only to its owner.
      hasPassportOnFile: Boolean(passportNumberEncrypted),
    };
  }

  constructor(private readonly db: Database) {}

  async create(tenantId: string, ownerUserId: string, input: TravelerInput) {
    const [row] = await this.db.insert(schema.travelers).values(this.toRow(tenantId, ownerUserId, input)).returning();
    return this.toSafeOutput(row!);
  }

  async listForOwner(tenantId: string, ownerUserId: string) {
    const rows = await this.db
      .select()
      .from(schema.travelers)
      .where(withTenant(schema.travelers.tenantId, tenantId, eq(schema.travelers.ownerUserId, ownerUserId), isNull(schema.travelers.deletedAt)));
    return rows.map((r) => this.toSafeOutput(r));
  }

  /** Includes the decrypted passport number - only for the confirmed owner reading a single profile (e.g. to prefill checkout). */
  async getForOwner(tenantId: string, id: string, ownerUserId: string) {
    const [row] = await this.db
      .select()
      .from(schema.travelers)
      .where(withTenant(schema.travelers.tenantId, tenantId, eq(schema.travelers.id, id), eq(schema.travelers.ownerUserId, ownerUserId), isNull(schema.travelers.deletedAt)))
      .limit(1);
    if (!row) return null;
    const { passportNumberEncrypted, ...rest } = row;
    return {
      ...rest,
      passportNumber: passportNumberEncrypted ? decryptField(passportNumberEncrypted) : null,
    };
  }

  async update(tenantId: string, id: string, ownerUserId: string, input: Partial<TravelerInput>) {
    const patch: Record<string, unknown> = { ...input, updatedAt: new Date() };
    if (input.passportNumber !== undefined) {
      patch.passportNumberEncrypted = input.passportNumber ? encryptField(input.passportNumber) : null;
      delete patch.passportNumber;
    }
    const [row] = await this.db
      .update(schema.travelers)
      .set(patch)
      .where(withTenant(schema.travelers.tenantId, tenantId, eq(schema.travelers.id, id), eq(schema.travelers.ownerUserId, ownerUserId)))
      .returning();
    return row ? this.toSafeOutput(row) : null;
  }

  async softDelete(tenantId: string, id: string, ownerUserId: string) {
    await this.db
      .update(schema.travelers)
      .set({ deletedAt: new Date() })
      .where(withTenant(schema.travelers.tenantId, tenantId, eq(schema.travelers.id, id), eq(schema.travelers.ownerUserId, ownerUserId)));
  }
}
