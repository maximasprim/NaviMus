import { describe, expect, it } from "vitest";
import {
  ADMIN_ONLY_UPLOAD_CATEGORIES,
  buildCdnUrl,
  collectAllowedVideoHosts,
  isAllowedVideoUrl,
  requestUploadUrlSchema,
} from "./media.js";

const MB = 1024 * 1024;
const req = (over: Record<string, unknown>) =>
  requestUploadUrlSchema.safeParse({ category: "hero_video", fileName: "clip.mp4", contentType: "video/mp4", sizeBytes: 5 * MB, ...over });

describe("requestUploadUrlSchema: hero_video", () => {
  it("accepts an MP4 or WebM within the cap", () => {
    expect(req({}).success).toBe(true);
    expect(req({ contentType: "video/webm" }).success).toBe(true);
    expect(req({ sizeBytes: 15 * MB }).success).toBe(true);
  });

  it("rejects a hero clip over 15MB even though other categories allow up to 50MB", () => {
    expect(req({ sizeBytes: 15 * MB + 1 }).success).toBe(false);
    expect(req({ category: "destination_video", sizeBytes: 40 * MB }).success).toBe(true);
  });

  it("rejects images, documents and other types for a video category", () => {
    expect(req({ contentType: "image/png" }).success).toBe(false);
    expect(req({ contentType: "application/pdf" }).success).toBe(false);
    expect(req({ contentType: "video/quicktime" }).success).toBe(false);
  });

  it("leaves the existing categories' rules unchanged", () => {
    expect(req({ category: "package_image", contentType: "image/webp", sizeBytes: 49 * MB }).success).toBe(true);
    expect(req({ category: "package_image", contentType: "video/mp4" }).success).toBe(false);
    expect(req({ category: "invoice", contentType: "application/pdf" }).success).toBe(true);
    expect(req({ category: "invoice", sizeBytes: 51 * MB, contentType: "application/pdf" }).success).toBe(false);
  });

  it("is admin-only", () => {
    expect(ADMIN_ONLY_UPLOAD_CATEGORIES).toContain("hero_video");
    expect(ADMIN_ONLY_UPLOAD_CATEGORIES).not.toContain("review_image");
  });
});

describe("buildCdnUrl", () => {
  it("is null without a CDN so callers keep the storage provider's own URL", () => {
    expect(buildCdnUrl(undefined, "t/a.mp4")).toBeNull();
    expect(buildCdnUrl("", "t/a.mp4")).toBeNull();
    expect(buildCdnUrl("   ", "t/a.mp4")).toBeNull();
  });
  it("joins base and key with exactly one slash", () => {
    expect(buildCdnUrl("https://media.example.com", "t/a.mp4")).toBe("https://media.example.com/t/a.mp4");
    expect(buildCdnUrl("https://media.example.com/", "/t/a.mp4")).toBe("https://media.example.com/t/a.mp4");
    expect(buildCdnUrl("https://media.example.com/m//", "t/a.mp4")).toBe("https://media.example.com/m/t/a.mp4");
  });
});

describe("video host allowlist", () => {
  it("collects hosts from URLs, bare hosts and comma lists; ignores blanks and junk", () => {
    expect(collectAllowedVideoHosts("https://abc.supabase.co/storage/v1", undefined, "cdn.example.com, ,https://Media.Example.com/x", "not a url ::")).toEqual([
      "abc.supabase.co",
      "cdn.example.com",
      "media.example.com",
    ]);
    expect(collectAllowedVideoHosts(undefined, "")).toEqual([]);
  });

  it("allows only https URLs on an exact allowed host", () => {
    const hosts = ["abc.supabase.co"];
    expect(isAllowedVideoUrl("https://abc.supabase.co/storage/v1/object/public/b/x.mp4", hosts)).toBe(true);
    expect(isAllowedVideoUrl("http://abc.supabase.co/x.mp4", hosts)).toBe(false);
    expect(isAllowedVideoUrl("https://evil.com/abc.supabase.co/x.mp4", hosts)).toBe(false);
    expect(isAllowedVideoUrl("https://abc.supabase.co.evil.com/x.mp4", hosts)).toBe(false);
    expect(isAllowedVideoUrl("https://evil.com@abc.supabase.co/x.mp4", hosts)).toBe(true); // userinfo form: the host really is abc.supabase.co
    expect(isAllowedVideoUrl("not a url", hosts)).toBe(false);
  });
});
