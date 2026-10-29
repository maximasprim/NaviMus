#!/usr/bin/env bash
# Prepares a clip for the storefront hero background: 1080p max, H.264, no audio, web-optimised (faststart),
# ~10-15s. Usage: scripts/encode-hero-video.sh input.mov [output.mp4] [max-seconds]
# Aim for 2-4MB; the upload limit is 15MB. Needs ffmpeg.
set -euo pipefail

in="${1:?usage: $0 input [output.mp4] [max-seconds]}"
out="${2:-${in%.*}-hero.mp4}"
secs="${3:-12}"

command -v ffmpeg >/dev/null || { echo "ffmpeg is not installed" >&2; exit 1; }

ffmpeg -y -i "$in" -t "$secs" -an \
  -vf "scale='min(1920,iw)':-2" \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 26 -preset slow \
  -movflags +faststart "$out"

size=$(wc -c < "$out")
echo "Wrote $out ($((size / 1024)) KB)"
if [ "$size" -gt $((15 * 1024 * 1024)) ]; then
  echo "Warning: over the 15MB upload limit - raise -crf (e.g. 30) or shorten the clip." >&2
fi
