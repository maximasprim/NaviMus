import { randomUUID } from "node:crypto";
import { env } from "@travel/config";
import { ADMIN_ONLY_UPLOAD_CATEGORIES, buildCdnUrl, type RequestUploadUrlInput } from "@travel/validation";
import { AuthorizationError } from "@travel/types";
import { getStorageProvider } from "../providers/index.js";

function extensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
  };
  return map[contentType] ?? "bin";
}

export class MediaService {
  /**
   * Builds a namespaced storage key (tenantId/category/uploaderUserId/uuid.ext)
   * so objects are organized by tenant and never collide, then asks the
   * configured provider for a presigned upload URL. The server-generated
   * key - never a client-supplied path - is what closes off path
   * traversal or overwrite-another-tenant's-file risks entirely, rather
   * than needing to sanitize a client value. Leading with tenantId also
   * means a future "delete everything a suspended tenant uploaded" admin
   * operation is a simple prefix-based bulk delete, not a cross-reference
   * against every uploader's user id.
   */
  async requestUploadUrl(tenantId: string, input: RequestUploadUrlInput, uploaderUserId: string, roles: readonly string[] = []) {
    if (ADMIN_ONLY_UPLOAD_CATEGORIES.includes(input.category) && !roles.some((r) => r === "admin" || r === "super_admin")) {
      throw new AuthorizationError(`Only an admin can upload "${input.category}" files`);
    }
    const ext = extensionFromContentType(input.contentType);
    const storageKey = `${tenantId}/${input.category}/${uploaderUserId}/${randomUUID()}.${ext}`;

    const provider = getStorageProvider();
    const result = await provider.getUploadUrl(storageKey, input.contentType);

    return {
      ...result,
      publicUrl: this.publicUrlFor(storageKey),
    };
  }

  /** The CDN URL when MEDIA_CDN_URL is set, otherwise the storage provider's own public URL (unchanged behaviour). */
  private publicUrlFor(storageKey: string): string {
    return buildCdnUrl(env.MEDIA_CDN_URL, storageKey) ?? getStorageProvider().getPublicUrl(storageKey);
  }

  /**
   * No tenant check on read: a storage key only becomes knowable to a
   * caller once it's embedded somewhere they can already see it (a
   * destination photo, a package image) - recomputing its public URL
   * grants no new access, it's not itself an authorization boundary.
   * The boundary that matters is upload (who can mint a new key), which
   * requireAuth + the tenantId in requestUploadUrl above already cover.
   */
  getPublicUrl(storageKey: string): string {
    return this.publicUrlFor(storageKey);
  }

  async deleteObject(storageKey: string): Promise<void> {
    await getStorageProvider().deleteObject(storageKey);
  }
}
