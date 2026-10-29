import { env } from "@travel/config";
import { ExternalServiceError, PaymentError } from "@travel/types";
import type { StorageProvider, UploadUrlResult } from "./storage-provider.js";

const SIGNED_UPLOAD_TTL_SECONDS = 300; // 5 minutes - long enough for a real upload, short enough to limit exposure

interface SupabaseSignedUploadResponse {
  url: string; // relative path Supabase returns; combined with SUPABASE_URL below
  token: string;
}

export class SupabaseStorageProvider implements StorageProvider {
  readonly name = "supabase";

  private requireConfig() {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new PaymentError("Supabase Storage is not configured on this environment");
    }
  }

  async getUploadUrl(storageKey: string, contentType: string): Promise<UploadUrlResult> {
    this.requireConfig();

    const res = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/upload/sign/${env.STORAGE_BUCKET}/${storageKey}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: SIGNED_UPLOAD_TTL_SECONDS }),
      }
    );
    if (!res.ok) {
      throw new ExternalServiceError("Supabase Storage", `Failed to create signed upload URL (${res.status})`);
    }
    const data = (await res.json()) as SupabaseSignedUploadResponse;

    return {
      uploadUrl: `${env.SUPABASE_URL}/storage/v1${data.url}`,
      storageKey,
      requiredHeaders: { "Content-Type": contentType },
      expiresInSeconds: SIGNED_UPLOAD_TTL_SECONDS,
    };
  }

  getPublicUrl(storageKey: string): string {
    this.requireConfig();
    return `${env.SUPABASE_URL}/storage/v1/object/public/${env.STORAGE_BUCKET}/${storageKey}`;
  }

  async deleteObject(storageKey: string): Promise<void> {
    this.requireConfig();
    const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${env.STORAGE_BUCKET}/${storageKey}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
    });
    if (!res.ok && res.status !== 404) {
      throw new ExternalServiceError("Supabase Storage", `Failed to delete object (${res.status})`);
    }
  }
}
