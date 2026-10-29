"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Add/rename/reorder your destination clips here - each `src` must
 * match a file you've placed in apps/web/public/videos/hero/. Keep
 * clips short (10-20s), compressed (H.264 mp4, ideally under ~5MB
 * each), and without audio (they're muted regardless, since autoplay
 * requires it in every browser - an audio track just wastes bandwidth).
 * `label` is documentation only (what each clip shows) - the whole
 * layer is aria-hidden as decorative background, so it's never read
 * out; it's here so this array stays legible as you add/reorder clips.
 *
 * Trim duplicates and keep this list to what you actually want in
 * rotation - six distinct clips is a good target.
 */
const VIDEOS = [
  { src: "/videos/hero/beach.mp4", label: "Coastal beach at sunrise" },
  { src: "/videos/hero/safari.mp4", label: "Safari plains at golden hour" },
  { src: "/videos/hero/park.mp4", label: "Nairobi National Park" },
  { src: "/videos/hero/mountain.mp4", label: "Highland peaks above the clouds" },
  { src: "/videos/hero/giraffe.mp4", label: "Giraffes on the savanna" },
  { src: "/videos/hero/city.mp4", label: "City skyline at dusk" },
  { src: "/videos/hero/camp.mp4", label: "Campsite in the wilderness" },
];

const SLIDE_SECONDS = 7;

// Must match the Tailwind `duration-[…ms]` class used on both <video>
// elements below. Kept as one constant so the JS timing that decides
// *when it's safe to swap a hidden video's source* can never drift out
// of sync with the CSS transition that's actually doing the fade.
const CROSSFADE_MS = 1500;

/**
 * Two-slot crossfade: exactly two <video> elements exist, "A" and
 * "B" - never one per clip. Whichever clip is showing plays in the
 * front slot; the *next* clip is already playing too, silently and
 * invisibly (opacity 0), in the back slot - not merely loaded, but
 * actually rendering frames, which is what makes the swap a real
 * crossfade rather than a pop. At each swap the slots trade places
 * (a CSS opacity transition does the fade).
 *
 * Once that fade finishes - not before - the slot that just became
 * the back one gets the clip after next loaded and started, so
 * there's always exactly one clip live ahead, regardless of how long
 * VIDEOS gets. Waiting for the fade to finish (rather than swapping
 * the source the instant the fade starts) is what stops the outgoing
 * clip from visibly jumping to unrelated footage partway through its
 * own fade-out.
 *
 * This is the fix for the earlier version, which mounted every clip
 * in VIDEOS with `autoPlay` at once - fine for 3-4 small clips, but
 * every additional clip was another concurrent decode, which is what
 * was hanging the tab at nine.
 *
 * Falls back to the existing bg-horizon-fade gradient if every clip
 * fails to load (e.g. files not dropped in yet), or if the visitor's
 * OS has "reduce motion" on - checked live via matchMedia, not just
 * once on mount, so it also reacts if they toggle it mid-visit.
 */
export function HeroVideoBackground({ videoUrls }: { videoUrls?: string[] } = {}) {
  // Clips the tenant listed in Admin -> Site content -> Home page replace the built-in rotation; with none listed
  // the built-in clips play exactly as before.
  const clips = videoUrls && videoUrls.length > 0 ? videoUrls.map((src) => ({ src, label: "Tenant hero clip" })) : VIDEOS;
  const [reducedMotion, setReducedMotion] = useState(false);
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [frontIsA, setFrontIsA] = useState(true);

  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const frontIsARef = useRef(true);
  const indexRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Bandwidth-friendly playback. Unknown until mounted (so the server render and first client render match), and
  // the video effect below waits for it so we never start downloading a clip we are about to drop.
  //  - Data-saver on, or a 2G connection: no video at all, just the gradient (same fallback as reduced motion).
  //  - Phone-sized screen: one clip, looping, instead of two playing at once for the crossfade - half the data.
  const [net, setNet] = useState({ ready: false, saveData: false, narrow: false });
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    setNet({
      ready: true,
      saveData: conn?.saveData === true || /(^|-)2g$/.test(conn?.effectiveType ?? ""),
      narrow: window.matchMedia("(max-width: 767px)").matches,
    });
  }, []);

  const available = clips.filter((v) => !failed.has(v.src));
  const playable = net.narrow ? available.slice(0, 1) : available;
  const showVideo = !reducedMotion && !net.saveData && playable.length > 0;

  function markFailed(src: string | null) {
    if (!src) return;
    setFailed((prev) => new Set(prev).add(src));
  }

  useEffect(() => {
    if (!showVideo || !net.ready) return;
    const a = videoARef.current;
    const b = videoBRef.current;
    if (!a || !b) return;

    indexRef.current = 0;
    frontIsARef.current = true;
    setFrontIsA(true);

    a.src = playable[0].src;
    a.load();
    a.play().catch(() => {});

    if (playable.length > 1) {
      // Starts playing immediately, silently, at opacity 0 - this is
      // the part that actually matters for smoothness. Merely
      // buffering it (calling .load() without .play()) leaves it with
      // no rendered frame until swap time, so toggling its opacity to
      // visible pops in a beat after .play() resolves rather than
      // blending two already-live videos.
      b.src = playable[1].src;
      b.load();
      b.play().catch(() => {});
    }

    if (playable.length < 2) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let prepTimer: ReturnType<typeof setTimeout> | undefined;

    function advance() {
      if (cancelled) return;
      const outgoing = frontIsARef.current ? videoARef.current : videoBRef.current;

      // `back` has already been playing silently since it was queued
      // up (see below and the initial setup above) - no play() call
      // needed here, it's already live. Swapping opacity now blends
      // two videos that are both genuinely rendering frames, which is
      // what makes this a real crossfade rather than a pop.
      frontIsARef.current = !frontIsARef.current;
      setFrontIsA(frontIsARef.current);

      const nextIndex = (indexRef.current + 2) % playable.length;
      indexRef.current = (indexRef.current + 1) % playable.length;

      // Don't touch `outgoing`'s source yet - it's mid fade-out (opacity
      // is still animating from 100% to 0% over CROSSFADE_MS) and is
      // still visibly showing the clip that was just live. Reassigning
      // its src now would yank the visible content to the *next-next*
      // clip's first frame partway through that fade, which is exactly
      // the flash/jump we're avoiding. Instead, wait for the fade to
      // actually finish - only then is it truly invisible and safe to
      // repurpose as the new hidden "on deck" slot.
      prepTimer = setTimeout(() => {
        if (cancelled || !outgoing) return;
        outgoing.src = playable[nextIndex].src;
        outgoing.load();
        outgoing.play().catch(() => {});
      }, CROSSFADE_MS);

      timer = setTimeout(advance, SLIDE_SECONDS * 1000);
    }

    timer = setTimeout(advance, SLIDE_SECONDS * 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (prepTimer) clearTimeout(prepTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showVideo, playable.length, net.ready]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {showVideo ? (
        <>
          <video
            ref={videoARef}
            muted
            loop
            playsInline
            aria-hidden="true"
            onError={(e) => markFailed(e.currentTarget.getAttribute("src"))}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out will-change-[opacity] ${
              frontIsA ? "opacity-100" : "opacity-0"
            }`}
          />
          <video
            ref={videoBRef}
            muted
            loop
            playsInline
            aria-hidden="true"
            onError={(e) => markFailed(e.currentTarget.getAttribute("src"))}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out will-change-[opacity] ${
              !frontIsA ? "opacity-100" : "opacity-0"
            }`}
          />
        </>
      ) : (
        <div className="absolute inset-0 bg-horizon-fade" aria-hidden="true" />
      )}

      {/* Dark wash so the headline/search stay legible over whatever's
          playing - heavier on the left where the text sits, lighter on
          the right so the footage still reads as footage. */}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-horizon/90 via-ink-horizon/55 to-ink-horizon/25" aria-hidden="true" />
      <div className="map-dots absolute inset-0 opacity-30" aria-hidden="true" />
    </div>
  );
}

// "use client";

// import { useEffect, useRef, useState } from "react";

// /**
//  * Add/rename/reorder your destination clips here - each `src` must
//  * match a file you've placed in apps/web/public/videos/hero/. Keep
//  * clips short (10-20s), compressed (H.264 mp4, ideally under ~5MB
//  * each), and without audio (they're muted regardless, since autoplay
//  * requires it in every browser - an audio track just wastes bandwidth).
//  * `label` is documentation only (what each clip shows) - the whole
//  * layer is aria-hidden as decorative background, so it's never read
//  * out; it's here so this array stays legible as you add/reorder clips.
//  *
//  * Trim duplicates and keep this list to what you actually want in
//  * rotation - six distinct clips is a good target.
//  */
// const VIDEOS = [
//   { src: "/videos/hero/beach.mp4", label: "Coastal beach at sunrise" },
//   { src: "/videos/hero/safari.mp4", label: "Safari plains at golden hour" },
//   { src: "/videos/hero/park.mp4", label: "Nairobi National Park" },
//   { src: "/videos/hero/mountain.mp4", label: "Highland peaks above the clouds" },
//   { src: "/videos/hero/giraffe.mp4", label: "Giraffes on the savanna" },
//   { src: "/videos/hero/city.mp4", label: "City skyline at dusk" },
//   { src: "/videos/hero/camp.mp4", label: "Campsite in the wilderness" },
// ];

// const SLIDE_SECONDS = 7;

// // Must match the Tailwind `duration-[…ms]` class used on both <video>
// // elements below. Kept as one constant so the JS timing that decides
// // *when it's safe to swap a hidden video's source* can never drift out
// // of sync with the CSS transition that's actually doing the fade.
// const CROSSFADE_MS = 1500;

// /**
//  * Two-slot crossfade: exactly two <video> elements exist, "A" and
//  * "B" - never one per clip. Whichever clip is showing plays in the
//  * front slot; the *next* clip is already playing too, silently and
//  * invisibly (opacity 0), in the back slot - not merely loaded, but
//  * actually rendering frames, which is what makes the swap a real
//  * crossfade rather than a pop. At each swap the slots trade places
//  * (a CSS opacity transition does the fade).
//  *
//  * Once that fade finishes - not before - the slot that just became
//  * the back one gets the clip after next loaded and started, so
//  * there's always exactly one clip live ahead, regardless of how long
//  * VIDEOS gets. Waiting for the fade to finish (rather than swapping
//  * the source the instant the fade starts) is what stops the outgoing
//  * clip from visibly jumping to unrelated footage partway through its
//  * own fade-out.
//  *
//  * This is the fix for the earlier version, which mounted every clip
//  * in VIDEOS with `autoPlay` at once - fine for 3-4 small clips, but
//  * every additional clip was another concurrent decode, which is what
//  * was hanging the tab at nine.
//  *
//  * Falls back to the existing bg-horizon-fade gradient if every clip
//  * fails to load (e.g. files not dropped in yet), or if the visitor's
//  * OS has "reduce motion" on - checked live via matchMedia, not just
//  * once on mount, so it also reacts if they toggle it mid-visit.
//  */
// export function HeroVideoBackground({ videoUrls }: { videoUrls?: string[] } = {}) {
//   // Clips the tenant listed in Admin -> Site content -> Home page replace the built-in rotation; with none listed
//   // the built-in clips play exactly as before.
//   const clips = videoUrls && videoUrls.length > 0 ? videoUrls.map((src) => ({ src, label: "Tenant hero clip" })) : VIDEOS;
//   const [reducedMotion, setReducedMotion] = useState(false);
//   const [failed, setFailed] = useState<Set<string>>(() => new Set());
//   const [frontIsA, setFrontIsA] = useState(true);

//   const videoARef = useRef<HTMLVideoElement>(null);
//   const videoBRef = useRef<HTMLVideoElement>(null);
//   const frontIsARef = useRef(true);
//   const indexRef = useRef(0);

//   useEffect(() => {
//     const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
//     setReducedMotion(mq.matches);
//     const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
//     mq.addEventListener("change", handler);
//     return () => mq.removeEventListener("change", handler);
//   }, []);

//   const playable = clips.filter((v) => !failed.has(v.src));
//   const showVideo = !reducedMotion && playable.length > 0;

//   function markFailed(src: string | null) {
//     if (!src) return;
//     setFailed((prev) => new Set(prev).add(src));
//   }

//   useEffect(() => {
//     if (!showVideo) return;
//     const a = videoARef.current;
//     const b = videoBRef.current;
//     if (!a || !b) return;

//     indexRef.current = 0;
//     frontIsARef.current = true;
//     setFrontIsA(true);

//     a.src = playable[0].src;
//     a.load();
//     a.play().catch(() => {});

//     if (playable.length > 1) {
//       // Starts playing immediately, silently, at opacity 0 - this is
//       // the part that actually matters for smoothness. Merely
//       // buffering it (calling .load() without .play()) leaves it with
//       // no rendered frame until swap time, so toggling its opacity to
//       // visible pops in a beat after .play() resolves rather than
//       // blending two already-live videos.
//       b.src = playable[1].src;
//       b.load();
//       b.play().catch(() => {});
//     }

//     if (playable.length < 2) return;

//     let cancelled = false;
//     let timer: ReturnType<typeof setTimeout>;
//     let prepTimer: ReturnType<typeof setTimeout> | undefined;

//     function advance() {
//       if (cancelled) return;
//       const outgoing = frontIsARef.current ? videoARef.current : videoBRef.current;

//       // `back` has already been playing silently since it was queued
//       // up (see below and the initial setup above) - no play() call
//       // needed here, it's already live. Swapping opacity now blends
//       // two videos that are both genuinely rendering frames, which is
//       // what makes this a real crossfade rather than a pop.
//       frontIsARef.current = !frontIsARef.current;
//       setFrontIsA(frontIsARef.current);

//       const nextIndex = (indexRef.current + 2) % playable.length;
//       indexRef.current = (indexRef.current + 1) % playable.length;

//       // Don't touch `outgoing`'s source yet - it's mid fade-out (opacity
//       // is still animating from 100% to 0% over CROSSFADE_MS) and is
//       // still visibly showing the clip that was just live. Reassigning
//       // its src now would yank the visible content to the *next-next*
//       // clip's first frame partway through that fade, which is exactly
//       // the flash/jump we're avoiding. Instead, wait for the fade to
//       // actually finish - only then is it truly invisible and safe to
//       // repurpose as the new hidden "on deck" slot.
//       prepTimer = setTimeout(() => {
//         if (cancelled || !outgoing) return;
//         outgoing.src = playable[nextIndex].src;
//         outgoing.load();
//         outgoing.play().catch(() => {});
//       }, CROSSFADE_MS);

//       timer = setTimeout(advance, SLIDE_SECONDS * 1000);
//     }

//     timer = setTimeout(advance, SLIDE_SECONDS * 1000);
//     return () => {
//       cancelled = true;
//       clearTimeout(timer);
//       if (prepTimer) clearTimeout(prepTimer);
//     };
//     // eslint-disable-next-line react-hooks/exhaustive-deps
//   }, [showVideo, playable.length]);

//   return (
//     <div className="absolute inset-0 overflow-hidden">
//       {showVideo ? (
//         <>
//           <video
//             ref={videoARef}
//             muted
//             loop
//             playsInline
//             aria-hidden="true"
//             onError={(e) => markFailed(e.currentTarget.getAttribute("src"))}
//             className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out will-change-[opacity] ${
//               frontIsA ? "opacity-100" : "opacity-0"
//             }`}
//           />
//           <video
//             ref={videoBRef}
//             muted
//             loop
//             playsInline
//             aria-hidden="true"
//             onError={(e) => markFailed(e.currentTarget.getAttribute("src"))}
//             className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-[1500ms] ease-in-out will-change-[opacity] ${
//               !frontIsA ? "opacity-100" : "opacity-0"
//             }`}
//           />
//         </>
//       ) : (
//         <div className="absolute inset-0 bg-horizon-fade" aria-hidden="true" />
//       )}

//       {/* Dark wash so the headline/search stay legible over whatever's
//           playing - heavier on the left where the text sits, lighter on
//           the right so the footage still reads as footage. */}
//       <div className="absolute inset-0 bg-gradient-to-r from-ink-horizon/90 via-ink-horizon/55 to-ink-horizon/25" aria-hidden="true" />
//       <div className="map-dots absolute inset-0 opacity-30" aria-hidden="true" />
//     </div>
//   );
// }