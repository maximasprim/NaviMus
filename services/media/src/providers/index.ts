import { env } from "@travel/config";
import type { StorageProvider } from "./storage-provider.js";
import { SupabaseStorageProvider } from "./supabase-storage-provider.js";
import { MockStorageProvider } from "./mock-storage-provider.js";

let cached: StorageProvider | null = null;

/**
 * Resolves to Supabase when configured, falling back to the mock
 * provider otherwise (matches the pattern used for email/SMS/
 * WhatsApp providers elsewhere in the platform). Business logic
 * calls this instead of importing a concrete provider class.
 */
export function getStorageProvider(): StorageProvider {
  if (cached) return cached;
  cached = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? new SupabaseStorageProvider() : new MockStorageProvider();
  return cached;
}

export * from "./storage-provider.js";
