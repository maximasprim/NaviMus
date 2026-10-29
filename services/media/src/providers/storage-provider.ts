/**
 * Every storage backend (Supabase Storage now, S3/GCS later)
 * implements this. The Media service depends only on this
 * interface via getStorageProvider() - never on a concrete SDK
 * type - per the "keep storage providers behind interfaces" rule.
 *
 * The upload flow is presigned-URL-based rather than proxying
 * file bytes through our own API: the client uploads directly to
 * storage using the URL this returns, which keeps large files
 * (video, documents) off our request/response path entirely.
 */
export interface UploadUrlResult {
  uploadUrl: string;
  storageKey: string;
  /** Headers the client must include on the PUT/POST to the uploadUrl (varies by provider). */
  requiredHeaders?: Record<string, string>;
  expiresInSeconds: number;
}

export interface StorageProvider {
  readonly name: string;
  /** Generates a time-limited URL the client can upload directly to. */
  getUploadUrl(storageKey: string, contentType: string): Promise<UploadUrlResult>;
  /** Public (or signed, for private buckets) URL to retrieve an already-uploaded object. */
  getPublicUrl(storageKey: string): string;
  deleteObject(storageKey: string): Promise<void>;
}
