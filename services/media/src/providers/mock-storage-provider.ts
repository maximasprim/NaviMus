import { createServiceLogger } from "@travel/logger";
import type { StorageProvider, UploadUrlResult } from "./storage-provider.js";

const logger = createServiceLogger("media-mock-provider");

/**
 * Dev/CI fallback when SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY
 * aren't set. Returns a URL that isn't actually uploadable - good
 * enough to exercise the request/response contract and let the
 * frontend build against a stable shape, but callers should not
 * expect a real file to exist afterward. Never used in production
 * (see getStorageProvider's selection logic).
 */
export class MockStorageProvider implements StorageProvider {
  readonly name = "mock";

  async getUploadUrl(storageKey: string, contentType: string): Promise<UploadUrlResult> {
    logger.info({ storageKey, contentType }, "[mock] would issue a signed upload URL");
    return {
      uploadUrl: `https://mock-storage.local/upload/${storageKey}`,
      storageKey,
      requiredHeaders: { "Content-Type": contentType },
      expiresInSeconds: 300,
    };
  }

  getPublicUrl(storageKey: string): string {
    return `https://mock-storage.local/public/${storageKey}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    logger.info({ storageKey }, "[mock] would delete object");
  }
}
