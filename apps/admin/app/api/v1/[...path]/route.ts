import type { NextRequest } from "next/server";

/**
 * Same-origin proxy to the API gateway. It exists so the httpOnly session
 * cookie is FIRST-PARTY to this app's domain (tenants' custom domains
 * included): the browser only ever talks to this origin, and the cookie the
 * API sets on its response is stored against it. Forwards method, headers
 * (incl. Cookie and the tenant header) and body; returns status, body and
 * every Set-Cookie. The upstream is fixed by server-side config, so it cannot
 * be pointed anywhere else.
 */
export const dynamic = "force-dynamic";

const upstream = () => process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const HOP_BY_HOP = new Set(["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade", "host", "content-length", "accept-encoding"]);

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const url = new URL(req.url);
  const target = `${upstream().replace(/\/+$/, "")}/api/v1/${ctx.params.path.map(encodeURIComponent).join("/")}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-forwarded-host", url.host);
  headers.set("x-forwarded-proto", url.protocol.replace(":", ""));

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json({ success: false, error: { code: "BAD_GATEWAY", message: "The API is unreachable" } }, { status: 502 });
  }

  const out = new Headers();
  res.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // fetch() already decoded the body, so drop encoding/length; Set-Cookie is appended separately (it can repeat).
    if (k !== "set-cookie" && k !== "content-encoding" && !HOP_BY_HOP.has(k)) out.set(key, value);
  });
  for (const cookie of res.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(res.body, { status: res.status, headers: out });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
