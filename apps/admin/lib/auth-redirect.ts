/**
 * Where to go after signing in. Only same-site relative paths are accepted, so a crafted
 * /login?next=https://evil.example (or //evil.example) can never bounce someone off-site.
 */
export function safeNextPath(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f]/.test(raw)) return fallback;
  if (raw === "/login" || raw.startsWith("/login?") || raw.startsWith("/login/")) return fallback;
  return raw;
}
