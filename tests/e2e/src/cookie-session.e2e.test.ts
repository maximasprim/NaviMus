import { describe, expect, it } from "vitest";
import { BASE_URL, TENANT_SLUG } from "./client.js";
import { SEED_CUSTOMER_EMAIL, SEED_PASSWORD } from "./fixtures.js";

/**
 * Browser-style sessions: httpOnly cookies instead of tokens in JS-readable
 * storage. Drives the real gateway with a minimal cookie jar, exactly as the
 * Next.js proxy does on a browser's behalf.
 */
type Jar = Record<string, string>;

function absorb(jar: Jar, res: Response) {
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(";");
    const [name, ...rest] = pair!.split("=");
    const value = rest.join("=");
    const maxAge0 = /max-age=0/i.test(line) || value === "";
    if (maxAge0) delete jar[name!.trim()];
    else jar[name!.trim()] = value;
  }
}
const cookieHeader = (jar: Jar, only?: string[]) =>
  Object.entries(jar)
    .filter(([k]) => !only || only.includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

async function call(path: string, opts: { method?: string; jar?: Jar; headers?: Record<string, string>; body?: unknown; cookieMode?: boolean; csrf?: boolean } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", "x-tenant-slug": TENANT_SLUG, ...opts.headers };
  if (opts.cookieMode) headers["X-Auth-Mode"] = "cookie";
  if (opts.csrf) headers["X-Requested-With"] = "travel-web";
  // Path-scoped cookies: the refresh cookie is only sent to /api/v1/auth*, like a real browser.
  if (opts.jar) {
    const c = cookieHeader(opts.jar, path.startsWith("/api/v1/auth") ? undefined : ["travel_at"]);
    if (c) headers.Cookie = c;
  }
  const res = await fetch(`${BASE_URL}${path}`, { method: opts.method ?? "GET", headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
  if (opts.jar) absorb(opts.jar, res);
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { res, status: res.status, json, text };
}

const creds = { email: SEED_CUSTOMER_EMAIL, password: SEED_PASSWORD };
const loginCookie = async () => {
  const jar: Jar = {};
  const r = await call("/api/v1/auth/login", { method: "POST", body: creds, jar, cookieMode: true, csrf: true });
  return { jar, r };
};

describe("cookie sessions", () => {
  it("login sets httpOnly cookies and puts NO token in the response body", async () => {
    const { jar, r } = await loginCookie();
    expect(r.status).toBe(200);
    expect(r.json.data).toEqual({ authenticated: true });
    expect(r.text).not.toMatch(/eyJ/); // no JWT anywhere in the body
    const lines = r.res.headers.getSetCookie();
    const at = lines.find((l) => l.startsWith("travel_at="))!;
    const rt = lines.find((l) => l.startsWith("travel_rt="))!;
    expect(at).toMatch(/HttpOnly/i);
    expect(at).toMatch(/SameSite=Lax/i);
    expect(at).toMatch(/Path=\/(;|$)/);
    expect(rt).toMatch(/HttpOnly/i);
    expect(rt).toMatch(/Path=\/api\/v1\/auth/i); // refresh token only travels to the auth endpoints
    expect(jar.travel_at && jar.travel_rt).toBeTruthy();
  });

  it("the cookie alone authenticates reads", async () => {
    const { jar } = await loginCookie();
    const me = await call("/api/v1/auth/me", { jar });
    expect(me.status).toBe(200);
    expect(me.json.data.email).toBe(SEED_CUSTOMER_EMAIL);
  });

  it("CSRF: a cookie-authenticated WRITE without the custom header is refused; with it, accepted", async () => {
    const { jar } = await loginCookie();
    const noHeader = await call("/api/v1/auth/email/resend-verification", { method: "POST", jar });
    expect(noHeader.status).toBe(403);
    expect(noHeader.json.error.message).toMatch(/CSRF/i);
    const withHeader = await call("/api/v1/auth/email/resend-verification", { method: "POST", jar, csrf: true });
    expect(withHeader.status).not.toBe(403);
  });

  it("Bearer tokens still work for API clients, with no CSRF header needed", async () => {
    const r = await call("/api/v1/auth/login", { method: "POST", body: creds });
    expect(r.json.data.accessToken).toBeTruthy(); // default (non-cookie) mode unchanged
    const post = await call("/api/v1/auth/email/resend-verification", { method: "POST", headers: { Authorization: `Bearer ${r.json.data.accessToken}` } });
    expect(post.status).not.toBe(401);
    expect(post.status).not.toBe(403);
  });

  it("a refresh token is not accepted as an access token", async () => {
    const r = await call("/api/v1/auth/login", { method: "POST", body: creds });
    const me = await call("/api/v1/auth/me", { headers: { Authorization: `Bearer ${r.json.data.refreshToken}` } });
    expect(me.status).toBe(401);
  });

  it("refresh via cookie ROTATES both cookies, and the new session works", async () => {
    const { jar } = await loginCookie();
    const oldRt = jar.travel_rt;
    const ref = await call("/api/v1/auth/refresh", { method: "POST", jar, cookieMode: true, csrf: true });
    expect(ref.status).toBe(200);
    expect(jar.travel_rt).not.toBe(oldRt);
    expect((await call("/api/v1/auth/me", { jar })).status).toBe(200);
  });

  it("logout ends the session SERVER-SIDE: the old refresh token no longer works", async () => {
    const { jar } = await loginCookie();
    const stolenRt = jar.travel_rt!;
    const out = await call("/api/v1/auth/logout", { method: "POST", jar, cookieMode: true, csrf: true });
    expect(out.status).toBe(200);
    expect(jar.travel_at).toBeUndefined(); // cookies cleared
    expect(jar.travel_rt).toBeUndefined();
    // an attacker (or the user's other tab) replaying the pre-logout refresh token:
    const replay = await call("/api/v1/auth/refresh", { method: "POST", jar: { travel_rt: stolenRt }, cookieMode: true, csrf: true });
    expect(replay.status).toBe(401);
  });

  it("a dead refresh cookie is cleared on the failed refresh", async () => {
    const jar: Jar = { travel_rt: "not-a-token" };
    const r = await call("/api/v1/auth/refresh", { method: "POST", jar, cookieMode: true, csrf: true });
    expect(r.status).toBe(401);
    expect(jar.travel_rt).toBeUndefined();
  });

  it("THEFT: replaying a rotated refresh token (after the race window) burns the whole session", async () => {
    const { jar } = await loginCookie();
    const stolenRt = jar.travel_rt!;
    await call("/api/v1/auth/refresh", { method: "POST", jar, cookieMode: true, csrf: true }); // victim rotates legitimately
    const victimRt = jar.travel_rt!;
    await new Promise((r) => setTimeout(r, 11_000)); // outside the 10s multi-tab grace window
    const attacker = await call("/api/v1/auth/refresh", { method: "POST", jar: { travel_rt: stolenRt }, cookieMode: true, csrf: true });
    expect(attacker.status).toBe(401);
    const victim = await call("/api/v1/auth/refresh", { method: "POST", jar: { travel_rt: victimRt }, cookieMode: true, csrf: true });
    expect(victim.status).toBe(401); // family revoked: the victim must sign in again
  }, 30_000);
});
