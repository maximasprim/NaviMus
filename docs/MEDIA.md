# Media storage: hero videos (and other uploads)

Uploaded files go **straight from the browser to Supabase Storage** using a short-lived signed URL; the API
only issues the URL (`POST /api/v1/media/upload-url`). Nothing is stored in git or `apps/web/public`.

```
Admin console ──(1) ask for upload URL──► API (admin/super_admin only for hero_video)
      │                                      └─► Supabase: signed upload URL
      └──(2) PUT the file──────────────────► Supabase Storage bucket  ◄── visitors load it (optionally via a CDN)
```

Keys look like `<tenantId>/hero_video/<userId>/<uuid>.mp4`. They are unique per upload, so a replaced video gets a
new URL and old cached copies can never be served stale.

## One-time setup (Supabase)

1. Storage -> create a bucket named like `STORAGE_BUCKET` (default `travel-platform-media`), **Public**.
2. Bucket settings: set a file size limit (50MB matches the API's ceiling; the API enforces 15MB for hero clips,
   but the bucket is the real enforcement point) and restrict allowed MIME types to the ones you use
   (`video/mp4, video/webm, image/jpeg, image/png, image/webp, image/avif, application/pdf`).
3. Make sure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set for the API (server only, never in a browser env).

Then Admin -> Site content -> Home page -> Background video -> **Upload a clip**.

## Preparing clips

`scripts/encode-hero-video.sh clip.mov` -> 1080p max, H.264, no audio, faststart, 12s. Aim for 2-4MB each.
Muted loops of 10-15 seconds are what the player is built for.

## Optional: a CDN in front (faster for visitors far from Supabase's region)

Supabase serves public files with some caching, which is fine to start with. If first loads feel slow or you
outgrow the plan's bandwidth, put a CDN in front, **then** set:

```
MEDIA_CDN_URL=https://media.example.com
```

The API then returns `https://media.example.com/<key>` instead of the Supabase URL. The CDN host must serve the
bucket's public objects at the same path. Existing saved links are not rewritten; they keep working.
New video links are only accepted from the Supabase host, the CDN host and `MEDIA_ALLOWED_VIDEO_HOSTS`.

Example Cloudflare Worker for `media.example.com` (route the hostname to it; **an untested template** - try it
with one clip, including seeking, before relying on it):

```js
export default {
  async fetch(req, env) {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const path = new URL(req.url).pathname;
    const headers = new Headers();
    if (req.headers.get("range")) headers.set("range", req.headers.get("range")); // video seeking
    return fetch(`${env.SUPABASE_URL}/storage/v1/object/public/${env.BUCKET}${path}`, {
      method: req.method,
      headers,
      cf: { cacheEverything: true, cacheTtl: 31536000 }, // keys are unique per upload, so long caching is safe
    });
  },
};
```

Cloudflare R2 is the alternative if bandwidth cost matters: add an R2 `StorageProvider` next to the Supabase one
(`services/media/src/providers`); nothing else in the app changes.

## Behaviour notes

- Only tenant admins can request hero-video upload URLs; customers cannot.
- Saving site content rejects NEW hero-video links from other hosts (existing links keep working). With no
  Supabase/CDN configured (local dev) nothing is restricted.
- The player shows only the gradient with Data Saver on or on 2G, and plays a single clip on phone-sized screens.
- The built-in default clips are expected in `apps/web/public/videos/hero/` (`beach.mp4`, `safari.mp4`, ...); that
  folder is empty in the project you shared, so tenants without their own clips currently see the gradient.
