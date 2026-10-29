"use client";

import { useRef, useState } from "react";
import { HERO_VIDEO_MAX_BYTES, uploadHeroVideo } from "@/lib/site-api";
import { GhostButton } from "./ui";

/**
 * "Upload a clip" button for the hero background list. Uploads one or more files straight to storage and hands
 * each resulting URL to `onUploaded`; it never edits the draft itself, so the normal Save step still applies.
 */
export function HeroVideoUpload({
  token,
  remaining,
  onUploaded,
}: {
  token: string;
  /** How many more clips the list can take. */
  remaining: number;
  onUploaded: (urls: string[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function onPick(files: FileList | null) {
    const picked = Array.from(files ?? []).slice(0, remaining);
    if (input.current) input.current.value = ""; // so choosing the same file again still fires onChange
    if (picked.length === 0) return;
    setBusy(true);
    setError(null);
    const urls: string[] = [];
    try {
      for (const file of picked) {
        setProgress(0);
        urls.push(await uploadHeroVideo(token, file, setProgress));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed. Please try again.");
    } finally {
      // Keep whatever finished before a failure.
      if (urls.length > 0) onUploaded(urls);
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="video/mp4,video/webm" multiple hidden onChange={(e) => void onPick(e.target.files)} />
      <div className="flex flex-wrap items-center gap-3">
        <GhostButton onClick={() => input.current?.click()} disabled={busy || remaining <= 0}>
          {busy ? `Uploading… ${Math.round(progress * 100)}%` : "⬆ Upload a clip"}
        </GhostButton>
        <span className="text-xs text-fog">MP4 or WebM, up to {HERO_VIDEO_MAX_BYTES / (1024 * 1024)}MB each. 10-15 seconds, no sound, works best.</span>
      </div>
      {error && (
        <p role="alert" className="text-sm text-plum">
          {error}
        </p>
      )}
    </div>
  );
}
